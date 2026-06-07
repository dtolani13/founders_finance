import { Router } from "express";
import { db } from "@workspace/db";
import { accounts, entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query["include_inactive"] === "true";
    const rows = includeInactive
      ? await db.select().from(entities)
      : await db.select().from(entities).where(eq(entities.is_active, true));
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

const lifecycleSchema = z.object({
  archive_until: z.coerce.date().nullable().optional(),
  archive_reason: z.string().nullable().optional(),
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
      lifecycle_status: "active",
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

router.post("/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const body = lifecycleSchema.parse(req.body ?? {});
    const [existing] = await db.select().from(entities).where(eq(entities.id, id));
    if (!existing) return res.status(404).json({ error: "Entity not found" });
    if (existing.short_code === "PERSONAL") {
      return res.status(400).json({ error: "Personal founder record cannot be closed." });
    }

    const now = new Date();
    const rows = await db.update(entities)
      .set({
        lifecycle_status: "closed",
        is_active: false,
        closed_at: existing.closed_at ?? now,
        archive_until: body.archive_until ?? existing.archive_until,
        archive_reason: body.archive_reason ?? existing.archive_reason,
        updated_at: now,
      })
      .where(eq(entities.id, id))
      .returning();

    await db.update(accounts)
      .set({ is_active: false, updated_at: now })
      .where(eq(accounts.entity_id, id));

    await writeAuditLog({
      tableName: "entities",
      recordId: id,
      action: "close",
      previousValue: existing,
      newValue: rows[0],
      memo: "Entity closed. Records preserved and entity accounts deactivated.",
    });

    res.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to close entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;
    const body = lifecycleSchema.parse(req.body ?? {});
    const [existing] = await db.select().from(entities).where(eq(entities.id, id));
    if (!existing) return res.status(404).json({ error: "Entity not found" });
    if (existing.short_code === "PERSONAL") {
      return res.status(400).json({ error: "Personal founder record cannot be archived." });
    }

    const now = new Date();
    const rows = await db.update(entities)
      .set({
        lifecycle_status: "archived",
        is_active: false,
        closed_at: existing.closed_at ?? now,
        archive_until: body.archive_until ?? existing.archive_until,
        archive_reason: body.archive_reason ?? existing.archive_reason ?? "Archived for recordkeeping.",
        updated_at: now,
      })
      .where(eq(entities.id, id))
      .returning();

    await db.update(accounts)
      .set({ is_active: false, updated_at: now })
      .where(eq(accounts.entity_id, id));

    await writeAuditLog({
      tableName: "entities",
      recordId: id,
      action: "archive",
      previousValue: existing,
      newValue: rows[0],
      memo: "Entity archived for recordkeeping. Records preserved and entity accounts deactivated.",
    });

    res.json(rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to archive entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reopen", async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await db.select().from(entities).where(eq(entities.id, id));
    if (!existing) return res.status(404).json({ error: "Entity not found" });

    const now = new Date();
    const rows = await db.update(entities)
      .set({
        lifecycle_status: "active",
        is_active: true,
        closed_at: null,
        updated_at: now,
      })
      .where(eq(entities.id, id))
      .returning();

    await db.update(accounts)
      .set({ is_active: true, updated_at: now })
      .where(eq(accounts.entity_id, id));

    await writeAuditLog({
      tableName: "entities",
      recordId: id,
      action: "reopen",
      previousValue: existing,
      newValue: rows[0],
      memo: "Entity reopened and entity accounts reactivated.",
    });

    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to reopen entity");
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
