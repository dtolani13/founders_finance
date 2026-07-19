import { Router } from "express";
import { db } from "@workspace/db";
import { accounts, entities } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { entity_id, include_inactive } = req.query;
    const conditions = entity_id
      ? and(include_inactive === "true" ? undefined : eq(accounts.is_active, true), eq(accounts.entity_id, entity_id as string))
      : include_inactive === "true" ? undefined : eq(accounts.is_active, true);
    const rows = await db.select().from(accounts).where(conditions);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

const accountBody = z.object({
  entity_id: z.string().uuid(),
  name: z.string().trim().min(1),
  account_type: z.enum(["checking", "savings", "credit_card", "cash", "loan", "other"]),
  institution_name: z.string().trim().nullable().optional(),
  last_four: z.string().regex(/^\d{4}$/).nullable().optional(),
  opening_balance: z.number().optional(),
  is_tax_reserve: z.boolean().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = accountBody.parse(req.body);
    const entityRows = await db.select().from(entities).where(eq(entities.id, body.entity_id));
    if (!entityRows[0]?.is_active) return res.status(409).json({ error: "Accounts can only be added to an active company." });
    const account = await db.transaction(async (tx) => {
      const [created] = await tx.insert(accounts).values({
        ...body,
        opening_balance: String(body.opening_balance ?? 0),
        current_balance: String(body.opening_balance ?? 0),
      }).returning();
      await writeAuditLog({ tableName: "accounts", recordId: created.id, action: "create", newValue: created }, tx);
      return created;
    });
    res.status(201).json(account);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

const updateAccountBody = accountBody.omit({ entity_id: true, opening_balance: true }).partial().extend({ is_active: z.boolean().optional() });

router.put("/:id", async (req, res) => {
  try {
    const body = updateAccountBody.parse(req.body);
    const existing = await db.select().from(accounts).where(eq(accounts.id, req.params.id));
    if (!existing.length) return res.status(404).json({ error: "Account not found" });
    const updated = await db.transaction(async (tx) => {
      const [record] = await tx.update(accounts).set({ ...body, updated_at: new Date() }).where(eq(accounts.id, req.params.id)).returning();
      await writeAuditLog({ tableName: "accounts", recordId: record.id, action: body.is_active === false ? "deactivate" : body.is_active === true ? "reactivate" : "update", previousValue: existing[0], newValue: record }, tx);
      return record;
    });
    return res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update account");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!rows.length) return res.status(404).json({ error: "Account not found" });
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
