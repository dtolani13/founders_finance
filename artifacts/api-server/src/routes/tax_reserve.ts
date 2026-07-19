import { Router } from "express";
import { db } from "@workspace/db";
import { tax_reserve_rules, entities, accounts, transactions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { writeAuditLog } from "../lib/audit";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const allEntities = await db.select().from(entities).where(eq(entities.is_active, true));
    const allRules = await db.select().from(tax_reserve_rules);
    const allAccounts = await db.select().from(accounts).where(eq(accounts.is_tax_reserve, true));
    const allTx = await db.select().from(transactions);

    const summaries = allEntities.map(entity => {
      const rule = allRules.find(r => r.entity_id === entity.id && r.is_active);
      const reserveAccounts = allAccounts.filter(a => a.entity_id === entity.id);
      const current_reserve_balance = reserveAccounts.reduce((s, a) => s + parseFloat(String(a.current_balance || 0)), 0);

      const revenueTx = allTx.filter(t => t.transaction_type === "revenue");
      const last_revenue_amount = revenueTx.length
        ? parseFloat(String(revenueTx[revenueTx.length - 1].total_amount))
        : 0;

      const suggested_set_aside = rule
        ? last_revenue_amount * (parseFloat(String(rule.reserve_percent)) / 100)
        : 0;

      return {
        entity,
        rule: rule ? {
          ...rule,
          entity_display_name: entity.display_name,
        } : null,
        current_reserve_balance,
        suggested_set_aside,
        last_revenue_amount,
      };
    });

    res.json(summaries);
  } catch (err) {
    req.log.error({ err }, "Failed to get tax reserve summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createRuleSchema = z.object({
  entity_id: z.string().uuid(),
  reserve_percent: z.number().min(0).max(100),
  rule_basis: z.enum(["revenue", "net_income", "manual"]),
  notes: z.string().nullable().optional(),
});

router.post("/rules", async (req, res) => {
  try {
    const body = createRuleSchema.parse(req.body);
    const entityRows = await db.select().from(entities).where(eq(entities.id, body.entity_id));
    if (!entityRows.length) return res.status(400).json({ error: "Entity not found" });

    const rule = await db.transaction(async (tx) => {
      const previousRules = await tx.select().from(tax_reserve_rules)
        .where(eq(tax_reserve_rules.entity_id, body.entity_id));
      await tx.update(tax_reserve_rules)
        .set({ is_active: false, updated_at: new Date() })
        .where(eq(tax_reserve_rules.entity_id, body.entity_id));
      const [created] = await tx.insert(tax_reserve_rules).values({
        entity_id: body.entity_id,
        reserve_percent: String(body.reserve_percent),
        rule_basis: body.rule_basis,
        notes: body.notes ?? null,
        is_active: true,
      }).returning();
      await writeAuditLog({
        tableName: "tax_reserve_rules",
        recordId: created.id,
        action: "replace_active_rule",
        previousValue: previousRules,
        newValue: created,
      }, tx);
      return created;
    });

    res.status(201).json({ ...rule, entity_display_name: entityRows[0].display_name });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create tax reserve rule");
    res.status(500).json({ error: "Internal server error" });
  }
});

const suggestSchema = z.object({
  entity_id: z.string().uuid(),
  revenue_amount: z.number().positive(),
});

router.post("/suggest-transfer", async (req, res) => {
  try {
    const body = suggestSchema.parse(req.body);
    const rules = await db.select().from(tax_reserve_rules)
      .where(eq(tax_reserve_rules.entity_id, body.entity_id));
    const rule = rules.find(r => r.is_active);

    if (!rule) {
      return res.status(400).json({ error: "No active tax reserve rule for this entity" });
    }

    const pct = parseFloat(String(rule.reserve_percent));
    const suggested_amount = body.revenue_amount * (pct / 100);

    res.json({
      entity_id: body.entity_id,
      suggested_amount,
      reserve_percent: pct,
      basis: rule.rule_basis,
      disclaimer: "This is an estimate only. This is not tax advice. Consult a qualified tax professional for actual tax obligations.",
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to suggest tax transfer");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
