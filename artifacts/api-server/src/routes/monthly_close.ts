import { Router } from "express";
import { db } from "@workspace/db";
import { monthly_close_periods, entities } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { entity_id } = req.query;
    const rows = await db.select({
      period: monthly_close_periods,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(monthly_close_periods)
      .leftJoin(entities, eq(monthly_close_periods.entity_id, entities.id))
      .orderBy(desc(monthly_close_periods.period_month));

    const filtered = entity_id ? rows.filter(r => r.period.entity_id === entity_id) : rows;
    res.json(filtered.map(r => ({
      ...r.period,
      entity_display_name: r.entity_display_name,
      entity_primary_color: r.entity_primary_color,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list monthly close periods");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createSchema = z.object({
  entity_id: z.string().uuid(),
  period_month: z.string(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const entityRows = await db.select().from(entities).where(eq(entities.id, body.entity_id));
    if (!entityRows.length) return res.status(400).json({ error: "Entity not found" });

    const [period] = await db.insert(monthly_close_periods).values({
      entity_id: body.entity_id,
      period_month: body.period_month,
      status: "open",
    }).returning();

    res.status(201).json({
      ...period,
      entity_display_name: entityRows[0].display_name,
      entity_primary_color: entityRows[0].primary_color,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create monthly close period");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateSchema = z.object({
  status: z.enum(["open", "review", "closed", "reopened"]).optional(),
  all_statements_uploaded: z.boolean().nullable().optional(),
  all_transactions_reconciled: z.boolean().nullable().optional(),
  all_receipts_attached: z.boolean().nullable().optional(),
  all_allocations_complete: z.boolean().nullable().optional(),
  intercompany_reviewed: z.boolean().nullable().optional(),
  tax_reserve_reviewed: z.boolean().nullable().optional(),
  export_generated: z.boolean().nullable().optional(),
  correction_memo: z.string().nullable().optional(),
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = updateSchema.parse(req.body);

    // Require correction memo if already closed
    const existing = await db.select().from(monthly_close_periods).where(eq(monthly_close_periods.id, id));
    if (!existing.length) return res.status(404).json({ error: "Period not found" });

    if (existing[0].status === "closed" && !body.correction_memo) {
      return res.status(409).json({ error: "A correction memo is required when editing a closed period" });
    }

    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status !== undefined) {
      update.status = body.status;
      if (body.status === "closed") update.closed_at = new Date();
    }
    if (body.all_statements_uploaded != null) update.all_statements_uploaded = body.all_statements_uploaded;
    if (body.all_transactions_reconciled != null) update.all_transactions_reconciled = body.all_transactions_reconciled;
    if (body.all_receipts_attached != null) update.all_receipts_attached = body.all_receipts_attached;
    if (body.all_allocations_complete != null) update.all_allocations_complete = body.all_allocations_complete;
    if (body.intercompany_reviewed != null) update.intercompany_reviewed = body.intercompany_reviewed;
    if (body.tax_reserve_reviewed != null) update.tax_reserve_reviewed = body.tax_reserve_reviewed;
    if (body.export_generated != null) update.export_generated = body.export_generated;

    const rows = await db.update(monthly_close_periods).set(update).where(eq(monthly_close_periods.id, id)).returning();
    const entityRows = await db.select().from(entities).where(eq(entities.id, rows[0].entity_id));

    res.json({
      ...rows[0],
      entity_display_name: entityRows[0]?.display_name ?? null,
      entity_primary_color: entityRows[0]?.primary_color ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update monthly close period");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
