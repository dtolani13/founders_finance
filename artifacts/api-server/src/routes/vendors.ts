import { Router } from "express";
import { db } from "@workspace/db";
import { vendors } from "@workspace/db";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = req.query.include_inactive === "true"
      ? await db.select().from(vendors).orderBy(vendors.name)
      : await db.select().from(vendors).where(eq(vendors.is_active, true)).orderBy(vendors.name);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const body = createVendorSchema.partial().extend({ is_active: z.boolean().optional() }).parse(req.body);
    const existing = await db.select().from(vendors).where(eq(vendors.id, req.params.id));
    if (!existing.length) return res.status(404).json({ error: "Vendor not found" });
    const record = await db.transaction(async (tx) => {
      const [updated] = await tx.update(vendors).set({ ...body, updated_at: new Date() }).where(eq(vendors.id, req.params.id)).returning();
      await writeAuditLog({ tableName: "vendors", recordId: updated.id, action: body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update", previousValue: existing[0], newValue: updated }, tx);
      return updated;
    });
    return res.json(record);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update vendor");
    return res.status(500).json({ error: "Internal server error" });
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
    const vendor = await db.transaction(async (tx) => {
      const [created] = await tx.insert(vendors).values(body).returning();
      await writeAuditLog({ tableName: "vendors", recordId: created.id, action: "create", newValue: created }, tx);
      return created;
    });
    res.status(201).json(vendor);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create vendor");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
