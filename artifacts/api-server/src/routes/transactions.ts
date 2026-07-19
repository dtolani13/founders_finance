import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, transaction_lines, expense_allocations,
  vendors, entities, accounts, categories,
  audit_log, documents,
} from "@workspace/db";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  AccountingError,
  createTransactionHeader,
  postTransaction,
  replaceTransactionLines,
  updateTransactionRecord,
  voidTransaction,
} from "../services/accounting";
import { toPublicDocument } from "../services/evidence-storage";

const router = Router();

const createTransactionSchema = z.object({
  transaction_date: z.string(),
  transaction_type: z.enum(["owner_contribution","owner_reimbursement","business_expense","shared_expense_allocation","intercompany_reimbursement","owner_draw","transfer","asset_purchase","revenue","adjustment"]),
  description: z.string().min(1),
  vendor_id: z.string().uuid().nullable().optional(),
  total_amount: z.number().positive("Amount must be positive"),
  business_purpose: z.string().nullable().optional(),
});

const updateTransactionSchema = z.object({
  transaction_date: z.string().optional(),
  description: z.string().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  total_amount: z.number().positive().optional(),
  business_purpose: z.string().nullable().optional(),
});

async function enrichTransactions(rows: typeof transactions.$inferSelect[]) {
  const vendorIds = [...new Set(rows.map(r => r.vendor_id).filter(Boolean))] as string[];
  const vendorMap: Record<string, string> = {};
  if (vendorIds.length) {
    const vs = await db.select().from(vendors).where(inArray(vendors.id, vendorIds));
    vs.forEach(v => { vendorMap[v.id] = v.name; });
  }

  const txIds = rows.map(r => r.id);
  const lineCounts: Record<string, number> = {};
  const allocCounts: Record<string, number> = {};

  if (txIds.length) {
    const lc = await db.select({ tx_id: transaction_lines.transaction_id, count: sql<number>`count(*)`.mapWith(Number) })
      .from(transaction_lines).where(inArray(transaction_lines.transaction_id, txIds)).groupBy(transaction_lines.transaction_id);
    lc.forEach(r => { lineCounts[r.tx_id] = r.count; });

    const ac = await db.select({ tx_id: expense_allocations.transaction_id, count: sql<number>`count(*)`.mapWith(Number) })
      .from(expense_allocations).where(inArray(expense_allocations.transaction_id, txIds)).groupBy(expense_allocations.transaction_id);
    ac.forEach(r => { allocCounts[r.tx_id] = r.count; });
  }

  return rows.map(r => ({
    ...r,
    vendor_name: r.vendor_id ? vendorMap[r.vendor_id] ?? null : null,
    line_count: lineCounts[r.id] ?? 0,
    allocation_count: allocCounts[r.id] ?? 0,
  }));
}

router.get("/", async (req, res) => {
  try {
    const { entity_id, transaction_type, status, date_from, date_to } = req.query;

    let rows = await db.select().from(transactions).orderBy(desc(transactions.transaction_date), desc(transactions.created_at));

    if (transaction_type) rows = rows.filter(r => r.transaction_type === transaction_type);
    if (status) rows = rows.filter(r => r.status === status);
    if (date_from) rows = rows.filter(r => r.transaction_date >= (date_from as string));
    if (date_to) rows = rows.filter(r => r.transaction_date <= (date_to as string));

    if (entity_id) {
      const entityTxIds = await db.select({ transaction_id: transaction_lines.transaction_id })
        .from(transaction_lines).where(eq(transaction_lines.entity_id, entity_id as string));
      const allocTxIds = await db.select({ transaction_id: expense_allocations.transaction_id })
        .from(expense_allocations).where(eq(expense_allocations.target_entity_id, entity_id as string));
      const allIds = new Set([...entityTxIds.map(r => r.transaction_id), ...allocTxIds.map(r => r.transaction_id)]);
      rows = rows.filter(r => allIds.has(r.id));
    }

    const enriched = await enrichTransactions(rows);
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const body = createTransactionSchema.parse(req.body);
    const created = await createTransactionHeader(body);
    const [enriched] = await enrichTransactions([created]);
    res.status(201).json(enriched);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(transactions).where(eq(transactions.id, id));
    if (!rows.length) return res.status(404).json({ error: "Transaction not found" });

    const lines = await db.select({
      line: transaction_lines,
      entity_short_code: entities.short_code,
      account_name: accounts.name,
      category_name: categories.name,
    })
      .from(transaction_lines)
      .leftJoin(entities, eq(transaction_lines.entity_id, entities.id))
      .leftJoin(accounts, eq(transaction_lines.account_id, accounts.id))
      .leftJoin(categories, eq(transaction_lines.category_id, categories.id))
      .where(eq(transaction_lines.transaction_id, id));

    const allocs = await db.select({
      alloc: expense_allocations,
      entity_short_code: entities.short_code,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(expense_allocations)
      .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
      .where(eq(expense_allocations.transaction_id, id));

    const [enriched] = await enrichTransactions(rows);
    const evidence = await db.select().from(documents).where(eq(documents.transaction_id, id));
    const audit = await db.select().from(audit_log).where(eq(audit_log.record_id, id)).orderBy(desc(audit_log.created_at));
    res.json({
      transaction: enriched,
      lines: lines.map(l => ({ ...l.line, entity_short_code: l.entity_short_code, account_name: l.account_name, category_name: l.category_name })),
      allocations: allocs.map(a => ({ ...a.alloc, entity_short_code: a.entity_short_code, entity_display_name: a.entity_display_name, entity_primary_color: a.entity_primary_color })),
      evidence: evidence.map(toPublicDocument),
      audit,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = updateTransactionSchema.parse(req.body);
    const updated = await updateTransactionRecord(id, body);
    const [enriched] = await enrichTransactions([updated]);
    res.json(enriched);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to update transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

const addLinesSchema = z.object({
  lines: z.array(z.object({
    entity_id: z.string().uuid().nullable().optional(),
    account_id: z.string().uuid().nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    debit: z.number().min(0),
    credit: z.number().min(0),
    memo: z.string().nullable().optional(),
  })).min(1),
});

router.post("/:id/lines", async (req, res) => {
  try {
    const { id } = req.params;
    const { lines } = addLinesSchema.parse(req.body);
    await replaceTransactionLines(id, lines);

    const result = await db.select({
      line: transaction_lines,
      entity_short_code: entities.short_code,
      account_name: accounts.name,
      category_name: categories.name,
    })
      .from(transaction_lines)
      .leftJoin(entities, eq(transaction_lines.entity_id, entities.id))
      .leftJoin(accounts, eq(transaction_lines.account_id, accounts.id))
      .leftJoin(categories, eq(transaction_lines.category_id, categories.id))
      .where(eq(transaction_lines.transaction_id, id));

    const txFinal = await db.select().from(transactions).where(eq(transactions.id, id));
    const allocs = await db.select({
      alloc: expense_allocations,
      entity_short_code: entities.short_code,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(expense_allocations)
      .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
      .where(eq(expense_allocations.transaction_id, id));
    const [enriched] = await enrichTransactions(txFinal);
    res.json({
      transaction: enriched,
      lines: result.map(l => ({ ...l.line, entity_short_code: l.entity_short_code, account_name: l.account_name, category_name: l.category_name })),
      allocations: allocs.map(a => ({
        ...a.alloc,
        entity_short_code: a.entity_short_code,
        entity_display_name: a.entity_display_name,
        entity_primary_color: a.entity_primary_color,
      })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to add transaction lines");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Soft-delete: sets status to "voided" instead of hard-deleting.
// Posted transactions are protected — void them explicitly via POST /:id/void.
// Hard deletion of financial records is not supported.
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await voidTransaction(id);
    const [enriched] = await enrichTransactions([updated]);
    return res.json({ voided: true, transaction: enriched });
  } catch (err) {
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to void transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/void", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await voidTransaction(id, { allowPosted: true });
    const [enriched] = await enrichTransactions([updated]);
    return res.json(enriched);
  } catch (err) {
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to void transaction");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/balance-check", async (req, res) => {
  try {
    const { id } = req.params;
    const lines = await db.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, id));
    const totalDebits = lines.reduce((s, l) => s + parseFloat(String(l.debit)), 0);
    const totalCredits = lines.reduce((s, l) => s + parseFloat(String(l.credit)), 0);
    const difference = Math.abs(totalDebits - totalCredits);
    const isBalanced = difference < 0.01;
    res.json({ is_balanced: isBalanced, total_debits: totalDebits, total_credits: totalCredits, difference });
  } catch (err) {
    req.log.error({ err }, "Failed to check balance");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/post", async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await postTransaction(id);
    const [enriched] = await enrichTransactions([updated]);
    res.json(enriched);
  } catch (err) {
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to post transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
