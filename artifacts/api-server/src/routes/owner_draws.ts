import { Router } from "express";
import { db, entities, owner_draws } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createOwnerDraw, FinancialOperationError } from "../services/financial-operations";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select({
      draw: owner_draws,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(owner_draws)
      .leftJoin(entities, eq(owner_draws.entity_id, entities.id))
      .orderBy(desc(owner_draws.draw_date), desc(owner_draws.created_at));
    res.json(rows.map((row) => ({
      ...row.draw,
      entity_display_name: row.entity_display_name,
      entity_primary_color: row.entity_primary_color,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list owner draws");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createSchema = z.object({
  entity_id: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  memo: z.string().nullable().optional(),
  draw_date: z.string(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const { draw, entity } = await createOwnerDraw(body);
    res.status(201).json({
      ...draw,
      entity_display_name: entity.display_name,
      entity_primary_color: entity.primary_color,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create owner draw");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
