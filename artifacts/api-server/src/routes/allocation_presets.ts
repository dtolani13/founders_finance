import { Router } from "express";
import { db } from "@workspace/db";
import { allocation_presets, allocation_preset_lines, entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

const router = Router();

async function presetsWithLines(presetRows: typeof allocation_presets.$inferSelect[]) {
  if (!presetRows.length) return [];
  const presetIds = presetRows.map(p => p.id);
  const lines = await db.select({
    line: allocation_preset_lines,
    entity_short_code: entities.short_code,
    entity_display_name: entities.display_name,
    entity_primary_color: entities.primary_color,
  })
    .from(allocation_preset_lines)
    .leftJoin(entities, eq(allocation_preset_lines.entity_id, entities.id));

  const linesByPreset: Record<string, typeof lines> = {};
  lines.forEach(l => {
    if (presetIds.includes(l.line.preset_id)) {
      if (!linesByPreset[l.line.preset_id]) linesByPreset[l.line.preset_id] = [];
      linesByPreset[l.line.preset_id].push(l);
    }
  });

  return presetRows.map(p => ({
    ...p,
    lines: (linesByPreset[p.id] ?? []).map(l => ({
      ...l.line,
      entity_short_code: l.entity_short_code,
      entity_display_name: l.entity_display_name,
      entity_primary_color: l.entity_primary_color,
    })),
  }));
}

router.get("/", async (req, res) => {
  try {
    const rows = req.query.include_inactive === "true"
      ? await db.select().from(allocation_presets)
      : await db.select().from(allocation_presets).where(eq(allocation_presets.is_active, true));
    res.json(await presetsWithLines(rows));
  } catch (err) {
    req.log.error({ err }, "Failed to list allocation presets");
    res.status(500).json({ error: "Internal server error" });
  }
});

const presetBase = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().nullable().optional(),
  lines: z.array(z.object({ entity_id: z.string().uuid(), percent: z.number().positive().max(100) })).min(1),
});

const presetBody = presetBase.superRefine((value, context) => {
  const total = value.lines.reduce((sum, line) => sum + line.percent, 0);
  if (Math.abs(total - 100) > 0.001) context.addIssue({ code: "custom", path: ["lines"], message: "Preset percentages must total 100%." });
  if (new Set(value.lines.map((line) => line.entity_id)).size !== value.lines.length) context.addIssue({ code: "custom", path: ["lines"], message: "Each company can appear only once." });
});

router.post("/", async (req, res) => {
  try {
    const body = presetBody.parse(req.body);
    const preset = await db.transaction(async (tx) => {
      const [created] = await tx.insert(allocation_presets).values({ name: body.name, description: body.description }).returning();
      const lines = await tx.insert(allocation_preset_lines).values(body.lines.map((line) => ({ preset_id: created.id, entity_id: line.entity_id, percent: String(line.percent) }))).returning();
      await writeAuditLog({ tableName: "allocation_presets", recordId: created.id, action: "create", newValue: { preset: created, lines } }, tx);
      return created;
    });
    const [result] = await presetsWithLines([preset]);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create allocation preset");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const body = presetBase.partial().extend({ is_active: z.boolean().optional() }).parse(req.body);
    const existing = await db.select().from(allocation_presets).where(eq(allocation_presets.id, req.params.id));
    if (!existing.length) return res.status(404).json({ error: "Preset not found" });
    const current = (await presetsWithLines(existing))[0];
    const preset = await db.transaction(async (tx) => {
      const [updated] = await tx.update(allocation_presets).set({ name: body.name, description: body.description, is_active: body.is_active, updated_at: new Date() }).where(eq(allocation_presets.id, req.params.id)).returning();
      if (body.lines) {
        const total = body.lines.reduce((sum, line) => sum + line.percent, 0);
        if (Math.abs(total - 100) > 0.001) throw new Error("Preset percentages must total 100%.");
        if (new Set(body.lines.map((line) => line.entity_id)).size !== body.lines.length) {
          throw new Error("Each company can appear only once.");
        }
        await tx.delete(allocation_preset_lines).where(eq(allocation_preset_lines.preset_id, req.params.id));
        await tx.insert(allocation_preset_lines).values(body.lines.map((line) => ({ preset_id: req.params.id, entity_id: line.entity_id, percent: String(line.percent) })));
      }
      const newLines = await tx.select().from(allocation_preset_lines).where(eq(allocation_preset_lines.preset_id, req.params.id));
      await writeAuditLog({ tableName: "allocation_presets", recordId: updated.id, action: body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update", previousValue: current, newValue: { preset: updated, lines: newLines } }, tx);
      return updated;
    });
    const [result] = await presetsWithLines([preset]);
    return res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof Error && (err.message.includes("total 100") || err.message.includes("only once"))) {
      return res.status(400).json({ error: err.message });
    }
    req.log.error({ err }, "Failed to update allocation preset");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(allocation_presets).where(eq(allocation_presets.id, id));
    if (!rows.length) return res.status(404).json({ error: "Preset not found" });
    const [result] = await presetsWithLines(rows);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get allocation preset");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
