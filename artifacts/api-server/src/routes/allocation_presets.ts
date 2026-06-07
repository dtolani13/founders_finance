import { Router } from "express";
import { db } from "@workspace/db";
import { allocation_presets, allocation_preset_lines, entities } from "@workspace/db";
import { eq } from "drizzle-orm";

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
    const rows = await db.select().from(allocation_presets).where(eq(allocation_presets.is_active, true));
    res.json(await presetsWithLines(rows));
  } catch (err) {
    req.log.error({ err }, "Failed to list allocation presets");
    res.status(500).json({ error: "Internal server error" });
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
