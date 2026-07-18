import {
  accounts,
  audit_log,
  db,
  entities,
  expense_allocations,
  intercompany_links,
  monthly_close_periods,
  transaction_lines,
  transactions,
  vendors,
} from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type AllocationInput = {
  target_entity_id: string;
  category_id?: string | null;
  allocation_percent?: number | null;
  allocation_amount: number;
  memo?: string | null;
  creates_intercompany_balance: boolean;
};

export type TransactionLineInput = {
  entity_id?: string | null;
  account_id?: string | null;
  category_id?: string | null;
  debit: number;
  credit: number;
  memo?: string | null;
};

export type ManualExpenseInput = {
  transaction_date: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  description: string;
  business_purpose?: string | null;
  total_amount: number;
  paying_entity_id: string;
  paying_account_id: string;
  category_id?: string | null;
  preset_id?: string | null;
  allocations: AllocationInput[];
};

export class AccountingError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 409,
    public readonly code = "ACCOUNTING_CONFLICT",
  ) {
    super(message);
    this.name = "AccountingError";
  }
}

function toCents(value: number | string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) throw new AccountingError("Amount must be a valid number.", 400, "INVALID_AMOUNT");
  return Math.round(numeric * 100);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function assertPositiveAmount(value: number, label: string): void {
  if (toCents(value) <= 0) throw new AccountingError(`${label} must be greater than zero.`, 400, "INVALID_AMOUNT");
}

function assertLineShape(lines: Array<{ debit: number | string; credit: number | string }>): void {
  for (const line of lines) {
    const debit = toCents(line.debit);
    const credit = toCents(line.credit);
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0) || debit < 0 || credit < 0) {
      throw new AccountingError(
        "Each transaction line must contain one positive debit or one positive credit.",
        400,
        "INVALID_TRANSACTION_LINE",
      );
    }
  }
}

function assertAllocationTotal(totalAmount: number | string, allocations: AllocationInput[]): void {
  if (!allocations.length) throw new AccountingError("At least one allocation is required.", 400, "ALLOCATIONS_REQUIRED");
  for (const allocation of allocations) {
    assertPositiveAmount(allocation.allocation_amount, "Allocation amount");
    if (
      allocation.allocation_percent != null
      && (allocation.allocation_percent < 0 || allocation.allocation_percent > 100)
    ) {
      throw new AccountingError("Allocation percent must be between 0 and 100.", 400, "INVALID_ALLOCATION_PERCENT");
    }
  }
  const allocationCents = allocations.reduce((sum, allocation) => sum + toCents(allocation.allocation_amount), 0);
  if (allocationCents !== toCents(totalAmount)) {
    throw new AccountingError(
      `Allocation total (${(allocationCents / 100).toFixed(2)}) must equal transaction total (${(toCents(totalAmount) / 100).toFixed(2)}).`,
      400,
      "ALLOCATION_TOTAL_MISMATCH",
    );
  }
}

async function writeAudit(
  tx: DbTransaction,
  input: {
    tableName: string;
    recordId?: string | null;
    action: string;
    previousValue?: unknown;
    newValue?: unknown;
    memo?: string;
  },
): Promise<void> {
  await tx.insert(audit_log).values({
    table_name: input.tableName,
    record_id: input.recordId ?? null,
    action: input.action,
    previous_value: input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
    new_value: input.newValue === undefined ? null : JSON.stringify(input.newValue),
    memo: input.memo ?? null,
  });
}

async function assertEntitiesActive(tx: DbTransaction, entityIds: string[]): Promise<void> {
  if (!entityIds.length) return;
  const rows = await tx.select({
    id: entities.id,
    display_name: entities.display_name,
    lifecycle_status: entities.lifecycle_status,
    is_active: entities.is_active,
  }).from(entities).where(inArray(entities.id, entityIds));
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const missing = entityIds.filter((id) => !rowMap.has(id));
  if (missing.length) throw new AccountingError("One or more companies could not be found.", 400, "ENTITY_NOT_FOUND");
  const inactive = rows.filter((row) => row.lifecycle_status !== "active" || !row.is_active);
  if (inactive.length) {
    throw new AccountingError(
      `New financial activity is blocked for inactive companies: ${inactive.map((row) => row.display_name).join(", ")}.`,
      409,
      "ENTITY_INACTIVE",
    );
  }
}

async function assertPeriodsOpen(tx: DbTransaction, entityIds: string[], transactionDate: string): Promise<void> {
  if (!entityIds.length) return;
  const closed = await tx.select({
    entity_id: monthly_close_periods.entity_id,
    period_month: monthly_close_periods.period_month,
  }).from(monthly_close_periods).where(and(
    inArray(monthly_close_periods.entity_id, entityIds),
    eq(monthly_close_periods.status, "closed"),
    sql`date_trunc('month', ${monthly_close_periods.period_month}) = date_trunc('month', ${transactionDate}::date)`,
  ));
  if (closed.length) {
    throw new AccountingError(
      `The ${transactionDate.slice(0, 7)} accounting period is closed for one or more affected companies. Reopen it before making this change.`,
      409,
      "PERIOD_CLOSED",
    );
  }
}

async function assertAccountOwnership(
  tx: DbTransaction,
  accountId: string,
  entityId: string,
): Promise<void> {
  const rows = await tx.select().from(accounts).where(eq(accounts.id, accountId));
  const account = rows[0];
  if (!account) throw new AccountingError("Account not found.", 400, "ACCOUNT_NOT_FOUND");
  if (account.entity_id !== entityId) {
    throw new AccountingError("The selected account does not belong to the selected company.", 400, "ACCOUNT_ENTITY_MISMATCH");
  }
  if (!account.is_active) throw new AccountingError("The selected account is inactive.", 409, "ACCOUNT_INACTIVE");
}

async function assertLineAccounts(tx: DbTransaction, lines: TransactionLineInput[]): Promise<void> {
  const accountIds = unique(lines.map((line) => line.account_id));
  if (!accountIds.length) return;
  const rows = await tx.select().from(accounts).where(inArray(accounts.id, accountIds));
  const accountMap = new Map(rows.map((row) => [row.id, row]));
  for (const line of lines) {
    if (!line.account_id) continue;
    const account = accountMap.get(line.account_id);
    if (!account) throw new AccountingError("A transaction-line account was not found.", 400, "ACCOUNT_NOT_FOUND");
    if (!line.entity_id || account.entity_id !== line.entity_id) {
      throw new AccountingError(
        "Every transaction-line account must belong to that line's company.",
        400,
        "ACCOUNT_ENTITY_MISMATCH",
      );
    }
    if (!account.is_active) throw new AccountingError("A transaction-line account is inactive.", 409, "ACCOUNT_INACTIVE");
  }
}

async function getTransactionOrThrow(tx: DbTransaction, transactionId: string) {
  const rows = await tx.select().from(transactions).where(eq(transactions.id, transactionId));
  if (!rows.length) throw new AccountingError("Transaction not found.", 404, "TRANSACTION_NOT_FOUND");
  return rows[0];
}

function assertTransactionMutable(transaction: typeof transactions.$inferSelect): void {
  if (transaction.status === "posted") {
    throw new AccountingError(
      "Posted transactions are immutable. Use an explicit correction or reversal workflow.",
      409,
      "TRANSACTION_POSTED",
    );
  }
  if (transaction.status === "voided") {
    throw new AccountingError("Voided transactions cannot be changed.", 409, "TRANSACTION_VOIDED");
  }
}

async function getAffectedEntityIds(tx: DbTransaction, transactionId: string): Promise<string[]> {
  const [lines, allocations] = await Promise.all([
    tx.select({ entity_id: transaction_lines.entity_id })
      .from(transaction_lines)
      .where(eq(transaction_lines.transaction_id, transactionId)),
    tx.select({ entity_id: expense_allocations.target_entity_id })
      .from(expense_allocations)
      .where(eq(expense_allocations.transaction_id, transactionId)),
  ]);
  return unique([...lines.map((line) => line.entity_id), ...allocations.map((allocation) => allocation.entity_id)]);
}

export async function createTransactionHeader(input: {
  transaction_date: string;
  transaction_type: string;
  description: string;
  vendor_id?: string | null;
  total_amount: number;
  business_purpose?: string | null;
}) {
  assertPositiveAmount(input.total_amount, "Transaction amount");
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(transactions).values({
      ...input,
      vendor_id: input.vendor_id ?? null,
      business_purpose: input.business_purpose ?? null,
      total_amount: String(input.total_amount),
      status: "draft",
      is_balanced: false,
    }).returning();
    await writeAudit(tx, { tableName: "transactions", recordId: created.id, action: "create", newValue: created });
    return created;
  });
}

export async function createManualExpense(
  input: ManualExpenseInput,
  hooks?: { afterTransactionCreated?: () => void | Promise<void> },
) {
  assertPositiveAmount(input.total_amount, "Transaction amount");
  assertAllocationTotal(input.total_amount, input.allocations);

  return db.transaction(async (tx) => {
    const affectedEntityIds = unique([
      input.paying_entity_id,
      ...input.allocations.map((allocation) => allocation.target_entity_id),
    ]);
    await assertEntitiesActive(tx, affectedEntityIds);
    await assertPeriodsOpen(tx, affectedEntityIds, input.transaction_date);
    await assertAccountOwnership(tx, input.paying_account_id, input.paying_entity_id);

    let vendorId = input.vendor_id ?? null;
    if (vendorId) {
      const vendorRows = await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, vendorId));
      if (!vendorRows.length) throw new AccountingError("Vendor not found.", 400, "VENDOR_NOT_FOUND");
    } else if (input.vendor_name?.trim()) {
      const vendorName = input.vendor_name.trim();
      const existing = await tx.select().from(vendors).where(eq(vendors.name, vendorName));
      vendorId = existing[0]?.id ?? null;
      if (!vendorId) {
        const [createdVendor] = await tx.insert(vendors).values({ name: vendorName }).returning();
        vendorId = createdVendor.id;
      }
    }

    const [created] = await tx.insert(transactions).values({
      transaction_date: input.transaction_date,
      transaction_type: "business_expense",
      description: input.description,
      vendor_id: vendorId,
      total_amount: String(input.total_amount),
      business_purpose: input.business_purpose ?? null,
      status: "draft",
      is_balanced: false,
    }).returning();

    await hooks?.afterTransactionCreated?.();

    await tx.insert(transaction_lines).values([
      {
        transaction_id: created.id,
        entity_id: input.paying_entity_id,
        account_id: null,
        category_id: input.category_id ?? null,
        debit: String(input.total_amount),
        credit: "0",
        memo: input.description,
      },
      {
        transaction_id: created.id,
        entity_id: input.paying_entity_id,
        account_id: input.paying_account_id,
        category_id: null,
        debit: "0",
        credit: String(input.total_amount),
        memo: "Payment",
      },
    ]);

    await tx.insert(expense_allocations).values(input.allocations.map((allocation) => ({
      transaction_id: created.id,
      target_entity_id: allocation.target_entity_id,
      category_id: allocation.category_id ?? null,
      allocation_percent: allocation.allocation_percent == null ? null : String(allocation.allocation_percent),
      allocation_amount: String(allocation.allocation_amount),
      memo: allocation.memo ?? null,
      creates_intercompany_balance: allocation.creates_intercompany_balance,
    })));

    const links = input.allocations.filter((allocation) => (
      allocation.creates_intercompany_balance
      && allocation.target_entity_id !== input.paying_entity_id
    ));
    if (links.length) {
      await tx.insert(intercompany_links).values(links.map((allocation) => ({
        source_transaction_id: created.id,
        owing_entity_id: allocation.target_entity_id,
        owed_entity_id: input.paying_entity_id,
        amount: String(allocation.allocation_amount),
        status: "open",
        memo: `From expense: ${input.description}`,
      })));
    }

    const [finalTransaction] = await tx.update(transactions)
      .set({ is_balanced: true, updated_at: new Date() })
      .where(eq(transactions.id, created.id))
      .returning();
    await writeAudit(tx, {
      tableName: "transactions",
      recordId: created.id,
      action: "create_expense",
      newValue: { transaction: finalTransaction, allocations: input.allocations },
    });

    const [lines, allocations] = await Promise.all([
      tx.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, created.id)),
      tx.select({
        allocation: expense_allocations,
        entity_short_code: entities.short_code,
        entity_display_name: entities.display_name,
        entity_primary_color: entities.primary_color,
      }).from(expense_allocations)
        .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
        .where(eq(expense_allocations.transaction_id, created.id)),
    ]);
    const vendorName = vendorId
      ? (await tx.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, vendorId)))[0]?.name ?? null
      : null;

    return {
      transaction: { ...finalTransaction, vendor_name: vendorName, line_count: lines.length, allocation_count: allocations.length },
      lines,
      allocations: allocations.map((row) => ({
        ...row.allocation,
        entity_short_code: row.entity_short_code,
        entity_display_name: row.entity_display_name,
        entity_primary_color: row.entity_primary_color,
      })),
    };
  });
}

export async function updateTransactionRecord(
  transactionId: string,
  input: {
    transaction_date?: string;
    description?: string;
    vendor_id?: string | null;
    total_amount?: number;
    business_purpose?: string | null;
  },
) {
  if (input.total_amount !== undefined) assertPositiveAmount(input.total_amount, "Transaction amount");
  return db.transaction(async (tx) => {
    const existing = await getTransactionOrThrow(tx, transactionId);
    assertTransactionMutable(existing);
    const affectedEntityIds = await getAffectedEntityIds(tx, transactionId);
    await assertEntitiesActive(tx, affectedEntityIds);
    await assertPeriodsOpen(tx, affectedEntityIds, existing.transaction_date);
    if (input.transaction_date && input.transaction_date !== existing.transaction_date) {
      await assertPeriodsOpen(tx, affectedEntityIds, input.transaction_date);
    }
    if (input.vendor_id) {
      const vendorRows = await tx.select({ id: vendors.id }).from(vendors).where(eq(vendors.id, input.vendor_id));
      if (!vendorRows.length) throw new AccountingError("Vendor not found.", 400, "VENDOR_NOT_FOUND");
    }
    const update: Record<string, unknown> = { ...input, updated_at: new Date() };
    if (input.total_amount !== undefined) update.total_amount = String(input.total_amount);
    const [updated] = await tx.update(transactions).set(update).where(eq(transactions.id, transactionId)).returning();
    await writeAudit(tx, {
      tableName: "transactions",
      recordId: transactionId,
      action: "update",
      previousValue: existing,
      newValue: updated,
    });
    return updated;
  });
}

export async function replaceTransactionLines(transactionId: string, lines: TransactionLineInput[]) {
  if (!lines.length) throw new AccountingError("At least one transaction line is required.", 400, "LINES_REQUIRED");
  assertLineShape(lines);
  return db.transaction(async (tx) => {
    const transaction = await getTransactionOrThrow(tx, transactionId);
    assertTransactionMutable(transaction);
    const entityIds = unique(lines.map((line) => line.entity_id));
    await assertEntitiesActive(tx, entityIds);
    await assertPeriodsOpen(tx, entityIds, transaction.transaction_date);
    await assertLineAccounts(tx, lines);
    const previous = await tx.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, transactionId));
    await tx.delete(transaction_lines).where(eq(transaction_lines.transaction_id, transactionId));
    const inserted = await tx.insert(transaction_lines).values(lines.map((line) => ({
      transaction_id: transactionId,
      entity_id: line.entity_id ?? null,
      account_id: line.account_id ?? null,
      category_id: line.category_id ?? null,
      debit: String(line.debit),
      credit: String(line.credit),
      memo: line.memo ?? null,
    }))).returning();
    const totalDebits = lines.reduce((sum, line) => sum + toCents(line.debit), 0);
    const totalCredits = lines.reduce((sum, line) => sum + toCents(line.credit), 0);
    const [updatedTransaction] = await tx.update(transactions).set({
      is_balanced: totalDebits === totalCredits,
      updated_at: new Date(),
    }).where(eq(transactions.id, transactionId)).returning();
    await writeAudit(tx, {
      tableName: "transaction_lines",
      recordId: transactionId,
      action: "replace",
      previousValue: previous,
      newValue: inserted,
    });
    return { transaction: updatedTransaction, lines: inserted };
  });
}

export async function replaceExpenseAllocations(transactionId: string, allocations: AllocationInput[]) {
  return db.transaction(async (tx) => {
    const transaction = await getTransactionOrThrow(tx, transactionId);
    assertTransactionMutable(transaction);
    assertAllocationTotal(transaction.total_amount, allocations);
    const entityIds = unique([
      ...await getAffectedEntityIds(tx, transactionId),
      ...allocations.map((allocation) => allocation.target_entity_id),
    ]);
    await assertEntitiesActive(tx, entityIds);
    await assertPeriodsOpen(tx, entityIds, transaction.transaction_date);

    const priorLinks = await tx.select().from(intercompany_links)
      .where(eq(intercompany_links.source_transaction_id, transactionId));
    if (priorLinks.some((link) => link.status !== "open")) {
      throw new AccountingError(
        "Allocations cannot be replaced after an intercompany balance has been settled or waived.",
        409,
        "INTERCOMPANY_ALREADY_PROCESSED",
      );
    }
    const previous = await tx.select().from(expense_allocations)
      .where(eq(expense_allocations.transaction_id, transactionId));
    await tx.delete(intercompany_links).where(eq(intercompany_links.source_transaction_id, transactionId));
    await tx.delete(expense_allocations).where(eq(expense_allocations.transaction_id, transactionId));
    const inserted = await tx.insert(expense_allocations).values(allocations.map((allocation) => ({
      transaction_id: transactionId,
      target_entity_id: allocation.target_entity_id,
      category_id: allocation.category_id ?? null,
      allocation_percent: allocation.allocation_percent == null ? null : String(allocation.allocation_percent),
      allocation_amount: String(allocation.allocation_amount),
      memo: allocation.memo ?? null,
      creates_intercompany_balance: allocation.creates_intercompany_balance,
    }))).returning();

    const payingEntityRows = await tx.select({ entity_id: transaction_lines.entity_id })
      .from(transaction_lines)
      .where(and(eq(transaction_lines.transaction_id, transactionId), sql`${transaction_lines.credit} > 0`));
    const payingEntityId = payingEntityRows[0]?.entity_id;
    if (!payingEntityId) {
      throw new AccountingError("The paying company could not be resolved from the transaction lines.", 409, "PAYING_ENTITY_MISSING");
    }
    const links = allocations.filter((allocation) => (
      allocation.creates_intercompany_balance && allocation.target_entity_id !== payingEntityId
    ));
    if (links.length) {
      await tx.insert(intercompany_links).values(links.map((allocation) => ({
        source_transaction_id: transactionId,
        owing_entity_id: allocation.target_entity_id,
        owed_entity_id: payingEntityId,
        amount: String(allocation.allocation_amount),
        status: "open",
        memo: `From expense: ${transaction.description}`,
      })));
    }
    await writeAudit(tx, {
      tableName: "expense_allocations",
      recordId: transactionId,
      action: "replace",
      previousValue: previous,
      newValue: inserted,
    });
    return tx.select({
      allocation: expense_allocations,
      entity_short_code: entities.short_code,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    }).from(expense_allocations)
      .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
      .where(eq(expense_allocations.transaction_id, transactionId));
  });
}

export async function postTransaction(transactionId: string) {
  return db.transaction(async (tx) => {
    const transaction = await getTransactionOrThrow(tx, transactionId);
    if (transaction.status === "posted") {
      throw new AccountingError("Transaction is already posted.", 409, "TRANSACTION_POSTED");
    }
    assertTransactionMutable(transaction);
    const lines = await tx.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, transactionId));
    if (lines.length < 2) {
      throw new AccountingError("At least two lines are required to post a transaction.", 400, "INSUFFICIENT_LINES");
    }
    assertLineShape(lines);
    const normalizedLines = lines.map((line) => ({
      ...line,
      debit: Number(line.debit),
      credit: Number(line.credit),
    }));
    await assertLineAccounts(tx, normalizedLines);
    const entityIds = unique(lines.map((line) => line.entity_id));
    await assertEntitiesActive(tx, entityIds);
    await assertPeriodsOpen(tx, entityIds, transaction.transaction_date);
    const debits = lines.reduce((sum, line) => sum + toCents(line.debit), 0);
    const credits = lines.reduce((sum, line) => sum + toCents(line.credit), 0);
    if (debits !== credits) {
      throw new AccountingError("Transaction is not balanced. Debits must equal credits.", 400, "TRANSACTION_UNBALANCED");
    }
    const [updated] = await tx.update(transactions).set({
      status: "posted",
      is_balanced: true,
      updated_at: new Date(),
    }).where(eq(transactions.id, transactionId)).returning();
    await writeAudit(tx, {
      tableName: "transactions",
      recordId: transactionId,
      action: "post",
      previousValue: transaction,
      newValue: updated,
    });
    return updated;
  });
}

export async function voidTransaction(transactionId: string, options: { allowPosted?: boolean } = {}) {
  return db.transaction(async (tx) => {
    const transaction = await getTransactionOrThrow(tx, transactionId);
    if (transaction.status === "voided") {
      throw new AccountingError("Transaction is already voided.", 409, "TRANSACTION_VOIDED");
    }
    if (transaction.status === "posted" && !options.allowPosted) {
      throw new AccountingError(
        "Posted transactions cannot be removed. Use the explicit void action.",
        409,
        "TRANSACTION_POSTED",
      );
    }
    const entityIds = await getAffectedEntityIds(tx, transactionId);
    await assertPeriodsOpen(tx, entityIds, transaction.transaction_date);
    const [updated] = await tx.update(transactions).set({
      status: "voided",
      updated_at: new Date(),
    }).where(eq(transactions.id, transactionId)).returning();
    await writeAudit(tx, {
      tableName: "transactions",
      recordId: transactionId,
      action: "void",
      previousValue: transaction,
      newValue: updated,
    });
    return updated;
  });
}
