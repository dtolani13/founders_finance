import { extname } from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { statements, statement_lines, accounts, transactions, transaction_lines, vendors } from "@workspace/db";
import { and, eq, desc, inArray, isNull } from "drizzle-orm";
import multer from "multer";
import { z } from "zod";
import { archiveStatement, FinancialOperationError, importStatementLines, matchStatementLine } from "../services/financial-operations";
import {
  inspectStatementCsv,
  MAX_STATEMENT_CSV_BYTES,
  parseStatementCsv,
  statementLineFingerprint,
  type ParsedStatementImportRow,
} from "../services/statement-import";

const router = Router();

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_STATEMENT_CSV_BYTES, files: 1, fields: 10, fieldSize: 16 * 1024, parts: 12 },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    const allowedMime = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"]);
    if (extension !== ".csv" || !allowedMime.has(file.mimetype.toLowerCase())) {
      callback(new Error("Choose a CSV file."));
      return;
    }
    callback(null, true);
  },
});

function receiveCsv(req: Request, res: Response, next: NextFunction) {
  csvUpload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Statement CSV files cannot exceed 2 MB.", code: error.code });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid CSV upload." });
  });
}

const importMappingSchema = z.object({
  transaction_date_column: z.string().min(1),
  posted_date_column: z.string().optional(),
  description_column: z.string().min(1),
  amount_column: z.string().optional(),
  debit_column: z.string().optional(),
  credit_column: z.string().optional(),
  balance_column: z.string().optional(),
  skip_duplicates: z.enum(["true", "false"]).optional().default("false"),
});

function mappingFrom(body: z.infer<typeof importMappingSchema>) {
  return {
    transactionDateColumn: body.transaction_date_column,
    postedDateColumn: body.posted_date_column || undefined,
    descriptionColumn: body.description_column,
    amountColumn: body.amount_column || undefined,
    debitColumn: body.debit_column || undefined,
    creditColumn: body.credit_column || undefined,
    balanceColumn: body.balance_column || undefined,
  };
}

async function requireMutableStatement(id: string) {
  if (!uuidRe.test(id)) throw new FinancialOperationError("Statement not found.", 404, "STATEMENT_NOT_FOUND");
  const rows = await db.select().from(statements).where(eq(statements.id, id));
  if (!rows.length) throw new FinancialOperationError("Statement not found.", 404, "STATEMENT_NOT_FOUND");
  if (rows[0].archived_at) throw new FinancialOperationError("Archived statements are read-only.", 409, "STATEMENT_ARCHIVED");
  return rows[0];
}

function uniqueImportedRows(rows: ParsedStatementImportRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const fingerprint = statementLineFingerprint(row);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

router.post("/:id/import/inspect", receiveCsv, async (req, res) => {
  try {
    const statementId = String(req.params.id);
    await requireMutableStatement(statementId);
    if (!req.file) return res.status(400).json({ error: "Choose a CSV file." });
    res.json(inspectStatementCsv(req.file.buffer));
  } catch (error) {
    if (error instanceof FinancialOperationError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not read the CSV file." });
  }
});

router.post("/:id/import/preview", receiveCsv, async (req, res) => {
  try {
    const statementId = String(req.params.id);
    await requireMutableStatement(statementId);
    if (!req.file) return res.status(400).json({ error: "Choose a CSV file." });
    const body = importMappingSchema.parse(req.body);
    const parsed = parseStatementCsv(req.file.buffer, mappingFrom(body));
    const existing = await db.select().from(statement_lines).where(eq(statement_lines.statement_id, statementId));
    const fingerprints = new Set(existing.filter((row) => row.transaction_date).map((row) => statementLineFingerprint({
      transaction_date: row.transaction_date!,
      description: row.description ?? "",
      amount: Number(row.amount),
      balance_after: row.balance_after == null ? null : Number(row.balance_after),
    })));
    const existingDuplicateRows = parsed.rows.filter((row) => fingerprints.has(statementLineFingerprint(row))).map((row) => row.sourceRow);
    res.json({
      total_rows: parsed.rows.length + parsed.errors.length,
      valid_rows: parsed.rows.length,
      errors: parsed.errors,
      in_file_duplicate_rows: parsed.duplicate_rows,
      existing_duplicate_rows: existingDuplicateRows,
      sample_rows: parsed.rows.slice(0, 10),
      ready_to_import: parsed.errors.length === 0,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    if (error instanceof FinancialOperationError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not validate the CSV file." });
  }
});

router.post("/:id/import", receiveCsv, async (req, res) => {
  try {
    const statementId = String(req.params.id);
    await requireMutableStatement(statementId);
    if (!req.file) return res.status(400).json({ error: "Choose a CSV file." });
    const body = importMappingSchema.parse(req.body);
    const parsed = parseStatementCsv(req.file.buffer, mappingFrom(body));
    if (parsed.errors.length) return res.status(400).json({ error: "Fix every invalid CSV row before importing.", row_errors: parsed.errors });
    const skipDuplicates = body.skip_duplicates === "true";
    if (parsed.duplicate_rows.length && !skipDuplicates) {
      return res.status(409).json({ error: "The CSV contains duplicate rows. Review or choose Skip duplicates.", duplicate_rows: parsed.duplicate_rows });
    }
    const result = await importStatementLines(statementId, uniqueImportedRows(parsed.rows), {
      skipDuplicates,
      sourceFileName: req.file.originalname,
    });
    res.status(201).json({ imported_count: result.inserted.length, skipped_duplicate_count: result.skipped_duplicate_count + parsed.duplicate_rows.length });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
    if (error instanceof FinancialOperationError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    req.log.error({ error }, "Failed to import statement CSV");
    res.status(500).json({ error: "Statement import failed without changing the statement." });
  }
});

router.get("/", async (req, res) => {
  try {
    const { account_id, include_archived } = req.query;
    const rows = await db.select({
      stmt: statements,
      account_name: accounts.name,
    })
      .from(statements)
      .leftJoin(accounts, eq(statements.account_id, accounts.id))
      .orderBy(desc(statements.statement_month));

    const filtered = rows.filter((row) => {
      if (account_id && row.stmt.account_id !== account_id) return false;
      return include_archived === "true" || row.stmt.archived_at === null;
    });

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

    const existingLineRows = await db.select().from(statement_lines).where(eq(statement_lines.id, id));
    if (existingLineRows.length) {
      const parentRows = await db.select().from(statements).where(eq(statements.id, existingLineRows[0].statement_id));
      if (parentRows[0]?.archived_at) {
        return res.status(409).json({ error: "Archived statements are read-only." });
      }
      if (body.status === "matched") {
        return res.status(400).json({ error: "Use the reconciliation action to match a statement line." });
      }
      if (existingLineRows[0].status === "matched" && body.status !== undefined) {
        return res.status(409).json({ error: "Matched lines require an explicit unmatch workflow." });
      }
      const [line] = await db.update(statement_lines).set(update).where(eq(statement_lines.id, id)).returning();
      return res.json(line);
    }

    const existingStatement = await db.select().from(statements).where(eq(statements.id, id));
    if (existingStatement[0]?.archived_at) {
      return res.status(409).json({ error: "Archived statements are read-only." });
    }
    const stmtRows = await db.update(statements).set({ ...update, updated_at: new Date() }).where(and(eq(statements.id, id), isNull(statements.archived_at))).returning();
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

    const archived = await archiveStatement(id);
    req.log.info({ id }, "Statement archived");
    res.json({ archived: true, id, archived_at: archived.archived_at });
  } catch (err) {
    req.log.error({ err }, "Failed to archive statement");
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
    if (stmtRows[0].archived_at) return res.status(409).json({ error: "Archived statements are read-only." });

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

router.get("/:id/candidates", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement line not found" });
    const records = await db.select({ line: statement_lines, statement: statements })
      .from(statement_lines)
      .innerJoin(statements, eq(statement_lines.statement_id, statements.id))
      .where(eq(statement_lines.id, id));
    const record = records[0];
    if (!record) return res.status(404).json({ error: "Statement line not found" });
    const lineDate = record.line.transaction_date ?? record.line.posted_date;
    if (!lineDate) return res.json([]);
    const candidates = await db.select({
      transaction: transactions,
      account_debit: transaction_lines.debit,
      account_credit: transaction_lines.credit,
      vendor_name: vendors.name,
    }).from(transaction_lines)
      .innerJoin(transactions, eq(transaction_lines.transaction_id, transactions.id))
      .leftJoin(vendors, eq(transactions.vendor_id, vendors.id))
      .where(and(
        eq(transaction_lines.account_id, record.statement.account_id),
        eq(transactions.status, "posted"),
      ));
    const targetDate = new Date(`${lineDate}T00:00:00.000Z`).getTime();
    const targetAmount = Number(record.line.amount);
    const ranked = candidates.map((candidate) => {
      const candidateDate = new Date(`${candidate.transaction.transaction_date}T00:00:00.000Z`).getTime();
      const dateDistanceDays = Math.abs(Math.round((candidateDate - targetDate) / 86_400_000));
      const ledgerAmount = Number(candidate.account_debit) - Number(candidate.account_credit);
      const exactAmount = Math.abs(ledgerAmount - targetAmount) < 0.005;
      return {
        ...candidate.transaction,
        vendor_name: candidate.vendor_name,
        date_distance_days: dateDistanceDays,
        account_amount: ledgerAmount,
        match_score: exactAmount ? Math.max(70, 100 - dateDistanceDays * 8) : 0,
        match_reasons: exactAmount ? ["Exact account amount", dateDistanceDays === 0 ? "Same date" : `${dateDistanceDays} day${dateDistanceDays === 1 ? "" : "s"} apart`] : [],
      };
    }).filter((candidate) => candidate.match_score > 0 && candidate.date_distance_days <= 5)
      .sort((left, right) => right.match_score - left.match_score)
      .slice(0, 10);
    res.json(ranked);
  } catch (error) {
    req.log.error({ error }, "Failed to find statement match candidates");
    res.status(500).json({ error: "Could not find suggested matches." });
  }
});

router.post("/:id/match", async (req, res) => {
  try {
    const { id } = req.params;
    if (!uuidRe.test(id)) return res.status(404).json({ error: "Statement line not found" });
    const body = matchLineSchema.parse(req.body);
    const { line, transaction: tx } = await matchStatementLine(id, body);
    let txDescription = tx?.description ?? null;
    if (tx?.vendor_id) {
      const vs = await db.select().from(vendors).where(eq(vendors.id, tx.vendor_id));
      if (vs.length) txDescription = vs[0].name;
    }

    res.json({ ...line, matched_transaction_description: txDescription });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof FinancialOperationError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to match statement line");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
