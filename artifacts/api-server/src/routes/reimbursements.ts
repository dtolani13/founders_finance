import { Router } from "express";
import { db } from "@workspace/db";
import { reimbursement_requests, entities } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { FinancialOperationError, settleReimbursement } from "../services/financial-operations";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select({
      req: reimbursement_requests,
      owed_to_name: entities.display_name,
      owed_to_color: entities.primary_color,
    })
      .from(reimbursement_requests)
      .leftJoin(entities, eq(reimbursement_requests.owed_to_entity_id, entities.id))
      .orderBy(desc(reimbursement_requests.created_at));

    const allEntities = await db.select({ id: entities.id, display_name: entities.display_name, primary_color: entities.primary_color }).from(entities);
    const entityMap: Record<string, { display_name: string; primary_color: string | null }> = {};
    allEntities.forEach(e => { entityMap[e.id] = e; });

    res.json(rows.map(r => ({
      ...r.req,
      owed_to_entity_name: r.owed_to_name,
      owed_to_entity_color: r.owed_to_color,
      owed_by_entity_name: entityMap[r.req.owed_by_entity_id]?.display_name ?? null,
      owed_by_entity_color: entityMap[r.req.owed_by_entity_id]?.primary_color ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list reimbursements");
    res.status(500).json({ error: "Internal server error" });
  }
});

const markPaidSchema = z.object({
  payment_date: z.string().optional(),
  memo: z.string().nullable().optional(),
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const { id } = req.params;
    const body = markPaidSchema.parse(req.body);
    const r = await settleReimbursement(id, body);

    const allEntities = await db.select({ id: entities.id, display_name: entities.display_name, primary_color: entities.primary_color }).from(entities);
    const entityMap: Record<string, { display_name: string; primary_color: string | null }> = {};
    allEntities.forEach(e => { entityMap[e.id] = e; });

    res.json({
      ...r,
      owed_to_entity_name: entityMap[r.owed_to_entity_id]?.display_name ?? null,
      owed_to_entity_color: entityMap[r.owed_to_entity_id]?.primary_color ?? null,
      owed_by_entity_name: entityMap[r.owed_by_entity_id]?.display_name ?? null,
      owed_by_entity_color: entityMap[r.owed_by_entity_id]?.primary_color ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to mark reimbursement paid");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
