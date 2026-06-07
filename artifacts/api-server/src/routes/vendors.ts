import { Router } from "express";
import { db } from "@workspace/db";
import { vendors } from "@workspace/db";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(vendors).orderBy(vendors.name);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createVendorSchema = z.object({
  name: z.string().min(1),
  default_category_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = createVendorSchema.parse(req.body);
    const rows = await db.insert(vendors).values(body).returning();
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
