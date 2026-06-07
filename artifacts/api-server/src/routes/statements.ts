import { Router } from "express";
import { db } from "@workspace/db";
import { statements, statement_lines, accounts, reconciliation_matches, transactions, vendors } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/", async (req, res) => {
  try {
    const { account_id } = req.query;
    const rows = await db.select({
      stmt: statements,
      account_name: accounts.name,
    })
      .from(statements)
      .leftJoin(accounts, eq(statements.account_id, accounts.id))
      .orderBy(desc(statements.statement_month));

    const filtered = account_id ? rows.filter(r => r.stmt.account_id === account_id) : rows;

    const stmtIds = filtered.map(r => r.stmt.id);
    const lineMap: Record<string, { unmatched: number; total: number }> = {};
    if (stmtIds.length) {
      const allLines = await db.select().from(statement_lines).where(inArray(statement_lines.statement_id, stmtIds));
      for (const l of allLines) {
        if (!lineMap[l.statement_id]) lineMap[l.statement_id] = { unmatched: 0, total: 0 };
        lineMap[l.statement_id].total++;
        if (l.status === "unmatched") lineMap[l.statement_id].unmatched++;
      }
    }

    res.json(filtered.map(r => ({
      ...r.stmt,
      account_name: r.account_name,
      line_count: lineMap[r.stmt.id]?.total ?? 0,
      unmatched_count: lineMap[r.stmt.id]?.unmatched ?? 0,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list statements");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement not found" });

    const stmtRows = await db.select({
      stmt: statements,
      account_name: accounts.name,
    }).from(statements).leftJoin(accounts, eq(statements.account_id, accounts.id)).where(eq(statements.id, id));
    if (!stmtRows.length) return res.status(404).json({ error: "Statement not found" });

    const lines = await db.select().from(statement_lines).where(eq(statement_lines.statement_id, id)).orderBy(statement_lines.transaction_date);

    const txIds = [...new Set(lines.map(l => l.matched_transaction_id).filter(Boolean))] as string[];
    const txMap: Record<string, string> = {};
    if (txIds.length) {
      const txRows = await db.select({ id: transactions.id, description: transactions.description, vendor_id: transactions.vendor_id }).from(transactions).where(inArray(transactions.id, txIds));
      const vendorIds = [...new Set(txRows.map(t => t.vendor_id).filter(Boolean))] as string[];
      const vendorMap: Record<string, string> = {};
      if (vendorIds.length) {
        const vs = await db.select().from(vendors).where(inArray(vendors.id, vendorIds));
        vs.forEach(v => { vendorMap[v.id] = v.name; });
      }
      txRows.forEach(t => { txMap[t.id] = t.vendor_id ? (vendorMap[t.vendor_id] ?? t.description ?? "") : (t.description ?? ""); });
    }

    res.json({
      statement: { ...stmtRows[0].stmt, account_name: stmtRows[0].account_name },
      lines: lines.map(l => ({
        ...l,
        matched_transaction_description: l.matched_transaction_id ? (txMap[l.matched_transaction_id] ?? null) : null,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/lines", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement not found" });
    const stmtRows = await db.select().from(statements).where(eq(statements.id, id));
    if (!stmtRows.length) return res.status(404).json({ error: "Statement not found" });
    const lines = await db.select().from(statement_lines).where(eq(statement_lines.statement_id, id)).orderBy(statement_lines.transaction_date);
    res.json(lines);
  } catch (err) {
    req.log.error({ err }, "Failed to list statement lines");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createStatementSchema = z.object({
  account_id: z.string().uuid(),
  statement_month: z.string(),
  opening_balance: z.number().nullable().optional(),
  closing_balance: z.number().nullable().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = createStatementSchema.parse(req.body);
    const [stmt] = await db.insert(statements).values({
      account_id: body.account_id,
      statement_month: body.statement_month,
      opening_balance: body.opening_balance != null ? String(body.opening_balance) : null,
      closing_balance: body.closing_balance != null ? String(body.closing_balance) : null,
      status: "uploaded",
    }).returning();

    const acctRows = await db.select().from(accounts).where(eq(accounts.id, body.account_id));
    res.status(201).json({ ...stmt, account_name: acctRows[0]?.name ?? null, line_count: 0, unmatched_count: 0 });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Not found" });

    const updateStatementLineSchema = z.object({
      status: z.enum(["unmatched", "matched", "ignored", "needs_review"]).optional(),
      notes: z.string().nullable().optional(),
    });

    const body = updateStatementLineSchema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (body.status !== undefined) update.status = body.status;
    if (body.notes !== undefined) update.notes = body.notes;

    const lineRows = await db.update(statement_lines).set(update).where(eq(statement_lines.id, id)).returning();
    if (lineRows.length) return res.json(lineRows[0]);

    const stmtRows = await db.update(statements).set({ ...update, updated_at: new Date() }).where(eq(statements.id, id)).returning();
    if (!stmtRows.length) return res.status(404).json({ error: "Not found" });
    const acctRows = await db.select().from(accounts).where(eq(accounts.id, stmtRows[0].account_id));
    res.json({ ...stmtRows[0], account_name: acctRows[0]?.name ?? null });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement not found" });
    const existing = await db.select().from(statements).where(eq(statements.id, id));
    if (!existing.length) return res.status(404).json({ error: "Statement not found" });

    // Guard: refuse to delete statements that have matched lines.
    // Matched lines indicate reconciliation work that would be silently lost.
    const lines = await db.select().from(statement_lines).where(eq(statement_lines.statement_id, id));
    const matchedCount = lines.filter(l => l.status === "matched").length;
    if (matchedCount > 0) {
      return res.status(409).json({
        error: `Cannot delete statement with ${matchedCount} matched line${matchedCount !== 1 ? "s" : ""}. Unmatch all lines first.`,
        matched_count: matchedCount,
      });
    }

    await db.delete(statement_lines).where(eq(statement_lines.statement_id, id));
    await db.delete(statements).where(eq(statements.id, id));
    req.log.info({ id, line_count: lines.length }, "Statement deleted");
    res.json({ deleted: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

const addLinesSchema = z.object({
  lines: z.array(z.object({
    transaction_date: z.string().nullable().optional(),
    posted_date: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    amount: z.number(),
    balance_after: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).min(1),
});

router.post("/:id/lines", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement not found" });
    const stmtRows = await db.select().from(statements).where(eq(statements.id, id));
    if (!stmtRows.length) return res.status(404).json({ error: "Statement not found" });

    const { lines } = addLinesSchema.parse(req.body);
    await db.insert(statement_lines).values(
      lines.map(l => ({
        statement_id: id,
        transaction_date: l.transaction_date ?? null,
        posted_date: l.posted_date ?? null,
        description: l.description ?? null,
        amount: String(l.amount),
        balance_after: l.balance_after != null ? String(l.balance_after) : null,
        notes: l.notes ?? null,
        status: "unmatched" as const,
      }))
    );

    await db.update(statements).set({ status: "reconciling", updated_at: new Date() }).where(eq(statements.id, id));
    const updatedStmt = await db.select().from(statements).where(eq(statements.id, id));
    const allLines = await db.select().from(statement_lines).where(eq(statement_lines.statement_id, id));
    const acctRows = await db.select().from(accounts).where(eq(accounts.id, stmtRows[0].account_id));

    res.json({
      statement: { ...updatedStmt[0], account_name: acctRows[0]?.name ?? null },
      lines: allLines,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to add statement lines");
    res.status(500).json({ error: "Internal server error" });
  }
});

const matchLineSchema = z.object({
  transaction_id: z.string().uuid(),
  match_type: z.string().default("manual"),
});

router.post("/:id/match", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement line not found" });
    const body = matchLineSchema.parse(req.body);
    const rows = await db.update(statement_lines)
      .set({ matched_transaction_id: body.transaction_id, status: "matched" })
      .where(eq(statement_lines.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Statement line not found" });

    await db.insert(reconciliation_matches).values({
      statement_line_id: id,
      transaction_id: body.transaction_id,
      match_type: body.match_type,
      approved_by_user: "true",
    });

    const txRows = await db.select().from(transactions).where(eq(transactions.id, body.transaction_id));
    const tx = txRows[0];
    let txDescription = tx?.description ?? null;
    if (tx?.vendor_id) {
      const vs = await db.select().from(vendors).where(eq(vendors.id, tx.vendor_id));
      if (vs.length) txDescription = vs[0].name;
    }

    res.json({ ...rows[0], matched_transaction_description: txDescription });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to match statement line");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
