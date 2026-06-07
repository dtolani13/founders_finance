import { Router } from "express";
import { db } from "@workspace/db";
import { entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(entities).where(eq(entities.is_active, true));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list entities");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(entities).where(eq(entities.id, id));
    if (!rows.length) return res.status(404).json({ error: "Entity not found" });
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateEntitySchema = z.object({
  display_name: z.string().optional(),
  purpose: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
  logo_path: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = updateEntitySchema.parse(req.body);
    const rows = await db.update(entities)
      .set({ ...body, updated_at: new Date() })
      .where(eq(entities.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Entity not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
