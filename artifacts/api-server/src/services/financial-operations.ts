import {
  accounts,
  db,
  entities,
  intercompany_links,
  monthly_close_periods,
  owner_contributions,
  owner_draws,
  reconciliation_matches,
  reimbursement_requests,
  statement_lines,
  statements,
  transaction_lines,
  transactions,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";
import { statementLineFingerprint, type ParsedStatementImportRow } from "./statement-import";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class FinancialOperationError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 409,
    public readonly code = "FINANCIAL_OPERATION_CONFLICT",
  ) {
    super(message);
    this.name = "FinancialOperationError";
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value: string, label = "Date"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new FinancialOperationError(`${label} must be a valid YYYY-MM-DD date.`, 400, "INVALID_DATE");
  }
  return value;
}

function amountString(value: number | string): string {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount) || Math.round(amount * 100) <= 0) {
    throw new FinancialOperationError("Amount must be greater than zero.", 400, "INVALID_AMOUNT");
  }
  return (Math.round(amount * 100) / 100).toFixed(2);
}

export async function requireActiveEntities(tx: DbTransaction, entityIds: string[]) {
  const ids = [...new Set(entityIds)];
  const rows = await tx.select().from(entities).where(inArray(entities.id, ids));
  if (rows.length !== ids.length) {
    throw new FinancialOperationError("One or more companies could not be found.", 404, "ENTITY_NOT_FOUND");
  }
  if (rows.some((row) => !row.is_active || row.lifecycle_status !== "active")) {
    throw new FinancialOperationError("Financial activity is blocked for inactive companies.", 409, "ENTITY_INACTIVE");
  }
  return rows;
}

export async function requireOpenPeriod(tx: DbTransaction, entityIds: string[], operationDate: string) {
  const closed = await tx.select({ id: monthly_close_periods.id }).from(monthly_close_periods).where(and(
    inArray(monthly_close_periods.entity_id, [...new Set(entityIds)]),
    eq(monthly_close_periods.status, "closed"),
    sql`date_trunc('month', ${monthly_close_periods.period_month}) = date_trunc('month', ${operationDate}::date)`,
  ));
  if (closed.length) {
    throw new FinancialOperationError(
      `The ${operationDate.slice(0, 7)} accounting period is closed. Reopen it before continuing.`,
      409,
      "PERIOD_CLOSED",
    );
  }
}

async function requireCheckingAccount(tx: DbTransaction, entityId: string, accountId?: string) {
  const rows = await tx.select().from(accounts).where(and(
    eq(accounts.entity_id, entityId),
    eq(accounts.is_active, true),
    eq(accounts.account_type, "checking"),
    accountId ? eq(accounts.id, accountId) : undefined,
  ));
  if (!rows.length) {
    throw new FinancialOperationError(
      accountId
        ? "The selected settlement account is not an active checking account for this company."
        : "An active checking account is required before recording this operation.",
      409,
      accountId ? "INVALID_SETTLEMENT_ACCOUNT" : "CHECKING_ACCOUNT_REQUIRED",
    );
  }
  if (rows.length > 1) {
    throw new FinancialOperationError(
      "More than one active checking account exists. Choose a settlement account before continuing.",
      409,
      "SETTLEMENT_ACCOUNT_REQUIRED",
    );
  }
  return rows[0];
}

async function createSettlementJournal(
  tx: DbTransaction,
  input: {
    operationDate: string;
    amount: string;
    owingEntityId: string;
    owedEntityId: string;
    owingAccountId: string;
    owedAccountId: string;
    description: string;
    memo?: string | null;
  },
) {
  const [transaction] = await tx.insert(transactions).values({
    transaction_date: input.operationDate,
    transaction_type: "intercompany_settlement",
    description: input.description,
    business_purpose: input.memo ?? null,
    total_amount: input.amount,
    status: "posted",
    is_balanced: true,
  }).returning();
  const lines = await tx.insert(transaction_lines).values([
    {
      transaction_id: transaction.id,
      entity_id: input.owingEntityId,
      debit: input.amount,
      credit: "0",
      memo: "Reduce amount payable",
    },
    {
      transaction_id: transaction.id,
      entity_id: input.owingEntityId,
      account_id: input.owingAccountId,
      debit: "0",
      credit: input.amount,
      memo: "Cash paid",
    },
    {
      transaction_id: transaction.id,
      entity_id: input.owedEntityId,
      account_id: input.owedAccountId,
      debit: input.amount,
      credit: "0",
      memo: "Cash received",
    },
    {
      transaction_id: transaction.id,
      entity_id: input.owedEntityId,
      debit: "0",
      credit: input.amount,
      memo: "Reduce amount receivable",
    },
  ]).returning();
  await writeAuditLog({
    tableName: "transactions",
    recordId: transaction.id,
    action: "post_settlement",
    newValue: { transaction, lines },
    memo: input.description,
  }, tx);
  return transaction;
}

export async function settleIntercompanyLink(
  linkId: string,
  input: {
    payment_date?: string;
    memo?: string | null;
    owing_account_id?: string;
    owed_account_id?: string;
  } = {},
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(intercompany_links).where(eq(intercompany_links.id, linkId));
    const link = rows[0];
    if (!link) throw new FinancialOperationError("Intercompany link not found.", 404, "INTERCOMPANY_NOT_FOUND");
    if (link.status !== "open") {
      throw new FinancialOperationError("This intercompany balance has already been processed.", 409, "INTERCOMPANY_ALREADY_PROCESSED");
    }
    const operationDate = validDate(input.payment_date ?? today(), "Payment date");
    await requireActiveEntities(tx, [link.owing_entity_id, link.owed_entity_id]);
    await requireOpenPeriod(tx, [link.owing_entity_id, link.owed_entity_id], operationDate);
    const owingAccount = await requireCheckingAccount(tx, link.owing_entity_id, input.owing_account_id);
    const owedAccount = await requireCheckingAccount(tx, link.owed_entity_id, input.owed_account_id);
    const transaction = await createSettlementJournal(tx, {
      operationDate,
      amount: amountString(link.amount),
      owingEntityId: link.owing_entity_id,
      owedEntityId: link.owed_entity_id,
      owingAccountId: owingAccount.id,
      owedAccountId: owedAccount.id,
      description: "Intercompany balance settlement",
      memo: input.memo,
    });
    const updated = await tx.update(intercompany_links).set({
      status: "paid",
      reimbursement_transaction_id: transaction.id,
      memo: input.memo ?? link.memo,
      updated_at: new Date(),
    }).where(and(eq(intercompany_links.id, linkId), eq(intercompany_links.status, "open"))).returning();
    if (!updated.length) {
      throw new FinancialOperationError("This intercompany balance was processed by another request.", 409, "INTERCOMPANY_ALREADY_PROCESSED");
    }
    await writeAuditLog({
      tableName: "intercompany_links",
      recordId: linkId,
      action: "settle",
      previousValue: link,
      newValue: updated[0],
      memo: input.memo ?? "Intercompany balance paid.",
    }, tx);
    return updated[0];
  });
}

export async function reverseIntercompanySettlement(
  linkId: string,
  input: { reversal_date?: string; memo: string },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(intercompany_links).where(eq(intercompany_links.id, linkId));
    const link = rows[0];
    if (!link) throw new FinancialOperationError("Intercompany link not found.", 404, "INTERCOMPANY_NOT_FOUND");
    if (link.status !== "paid" || !link.reimbursement_transaction_id) {
      throw new FinancialOperationError(
        "Only a paid intercompany settlement can be reversed.",
        409,
        "INTERCOMPANY_NOT_SETTLED",
      );
    }

    const operationDate = validDate(input.reversal_date ?? today(), "Reversal date");
    const memo = input.memo.trim();
    if (memo.length < 3) {
      throw new FinancialOperationError("A reversal explanation is required.", 400, "REVERSAL_MEMO_REQUIRED");
    }
    await requireActiveEntities(tx, [link.owing_entity_id, link.owed_entity_id]);
    await requireOpenPeriod(tx, [link.owing_entity_id, link.owed_entity_id], operationDate);

    const originalRows = await tx.select().from(transactions)
      .where(eq(transactions.id, link.reimbursement_transaction_id));
    const original = originalRows[0];
    if (!original || original.status !== "posted" || original.transaction_type !== "intercompany_settlement") {
      throw new FinancialOperationError(
        "The original posted settlement transaction could not be verified.",
        409,
        "SETTLEMENT_TRANSACTION_INVALID",
      );
    }
    const originalLines = await tx.select().from(transaction_lines)
      .where(eq(transaction_lines.transaction_id, original.id));
    if (!originalLines.length) {
      throw new FinancialOperationError(
        "The original settlement has no journal lines to reverse.",
        409,
        "SETTLEMENT_LINES_MISSING",
      );
    }

    const [reversal] = await tx.insert(transactions).values({
      transaction_date: operationDate,
      transaction_type: "intercompany_settlement_reversal",
      description: "Intercompany settlement reversal",
      business_purpose: memo,
      source_document_id: original.id,
      total_amount: amountString(link.amount),
      status: "posted",
      is_balanced: true,
    }).returning();
    const reversalLines = await tx.insert(transaction_lines).values(originalLines.map((line) => ({
      transaction_id: reversal.id,
      entity_id: line.entity_id,
      account_id: line.account_id,
      category_id: line.category_id,
      debit: line.credit,
      credit: line.debit,
      memo: line.memo ? `Reversal: ${line.memo}` : "Settlement reversal",
    }))).returning();

    await writeAuditLog({
      tableName: "transactions",
      recordId: reversal.id,
      action: "post_settlement_reversal",
      newValue: { transaction: reversal, lines: reversalLines, reverses_transaction_id: original.id },
      memo,
    }, tx);

    const updated = await tx.update(intercompany_links).set({
      status: "open",
      reimbursement_transaction_id: null,
      updated_at: new Date(),
    }).where(and(
      eq(intercompany_links.id, linkId),
      eq(intercompany_links.status, "paid"),
      eq(intercompany_links.reimbursement_transaction_id, original.id),
    )).returning();
    if (!updated.length) {
      throw new FinancialOperationError(
        "This intercompany settlement was changed by another request.",
        409,
        "INTERCOMPANY_REVERSAL_CONFLICT",
      );
    }
    await writeAuditLog({
      tableName: "intercompany_links",
      recordId: linkId,
      action: "reverse_settlement",
      previousValue: link,
      newValue: { ...updated[0], reversal_transaction_id: reversal.id, reversed_transaction_id: original.id },
      memo,
    }, tx);
    return { link: updated[0], reversal_transaction_id: reversal.id };
  });
}

export async function settleReimbursement(
  reimbursementId: string,
  input: { payment_date?: string; memo?: string | null } = {},
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(reimbursement_requests).where(eq(reimbursement_requests.id, reimbursementId));
    const reimbursement = rows[0];
    if (!reimbursement) throw new FinancialOperationError("Reimbursement not found.", 404, "REIMBURSEMENT_NOT_FOUND");
    if (reimbursement.status !== "pending") {
      throw new FinancialOperationError("This reimbursement has already been processed.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    }
    const operationDate = validDate(input.payment_date ?? today(), "Payment date");
    await requireActiveEntities(tx, [reimbursement.owed_by_entity_id, reimbursement.owed_to_entity_id]);
    await requireOpenPeriod(tx, [reimbursement.owed_by_entity_id, reimbursement.owed_to_entity_id], operationDate);
    const owingAccount = await requireCheckingAccount(tx, reimbursement.owed_by_entity_id);
    const owedAccount = await requireCheckingAccount(tx, reimbursement.owed_to_entity_id);
    const transaction = await createSettlementJournal(tx, {
      operationDate,
      amount: amountString(reimbursement.amount),
      owingEntityId: reimbursement.owed_by_entity_id,
      owedEntityId: reimbursement.owed_to_entity_id,
      owingAccountId: owingAccount.id,
      owedAccountId: owedAccount.id,
      description: "Reimbursement payment",
      memo: input.memo,
    });
    const updated = await tx.update(reimbursement_requests).set({
      status: "paid",
      paid_transaction_id: transaction.id,
      memo: input.memo ?? reimbursement.memo,
      updated_at: new Date(),
    }).where(and(eq(reimbursement_requests.id, reimbursementId), eq(reimbursement_requests.status, "pending"))).returning();
    if (!updated.length) {
      throw new FinancialOperationError("This reimbursement was processed by another request.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    }
    await writeAuditLog({
      tableName: "reimbursement_requests",
      recordId: reimbursementId,
      action: "pay",
      previousValue: reimbursement,
      newValue: updated[0],
      memo: input.memo ?? "Reimbursement paid.",
    }, tx);
    return updated[0];
  });
}

export async function waiveReimbursement(
  reimbursementId: string,
  input: { effective_date?: string; memo: string },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(reimbursement_requests).where(eq(reimbursement_requests.id, reimbursementId));
    const reimbursement = rows[0];
    if (!reimbursement) throw new FinancialOperationError("Reimbursement not found.", 404, "REIMBURSEMENT_NOT_FOUND");
    if (reimbursement.status !== "pending") {
      throw new FinancialOperationError("This reimbursement has already been processed.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    }
    const operationDate = validDate(input.effective_date ?? today(), "Waiver date");
    await requireActiveEntities(tx, [reimbursement.owed_by_entity_id, reimbursement.owed_to_entity_id]);
    await requireOpenPeriod(tx, [reimbursement.owed_by_entity_id, reimbursement.owed_to_entity_id], operationDate);
    const amount = amountString(reimbursement.amount);
    const [transaction] = await tx.insert(transactions).values({
      transaction_date: operationDate,
      transaction_type: "adjustment",
      description: "Reimbursement obligation waived",
      total_amount: amount,
      status: "posted",
      is_balanced: true,
      business_purpose: input.memo,
    }).returning();
    const lines = await tx.insert(transaction_lines).values([
      { transaction_id: transaction.id, entity_id: reimbursement.owed_by_entity_id, debit: amount, credit: "0", memo: "Release reimbursement payable" },
      { transaction_id: transaction.id, entity_id: reimbursement.owed_by_entity_id, debit: "0", credit: amount, memo: "Debt waiver adjustment" },
      { transaction_id: transaction.id, entity_id: reimbursement.owed_to_entity_id, debit: amount, credit: "0", memo: "Reimbursement write-off" },
      { transaction_id: transaction.id, entity_id: reimbursement.owed_to_entity_id, debit: "0", credit: amount, memo: "Release reimbursement receivable" },
    ]).returning();
    const updated = await tx.update(reimbursement_requests).set({
      status: "waived",
      paid_transaction_id: transaction.id,
      memo: input.memo,
      updated_at: new Date(),
    }).where(and(eq(reimbursement_requests.id, reimbursementId), eq(reimbursement_requests.status, "pending"))).returning();
    if (!updated.length) throw new FinancialOperationError("This reimbursement was processed by another request.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    await writeAuditLog({
      tableName: "reimbursement_requests",
      recordId: reimbursementId,
      action: "waive",
      previousValue: reimbursement,
      newValue: { reimbursement: updated[0], transaction, lines },
      memo: input.memo,
    }, tx);
    return updated[0];
  });
}

export async function convertReimbursementToContribution(
  reimbursementId: string,
  input: { effective_date?: string; memo: string },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(reimbursement_requests).where(eq(reimbursement_requests.id, reimbursementId));
    const reimbursement = rows[0];
    if (!reimbursement) throw new FinancialOperationError("Reimbursement not found.", 404, "REIMBURSEMENT_NOT_FOUND");
    if (reimbursement.status !== "pending") {
      throw new FinancialOperationError("This reimbursement has already been processed.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    }
    const creditorRows = await tx.select().from(entities).where(eq(entities.id, reimbursement.owed_to_entity_id));
    if (creditorRows[0]?.short_code !== "PERSONAL") {
      throw new FinancialOperationError(
        "Only reimbursements owed to the Personal entity can be converted to an owner contribution.",
        409,
        "REIMBURSEMENT_NOT_OWNER_FUNDED",
      );
    }
    const operationDate = validDate(input.effective_date ?? today(), "Conversion date");
    const [business] = await requireActiveEntities(tx, [reimbursement.owed_by_entity_id]);
    await requireOpenPeriod(tx, [business.id], operationDate);
    const amount = amountString(reimbursement.amount);
    const [transaction] = await tx.insert(transactions).values({
      transaction_date: operationDate,
      transaction_type: "owner_contribution",
      description: `Reimbursement converted to owner capital for ${business.display_name}`,
      total_amount: amount,
      status: "posted",
      is_balanced: true,
      business_purpose: input.memo,
    }).returning();
    const lines = await tx.insert(transaction_lines).values([
      { transaction_id: transaction.id, entity_id: business.id, debit: amount, credit: "0", memo: "Release reimbursement payable" },
      { transaction_id: transaction.id, entity_id: business.id, debit: "0", credit: amount, memo: "Owner capital contribution" },
    ]).returning();
    const [contribution] = await tx.insert(owner_contributions).values({
      transaction_id: transaction.id,
      entity_id: business.id,
      amount,
      contribution_type: "capital_contribution",
      memo: input.memo,
      contribution_date: operationDate,
    }).returning();
    const updated = await tx.update(reimbursement_requests).set({
      status: "converted",
      paid_transaction_id: transaction.id,
      memo: input.memo,
      updated_at: new Date(),
    }).where(and(eq(reimbursement_requests.id, reimbursementId), eq(reimbursement_requests.status, "pending"))).returning();
    if (!updated.length) throw new FinancialOperationError("This reimbursement was processed by another request.", 409, "REIMBURSEMENT_ALREADY_PROCESSED");
    await writeAuditLog({
      tableName: "reimbursement_requests",
      recordId: reimbursementId,
      action: "convert_to_contribution",
      previousValue: reimbursement,
      newValue: { reimbursement: updated[0], contribution, transaction, lines },
      memo: input.memo,
    }, tx);
    return updated[0];
  });
}

export async function createOwnerContribution(input: {
  entity_id: string;
  amount: number;
  contribution_type: "capital_contribution" | "owner_loan";
  memo?: string | null;
  contribution_date: string;
}) {
  return db.transaction(async (tx) => {
    const [entity] = await requireActiveEntities(tx, [input.entity_id]);
    const contributionDate = validDate(input.contribution_date, "Contribution date");
    await requireOpenPeriod(tx, [input.entity_id], contributionDate);
    const checkingAccount = await requireCheckingAccount(tx, input.entity_id);
    const amount = amountString(input.amount);
    const [transaction] = await tx.insert(transactions).values({
      transaction_date: contributionDate,
      transaction_type: "owner_contribution",
      description: `Owner contribution to ${entity.display_name}`,
      total_amount: amount,
      status: "posted",
      is_balanced: true,
      business_purpose: input.memo ?? null,
    }).returning();
    const lines = await tx.insert(transaction_lines).values([
      {
        transaction_id: transaction.id,
        entity_id: input.entity_id,
        account_id: checkingAccount.id,
        debit: amount,
        credit: "0",
        memo: "Cash received from owner",
      },
      {
        transaction_id: transaction.id,
        entity_id: input.entity_id,
        debit: "0",
        credit: amount,
        memo: input.contribution_type === "owner_loan" ? "Owner loan liability" : "Owner capital",
      },
    ]).returning();
    const [contribution] = await tx.insert(owner_contributions).values({
      transaction_id: transaction.id,
      entity_id: input.entity_id,
      amount,
      contribution_type: input.contribution_type,
      memo: input.memo ?? null,
      contribution_date: contributionDate,
    }).returning();
    await writeAuditLog({
      tableName: "owner_contributions",
      recordId: contribution.id,
      action: "create",
      newValue: { contribution, transaction, lines },
      memo: input.memo ?? "Owner contribution recorded.",
    }, tx);
    return { contribution, entity };
  });
}

export async function createOwnerDraw(input: {
  entity_id: string;
  amount: number;
  memo?: string | null;
  draw_date: string;
}) {
  return db.transaction(async (tx) => {
    const [entity] = await requireActiveEntities(tx, [input.entity_id]);
    const drawDate = validDate(input.draw_date, "Draw date");
    await requireOpenPeriod(tx, [input.entity_id], drawDate);
    const checkingAccount = await requireCheckingAccount(tx, input.entity_id);
    const amount = amountString(input.amount);
    const [transaction] = await tx.insert(transactions).values({
      transaction_date: drawDate,
      transaction_type: "owner_draw",
      description: `Owner draw from ${entity.display_name}`,
      total_amount: amount,
      status: "posted",
      is_balanced: true,
      business_purpose: input.memo ?? null,
    }).returning();
    const lines = await tx.insert(transaction_lines).values([
      {
        transaction_id: transaction.id,
        entity_id: input.entity_id,
        debit: amount,
        credit: "0",
        memo: "Owner equity draw",
      },
      {
        transaction_id: transaction.id,
        entity_id: input.entity_id,
        account_id: checkingAccount.id,
        debit: "0",
        credit: amount,
        memo: "Cash paid to owner",
      },
    ]).returning();
    const [draw] = await tx.insert(owner_draws).values({
      transaction_id: transaction.id,
      entity_id: input.entity_id,
      amount,
      memo: input.memo ?? null,
      draw_date: drawDate,
    }).returning();
    await writeAuditLog({
      tableName: "owner_draws",
      recordId: draw.id,
      action: "create",
      newValue: { draw, transaction, lines },
      memo: input.memo ?? "Owner draw recorded.",
    }, tx);
    return { draw, entity };
  });
}

export async function matchStatementLine(
  statementLineId: string,
  input: { transaction_id: string; match_type: string },
) {
  return db.transaction(async (tx) => {
    const lines = await tx.select({ line: statement_lines, statement: statements }).from(statement_lines)
      .innerJoin(statements, eq(statement_lines.statement_id, statements.id))
      .where(eq(statement_lines.id, statementLineId));
    const record = lines[0];
    if (!record) throw new FinancialOperationError("Statement line not found.", 404, "STATEMENT_LINE_NOT_FOUND");
    if (record.statement.archived_at) {
      throw new FinancialOperationError("Archived statements are read-only.", 409, "STATEMENT_ARCHIVED");
    }
    if (record.line.status === "matched" || record.line.matched_transaction_id) {
      throw new FinancialOperationError("This statement line is already matched.", 409, "STATEMENT_LINE_ALREADY_MATCHED");
    }
    const transactionRows = await tx.select().from(transactions).where(eq(transactions.id, input.transaction_id));
    const transaction = transactionRows[0];
    if (!transaction) throw new FinancialOperationError("Transaction not found.", 404, "TRANSACTION_NOT_FOUND");
    if (transaction.status !== "posted") {
      throw new FinancialOperationError("Only posted transactions can be reconciled.", 409, "TRANSACTION_NOT_POSTED");
    }
    const accountRows = await tx.select().from(accounts).where(eq(accounts.id, record.statement.account_id));
    const account = accountRows[0];
    if (!account) throw new FinancialOperationError("Statement account not found.", 404, "ACCOUNT_NOT_FOUND");
    const operationDate = validDate(
      record.line.transaction_date ?? record.line.posted_date ?? record.statement.statement_month,
      "Statement transaction date",
    );
    await requireOpenPeriod(tx, [account.entity_id], operationDate);
    const matchingLines = await tx.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, transaction.id));
    if (!matchingLines.some((line) => line.account_id === account.id)) {
      throw new FinancialOperationError(
        "The transaction does not contain a line for this statement account.",
        400,
        "RECONCILIATION_ACCOUNT_MISMATCH",
      );
    }
    const updated = await tx.update(statement_lines).set({
      matched_transaction_id: transaction.id,
      status: "matched",
    }).where(and(eq(statement_lines.id, statementLineId), eq(statement_lines.status, record.line.status))).returning();
    if (!updated.length) {
      throw new FinancialOperationError("This statement line was changed by another request.", 409, "STATEMENT_LINE_ALREADY_MATCHED");
    }
    const [match] = await tx.insert(reconciliation_matches).values({
      statement_line_id: statementLineId,
      transaction_id: transaction.id,
      match_type: input.match_type,
      approved_by_user: "true",
    }).returning();
    await writeAuditLog({
      tableName: "statement_lines",
      recordId: statementLineId,
      action: "reconcile",
      previousValue: record.line,
      newValue: { line: updated[0], match },
      memo: "Statement line matched to posted transaction.",
    }, tx);
    return { line: updated[0], transaction };
  });
}

export async function archiveStatement(statementId: string) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(statements).where(eq(statements.id, statementId));
    const statement = rows[0];
    if (!statement) throw new FinancialOperationError("Statement not found.", 404, "STATEMENT_NOT_FOUND");
    if (statement.archived_at) return statement;

    const archivedAt = new Date();
    const [archived] = await tx.update(statements)
      .set({ archived_at: archivedAt, updated_at: archivedAt })
      .where(eq(statements.id, statementId))
      .returning();
    await writeAuditLog({
      tableName: "statements",
      recordId: statementId,
      action: "archive",
      previousValue: statement,
      newValue: archived,
      memo: "Statement archived; statement lines and reconciliation history retained.",
    }, tx);
    return archived;
  });
}

export async function importStatementLines(
  statementId: string,
  importedRows: ParsedStatementImportRow[],
  options: { skipDuplicates: boolean; sourceFileName: string },
) {
  return db.transaction(async (tx) => {
    const records = await tx.select({ statement: statements, account: accounts })
      .from(statements)
      .innerJoin(accounts, eq(statements.account_id, accounts.id))
      .where(eq(statements.id, statementId));
    const record = records[0];
    if (!record) throw new FinancialOperationError("Statement not found.", 404, "STATEMENT_NOT_FOUND");
    if (record.statement.archived_at) throw new FinancialOperationError("Archived statements are read-only.", 409, "STATEMENT_ARCHIVED");
    if (!record.account.is_active) throw new FinancialOperationError("The statement account is inactive.", 409, "ACCOUNT_INACTIVE");
    await requireActiveEntities(tx, [record.account.entity_id]);
    for (const operationDate of [...new Set(importedRows.map((row) => row.transaction_date))]) {
      await requireOpenPeriod(tx, [record.account.entity_id], operationDate);
    }

    const existingRows = await tx.select().from(statement_lines).where(eq(statement_lines.statement_id, statementId));
    const existingFingerprints = new Set(existingRows.filter((row) => row.transaction_date).map((row) => statementLineFingerprint({
      transaction_date: row.transaction_date!,
      description: row.description ?? "",
      amount: Number(row.amount),
      balance_after: row.balance_after == null ? null : Number(row.balance_after),
    })));
    const duplicateRows = importedRows.filter((row) => existingFingerprints.has(statementLineFingerprint(row)));
    if (duplicateRows.length && !options.skipDuplicates) {
      throw new FinancialOperationError(
        `${duplicateRows.length} imported row${duplicateRows.length === 1 ? " matches" : "s match"} existing statement data. Review or choose Skip duplicates.`,
        409,
        "STATEMENT_IMPORT_DUPLICATES",
      );
    }
    const rowsToInsert = importedRows.filter((row) => !existingFingerprints.has(statementLineFingerprint(row)));
    if (!rowsToInsert.length) {
      throw new FinancialOperationError("Every imported row is already present on this statement.", 409, "STATEMENT_IMPORT_ALL_DUPLICATES");
    }

    const inserted = await tx.insert(statement_lines).values(rowsToInsert.map((row) => ({
      statement_id: statementId,
      transaction_date: row.transaction_date,
      posted_date: row.posted_date,
      description: row.description,
      amount: row.amount.toFixed(2),
      balance_after: row.balance_after == null ? null : row.balance_after.toFixed(2),
      notes: `Imported from ${options.sourceFileName}, CSV row ${row.sourceRow}.`,
      status: "unmatched",
    }))).returning();
    await tx.update(statements).set({ status: "reconciling", updated_at: new Date() }).where(eq(statements.id, statementId));
    await writeAuditLog({
      tableName: "statements",
      recordId: statementId,
      action: "import_csv",
      previousValue: { line_count: existingRows.length },
      newValue: {
        source_file_name: options.sourceFileName,
        inserted_count: inserted.length,
        skipped_duplicate_count: duplicateRows.length,
        imported_source_rows: rowsToInsert.map((row) => row.sourceRow),
      },
      memo: "Statement CSV imported after full-file validation.",
    }, tx);
    return { inserted, skipped_duplicate_count: duplicateRows.length };
  });
}

const checklistFields = [
  "all_statements_uploaded",
  "all_transactions_reconciled",
  "all_receipts_attached",
  "all_allocations_complete",
  "intercompany_reviewed",
  "tax_reserve_reviewed",
  "export_generated",
] as const;

export async function createMonthlyClosePeriod(input: { entity_id: string; period_month: string }) {
  return db.transaction(async (tx) => {
    const [entity] = await requireActiveEntities(tx, [input.entity_id]);
    const periodMonth = validDate(input.period_month, "Period month");
    if (!periodMonth.endsWith("-01")) {
      throw new FinancialOperationError("Period month must be the first day of the month.", 400, "INVALID_PERIOD_MONTH");
    }
    const existing = await tx.select().from(monthly_close_periods).where(and(
      eq(monthly_close_periods.entity_id, input.entity_id),
      eq(monthly_close_periods.period_month, periodMonth),
    ));
    if (existing.length) {
      throw new FinancialOperationError("A close record already exists for this company and month.", 409, "CLOSE_PERIOD_EXISTS");
    }
    const [period] = await tx.insert(monthly_close_periods).values({
      entity_id: input.entity_id,
      period_month: periodMonth,
      status: "open",
    }).returning();
    await writeAuditLog({ tableName: "monthly_close_periods", recordId: period.id, action: "create", newValue: period }, tx);
    return { period, entity };
  });
}

export async function updateMonthlyClosePeriod(
  periodId: string,
  input: Partial<Record<(typeof checklistFields)[number], boolean | null>> & {
    status?: "open" | "review" | "closed" | "reopened";
    correction_memo?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(monthly_close_periods).where(eq(monthly_close_periods.id, periodId));
    const existing = rows[0];
    if (!existing) throw new FinancialOperationError("Period not found.", 404, "CLOSE_PERIOD_NOT_FOUND");
    if (existing.status === "closed" && input.status !== "reopened") {
      throw new FinancialOperationError("Reopen the period before editing its checklist.", 409, "CLOSE_PERIOD_LOCKED");
    }
    if (existing.status === "closed" && input.status === "reopened" && !input.correction_memo?.trim()) {
      throw new FinancialOperationError("A correction memo is required to reopen a closed period.", 400, "CORRECTION_MEMO_REQUIRED");
    }
    const next = { ...existing, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null)) };
    if (input.status === "closed" && checklistFields.some((field) => next[field] !== true)) {
      throw new FinancialOperationError("Complete every monthly-close checklist item before closing the period.", 409, "CLOSE_CHECKLIST_INCOMPLETE");
    }
    const update: Record<string, unknown> = { updated_at: new Date() };
    for (const field of checklistFields) {
      if (input[field] != null) update[field] = input[field];
    }
    if (input.status !== undefined) {
      update.status = input.status;
      update.closed_at = input.status === "closed" ? new Date() : null;
    }
    if (input.correction_memo !== undefined) update.correction_memo = input.correction_memo;
    const [updated] = await tx.update(monthly_close_periods).set(update).where(eq(monthly_close_periods.id, periodId)).returning();
    await writeAuditLog({
      tableName: "monthly_close_periods",
      recordId: periodId,
      action: input.status === "closed" ? "close" : input.status === "reopened" ? "reopen" : "update",
      previousValue: existing,
      newValue: updated,
      memo: input.correction_memo ?? undefined,
    }, tx);
    const entityRows = await tx.select().from(entities).where(eq(entities.id, updated.entity_id));
    return { period: updated, entity: entityRows[0] };
  });
}
