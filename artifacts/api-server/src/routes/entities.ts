import { Router } from "express";
import { db } from "@workspace/db";
import { accounts, entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

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

const createEntitySchema = z.object({
  legal_name: z.string().min(1),
  display_name: z.string().min(1),
  short_code: z.string().min(2).max(12).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  entity_type: z.string().min(1).default("LLC"),
  purpose: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = createEntitySchema.parse(req.body);
    const [entity] = await db.insert(entities).values({
      legal_name: body.legal_name,
      display_name: body.display_name,
      short_code: body.short_code,
      entity_type: body.entity_type,
      purpose: body.purpose ?? null,
      tax_classification_note: body.tax_classification_note ?? null,
      primary_color: body.primary_color ?? "#00AEEF",
      secondary_color: body.secondary_color ?? "#0B1726",
      accent_color: body.accent_color ?? "#7DD3FC",
      is_active: true,
    }).returning();

    await db.insert(accounts).values([
      {
        entity_id: entity.id,
        name: `${entity.short_code} Checking`,
        account_type: "checking",
        opening_balance: "0",
        current_balance: "0",
        is_tax_reserve: false,
        is_active: true,
      },
      {
        entity_id: entity.id,
        name: `${entity.short_code} Tax Reserve`,
        account_type: "savings",
        opening_balance: "0",
        current_balance: "0",
        is_tax_reserve: true,
        is_active: true,
      },
    ]);

    await writeAuditLog({
      tableName: "entities",
      recordId: entity.id,
      action: "create",
      newValue: entity,
      memo: "Entity created with default checking and tax reserve accounts.",
    });

    res.status(201).json(entity);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create entity");
    res.status(500).json({ error: "Internal server error" });
  }
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
    await writeAuditLog({
      tableName: "entities",
      recordId: id,
      action: "update",
      newValue: rows[0],
      memo: "Entity settings updated.",
    });
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
