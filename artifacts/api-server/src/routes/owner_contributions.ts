import { Router } from "express";
import { db } from "@workspace/db";
import { owner_contributions, entities } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { createOwnerContribution, FinancialOperationError } from "../services/financial-operations";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select({
      contrib: owner_contributions,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(owner_contributions)
      .leftJoin(entities, eq(owner_contributions.entity_id, entities.id))
      .orderBy(desc(owner_contributions.created_at));

    res.json(rows.map(r => ({
      ...r.contrib,
      entity_display_name: r.entity_display_name,
      entity_primary_color: r.entity_primary_color,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list owner contributions");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createSchema = z.object({
  entity_id: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  contribution_type: z.enum(["capital_contribution", "owner_loan"]).default("capital_contribution"),
  memo: z.string().nullable().optional(),
  contribution_date: z.string(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);

    const { contribution: contrib, entity } = await createOwnerContribution(body);

    res.status(201).json({
      ...contrib,
      entity_display_name: entity.display_name,
      entity_primary_color: entity.primary_color,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create owner contribution");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
