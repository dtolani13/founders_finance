import { Router } from "express";
import { db } from "@workspace/db";
import { monthly_close_periods, entities } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  createMonthlyClosePeriod,
  FinancialOperationError,
  updateMonthlyClosePeriod,
} from "../services/financial-operations";

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
    const { period, entity } = await createMonthlyClosePeriod(body);

    res.status(201).json({
      ...period,
      entity_display_name: entity.display_name,
      entity_primary_color: entity.primary_color,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
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

    const { period, entity } = await updateMonthlyClosePeriod(id, body);

    res.json({
      ...period,
      entity_display_name: entity?.display_name ?? null,
      entity_primary_color: entity?.primary_color ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to update monthly close period");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
