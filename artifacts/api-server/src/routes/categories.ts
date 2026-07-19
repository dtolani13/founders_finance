import { Router } from "express";
import { db } from "@workspace/db";
import { categories } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = req.query.include_inactive === "true"
      ? await db.select().from(categories)
      : await db.select().from(categories).where(eq(categories.is_active, true));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

const categoryBody = z.object({
  name: z.string().trim().min(1),
  category_type: z.enum(["expense", "income", "asset", "liability", "equity", "other"]),
  description: z.string().trim().nullable().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = categoryBody.parse(req.body);
    const record = await db.transaction(async (tx) => {
      const [created] = await tx.insert(categories).values(body).returning();
      await writeAuditLog({ tableName: "categories", recordId: created.id, action: "create", newValue: created }, tx);
      return created;
    });
    res.status(201).json(record);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const body = categoryBody.partial().extend({ is_active: z.boolean().optional() }).parse(req.body);
    const existing = await db.select().from(categories).where(eq(categories.id, req.params.id));
    if (!existing.length) return res.status(404).json({ error: "Category not found" });
    const record = await db.transaction(async (tx) => {
      const [updated] = await tx.update(categories).set(body).where(eq(categories.id, req.params.id)).returning();
      await writeAuditLog({ tableName: "categories", recordId: updated.id, action: body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update", previousValue: existing[0], newValue: updated }, tx);
      return updated;
    });
    return res.json(record);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update category");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
