import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import * as schema from "@workspace/db/schema";
import { migrateDatabase } from "@workspace/db/migrations";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(resolve(".env"))) {
  process.loadEnvFile(resolve(".env"));
}

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for accounting integration tests.");

const { Client, Pool } = pg;

function urlForDatabase(source: string, databaseName: string): string {
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
}

async function dropDatabase(adminUrl: string, name: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`drop database if exists "${name}" with (force)`);
  } finally {
    await client.end();
  }
}

test("accounting writes are atomic, guarded, balanced, and audited", async (t) => {
  const databaseName = `ff_accounting_test_${randomBytes(5).toString("hex")}`;
  const adminUrl = urlForDatabase(sourceDatabaseUrl, "postgres");
  const testUrl = urlForDatabase(sourceDatabaseUrl, databaseName);
  await createDatabase(adminUrl, databaseName);

  const migrationPool = new Pool({ connectionString: testUrl });
  await migrateDatabase(drizzle(migrationPool, { schema }));
  await migrationPool.end();

  process.env.DATABASE_URL = testUrl;
  const accounting = await import("./accounting");
  const lifecycle = await import("./company-lifecycle");
  const operations = await import("./financial-operations");
  const database = await import("@workspace/db");
  const {
    accounts,
    audit_log,
    categories,
    db,
    entities,
    expense_allocations,
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
  } = database;

  try {
    const [companyA, companyB, inactiveCompany] = await db.insert(entities).values([
      {
        legal_name: "Fixture Alpha LLC",
        display_name: "Fixture Alpha",
        short_code: `FA${randomBytes(2).toString("hex")}`,
        entity_type: "llc",
        lifecycle_status: "active",
        is_active: true,
      },
      {
        legal_name: "Fixture Beta LLC",
        display_name: "Fixture Beta",
        short_code: `FB${randomBytes(2).toString("hex")}`,
        entity_type: "llc",
        lifecycle_status: "active",
        is_active: true,
      },
      {
        legal_name: "Fixture Closed LLC",
        display_name: "Fixture Closed",
        short_code: `FC${randomBytes(2).toString("hex")}`,
        entity_type: "llc",
        lifecycle_status: "closed",
        is_active: false,
      },
    ]).returning();
    const [accountA, accountB, inactiveAccount] = await db.insert(accounts).values([
      { entity_id: companyA.id, name: "Alpha Checking", account_type: "checking", is_active: true },
      { entity_id: companyB.id, name: "Beta Checking", account_type: "checking", is_active: true },
      { entity_id: inactiveCompany.id, name: "Closed Checking", account_type: "checking", is_active: true },
    ]).returning();
    const [category] = await db.insert(categories).values({
      name: "Fixture Software",
      category_type: "expense",
      is_active: true,
    }).returning();

    const julyExpense = {
      transaction_date: "2026-07-10",
      vendor_name: "Fixture Vendor",
      description: "Shared fixture expense",
      business_purpose: "Accounting integration fixture",
      total_amount: 100,
      paying_entity_id: companyA.id,
      paying_account_id: accountA.id,
      category_id: category.id,
      allocations: [
        {
          target_entity_id: companyA.id,
          category_id: category.id,
          allocation_percent: 60,
          allocation_amount: 60,
          creates_intercompany_balance: false,
        },
        {
          target_entity_id: companyB.id,
          category_id: category.id,
          allocation_percent: 40,
          allocation_amount: 40,
          creates_intercompany_balance: true,
        },
      ],
    };

    await t.test("manual expense creates balanced lines, allocations, intercompany, and audit atomically", async () => {
      const created = await accounting.createManualExpense(julyExpense);
      assert.equal(created.lines.length, 2);
      assert.equal(created.allocations.length, 2);
      const debit = created.lines.find((line) => Number(line.debit) > 0);
      const credit = created.lines.find((line) => Number(line.credit) > 0);
      assert.equal(debit?.account_id, null);
      assert.equal(debit?.category_id, category.id);
      assert.equal(credit?.account_id, accountA.id);
      assert.equal(created.transaction.is_balanced, true);

      const links = await db.select().from(intercompany_links)
        .where(eq(intercompany_links.source_transaction_id, created.transaction.id));
      assert.equal(links.length, 1);
      assert.equal(links[0].owing_entity_id, companyB.id);
      assert.equal(links[0].owed_entity_id, companyA.id);
      assert.equal(Number(links[0].amount), 40);

      const audits = await db.select().from(audit_log).where(eq(audit_log.record_id, created.transaction.id));
      assert.equal(audits.some((audit) => audit.action === "create_expense"), true);

      await accounting.postTransaction(created.transaction.id);
      await assert.rejects(
        accounting.updateTransactionRecord(created.transaction.id, { description: "Unsafe edit" }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "TRANSACTION_POSTED",
      );
      await assert.rejects(
        accounting.replaceTransactionLines(created.transaction.id, [
          { entity_id: companyA.id, debit: 100, credit: 0 },
          { entity_id: companyA.id, account_id: accountA.id, debit: 0, credit: 100 },
        ]),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "TRANSACTION_POSTED",
      );
      await assert.rejects(
        accounting.replaceExpenseAllocations(created.transaction.id, julyExpense.allocations),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "TRANSACTION_POSTED",
      );
      const voided = await accounting.voidTransaction(created.transaction.id, { allowPosted: true });
      assert.equal(voided.status, "voided");
      await assert.rejects(
        accounting.voidTransaction(created.transaction.id, { allowPosted: true }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "TRANSACTION_VOIDED",
      );
    });

    await t.test("allocation mismatch and account ownership fail before writes", async () => {
      const before = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      await assert.rejects(
        accounting.createManualExpense({
          ...julyExpense,
          allocations: [{ ...julyExpense.allocations[0], allocation_amount: 99 }],
        }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "ALLOCATION_TOTAL_MISMATCH",
      );
      await assert.rejects(
        accounting.createManualExpense({ ...julyExpense, paying_account_id: accountB.id }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "ACCOUNT_ENTITY_MISMATCH",
      );
      const after = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      assert.equal(after[0].count, before[0].count);
    });

    await t.test("forced failure rolls back the complete expense graph", async () => {
      const before = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      await assert.rejects(
        accounting.createManualExpense(
          { ...julyExpense, vendor_name: "Rollback Vendor", description: "Rollback fixture" },
          { afterTransactionCreated: () => { throw new Error("simulated failure"); } },
        ),
        /simulated failure/,
      );
      const after = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      assert.equal(after[0].count, before[0].count);
    });

    await t.test("inactive companies and closed periods block new and existing mutations", async () => {
      await assert.rejects(
        accounting.createManualExpense({
          ...julyExpense,
          paying_entity_id: inactiveCompany.id,
          paying_account_id: inactiveAccount.id,
          allocations: [{
            target_entity_id: inactiveCompany.id,
            category_id: category.id,
            allocation_percent: 100,
            allocation_amount: 100,
            creates_intercompany_balance: false,
          }],
        }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "ENTITY_INACTIVE",
      );

      const august = await accounting.createManualExpense({
        ...julyExpense,
        transaction_date: "2026-08-05",
        description: "August close fixture",
      });
      await db.insert(monthly_close_periods).values([
        { entity_id: companyA.id, period_month: "2026-08-01", status: "closed", closed_at: new Date() },
        { entity_id: companyB.id, period_month: "2026-08-01", status: "closed", closed_at: new Date() },
      ]);
      await assert.rejects(
        accounting.updateTransactionRecord(august.transaction.id, { description: "Blocked edit" }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "PERIOD_CLOSED",
      );
      await assert.rejects(
        accounting.postTransaction(august.transaction.id),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "PERIOD_CLOSED",
      );
      await assert.rejects(
        accounting.voidTransaction(august.transaction.id),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "PERIOD_CLOSED",
      );
      await assert.rejects(
        accounting.createManualExpense({ ...julyExpense, transaction_date: "2026-08-20" }),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "PERIOD_CLOSED",
      );
    });

    await t.test("unbalanced posting and database constraint violations fail closed", async () => {
      const header = await accounting.createTransactionHeader({
        transaction_date: "2026-09-10",
        transaction_type: "adjustment",
        description: "Unbalanced fixture",
        total_amount: 50,
      });
      await accounting.replaceTransactionLines(header.id, [
        { entity_id: companyA.id, debit: 50, credit: 0, category_id: category.id },
        { entity_id: companyA.id, debit: 0, credit: 40, account_id: accountA.id },
      ]);
      await assert.rejects(
        accounting.postTransaction(header.id),
        (error: unknown) => error instanceof accounting.AccountingError && error.code === "TRANSACTION_UNBALANCED",
      );
      await assert.rejects(
        db.insert(transaction_lines).values({
          transaction_id: header.id,
          entity_id: companyA.id,
          debit: "10",
          credit: "10",
        }),
        (error: unknown) => typeof error === "object" && error !== null,
      );
    });

    const materialAudits = await db.select().from(audit_log);
    assert.equal(materialAudits.some((audit) => audit.action === "create_expense"), true);
    assert.equal(materialAudits.some((audit) => audit.action === "post"), true);
    assert.equal(materialAudits.some((audit) => audit.action === "void"), true);

    await t.test("company lifecycle is atomic, preserves records, and maintains account state", async () => {
      const shortCode = `LC${randomBytes(2).toString("hex")}`.toUpperCase();
      const created = await lifecycle.createCompany({
        legal_name: "Lifecycle Fixture LLC",
        display_name: "Lifecycle Fixture",
        short_code: shortCode,
        entity_type: "llc",
      });
      const defaultAccounts = await db.select().from(accounts).where(eq(accounts.entity_id, created.id));
      assert.equal(defaultAccounts.length, 2);
      assert.equal(defaultAccounts.every((account) => account.is_active), true);
      assert.equal(defaultAccounts.some((account) => account.is_tax_reserve), true);
      await db.update(accounts).set({ current_balance: "125.00" }).where(eq(accounts.id, defaultAccounts[0].id));
      const closureAssessment = await lifecycle.assessCompanyClosure(created.id);
      assert.equal(closureAssessment.nonzero_accounts.length, 1);
      assert.equal(closureAssessment.warnings.some((warning) => warning.includes("non-zero balance")), true);

      const closed = await lifecycle.closeCompany(created.id, { archive_reason: "Operations ended." });
      assert.equal(closed.lifecycle_status, "closed");
      assert.equal(closed.is_active, false);
      const closedAccounts = await db.select().from(accounts).where(eq(accounts.entity_id, created.id));
      assert.equal(closedAccounts.every((account) => !account.is_active), true);

      const archived = await lifecycle.archiveCompany(created.id, {
        archive_reason: "Retained for statutory records.",
        archive_until: new Date("2033-12-31T00:00:00.000Z"),
      });
      assert.equal(archived.lifecycle_status, "archived");
      assert.equal(archived.archive_reason, "Retained for statutory records.");

      const reopened = await lifecycle.reopenCompany(created.id);
      assert.equal(reopened.lifecycle_status, "active");
      assert.equal(reopened.is_active, true);
      assert.equal(reopened.closed_at, null);
      const reopenedAccounts = await db.select().from(accounts).where(eq(accounts.entity_id, created.id));
      assert.equal(reopenedAccounts.every((account) => account.is_active), true);

      const lifecycleAudits = await db.select().from(audit_log).where(eq(audit_log.record_id, created.id));
      assert.deepEqual(
        lifecycleAudits.map((audit) => audit.action).sort(),
        ["archive", "close", "create", "reopen"],
      );
    });

    await t.test("protected personal records and forced lifecycle failures leave no partial writes", async () => {
      const [personal] = await db.insert(entities).values({
        legal_name: "Personal / Founder",
        display_name: "Personal / Founder",
        short_code: "PERSONAL",
        entity_type: "personal",
        lifecycle_status: "active",
        is_active: true,
      }).returning();
      await assert.rejects(
        lifecycle.closeCompany(personal.id, {}),
        (error: unknown) => error instanceof lifecycle.CompanyLifecycleError
          && error.code === "PERSONAL_LIFECYCLE_PROTECTED",
      );

      const rollbackCode = `RB${randomBytes(2).toString("hex")}`.toUpperCase();
      await assert.rejects(
        lifecycle.createCompany({
          legal_name: "Lifecycle Rollback LLC",
          display_name: "Lifecycle Rollback",
          short_code: rollbackCode,
          entity_type: "llc",
        }, { afterCompanyCreated: () => { throw new Error("simulated lifecycle failure"); } }),
        /simulated lifecycle failure/,
      );
      const rolledBack = await db.select().from(entities).where(eq(entities.short_code, rollbackCode));
      assert.equal(rolledBack.length, 0);
    });

    await t.test("settlements and owner contributions create balanced, linked, idempotent journals", async () => {
      const [link] = await db.insert(intercompany_links).values({
        owing_entity_id: companyB.id,
        owed_entity_id: companyA.id,
        amount: "75.00",
        status: "open",
      }).returning();
      const settled = await operations.settleIntercompanyLink(link.id, {
        payment_date: "2026-09-15",
        memo: "September settlement fixture",
      });
      assert.equal(settled.status, "paid");
      assert.ok(settled.reimbursement_transaction_id);
      const settlementLines = await db.select().from(transaction_lines)
        .where(eq(transaction_lines.transaction_id, settled.reimbursement_transaction_id!));
      assert.equal(settlementLines.length, 4);
      assert.equal(settlementLines.reduce((sum, line) => sum + Number(line.debit), 0), 150);
      assert.equal(settlementLines.reduce((sum, line) => sum + Number(line.credit), 0), 150);
      assert.equal(settlementLines.some((line) => line.account_id === accountA.id), true);
      assert.equal(settlementLines.some((line) => line.account_id === accountB.id), true);
      await assert.rejects(
        operations.settleIntercompanyLink(link.id, { payment_date: "2026-09-15" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "INTERCOMPANY_ALREADY_PROCESSED",
      );

      const [reimbursement] = await db.insert(reimbursement_requests).values({
        owed_to_entity_id: companyA.id,
        owed_by_entity_id: companyB.id,
        amount: "30.00",
        status: "pending",
      }).returning();
      const paid = await operations.settleReimbursement(reimbursement.id, { payment_date: "2026-09-16" });
      assert.equal(paid.status, "paid");
      assert.ok(paid.paid_transaction_id);
      const reimbursementLines = await db.select().from(transaction_lines)
        .where(eq(transaction_lines.transaction_id, paid.paid_transaction_id!));
      assert.equal(reimbursementLines.length, 4);
      assert.equal(reimbursementLines.reduce((sum, line) => sum + Number(line.debit), 0), 60);
      assert.equal(reimbursementLines.reduce((sum, line) => sum + Number(line.credit), 0), 60);
      await assert.rejects(
        operations.settleReimbursement(reimbursement.id, { payment_date: "2026-09-16" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "REIMBURSEMENT_ALREADY_PROCESSED",
      );

      const [waiverRequest] = await db.insert(reimbursement_requests).values({
        owed_to_entity_id: companyA.id,
        owed_by_entity_id: companyB.id,
        amount: "18.00",
        status: "pending",
      }).returning();
      const waived = await operations.waiveReimbursement(waiverRequest.id, {
        effective_date: "2026-09-17",
        memo: "Mutually approved write-off fixture",
      });
      assert.equal(waived.status, "waived");
      assert.ok(waived.paid_transaction_id);
      const waiverLines = await db.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, waived.paid_transaction_id!));
      assert.equal(waiverLines.length, 4);
      assert.equal(waiverLines.reduce((sum, line) => sum + Number(line.debit), 0), 36);
      assert.equal(waiverLines.reduce((sum, line) => sum + Number(line.credit), 0), 36);

      const [personal] = await db.select().from(entities).where(eq(entities.short_code, "PERSONAL"));
      assert.ok(personal);
      const [convertRequest] = await db.insert(reimbursement_requests).values({
        owed_to_entity_id: personal.id,
        owed_by_entity_id: companyB.id,
        amount: "42.00",
        status: "pending",
      }).returning();
      const converted = await operations.convertReimbursementToContribution(convertRequest.id, {
        effective_date: "2026-09-17",
        memo: "Owner elected to capitalize reimbursement fixture",
      });
      assert.equal(converted.status, "converted");
      const convertedContributions = await db.select().from(owner_contributions).where(eq(owner_contributions.transaction_id, converted.paid_transaction_id!));
      assert.equal(convertedContributions.length, 1);
      assert.equal(convertedContributions[0].entity_id, companyB.id);

      const ownerResult = await operations.createOwnerContribution({
        entity_id: companyA.id,
        amount: 500,
        contribution_type: "capital_contribution",
        contribution_date: "2026-09-12",
        memo: "Capital fixture",
      });
      const contributionRows = await db.select().from(owner_contributions)
        .where(eq(owner_contributions.id, ownerResult.contribution.id));
      assert.equal(contributionRows.length, 1);
      const ownerLines = await db.select().from(transaction_lines)
        .where(eq(transaction_lines.transaction_id, ownerResult.contribution.transaction_id!));
      assert.equal(ownerLines.length, 2);
      assert.equal(ownerLines.reduce((sum, line) => sum + Number(line.debit), 0), 500);
      assert.equal(ownerLines.reduce((sum, line) => sum + Number(line.credit), 0), 500);

      const drawResult = await operations.createOwnerDraw({
        entity_id: companyA.id,
        amount: 125,
        draw_date: "2026-09-18",
        memo: "Owner draw fixture",
      });
      const drawRows = await db.select().from(owner_draws).where(eq(owner_draws.id, drawResult.draw.id));
      assert.equal(drawRows[0].draw_date, "2026-09-18");
      const drawLines = await db.select().from(transaction_lines)
        .where(eq(transaction_lines.transaction_id, drawResult.draw.transaction_id!));
      assert.equal(drawLines.length, 2);
      assert.equal(drawLines.reduce((sum, line) => sum + Number(line.debit), 0), 125);
      assert.equal(drawLines.reduce((sum, line) => sum + Number(line.credit), 0), 125);
      assert.equal(drawLines.some((line) => line.account_id === accountA.id && Number(line.credit) === 125), true);
    });

    await t.test("reconciliation is account-aware, posted-only, audited, and duplicate-safe", async () => {
      const [transaction] = await db.insert(transactions).values({
        transaction_date: "2026-09-20",
        transaction_type: "expense",
        description: "Reconciliation fixture",
        total_amount: "25.00",
        status: "posted",
        is_balanced: true,
      }).returning();
      await db.insert(transaction_lines).values([
        { transaction_id: transaction.id, entity_id: companyA.id, debit: "25", credit: "0", category_id: category.id },
        { transaction_id: transaction.id, entity_id: companyA.id, account_id: accountA.id, debit: "0", credit: "25" },
      ]);
      const [statement] = await db.insert(statements).values({
        account_id: accountA.id,
        statement_month: "2026-09-01",
        status: "reconciling",
      }).returning();
      const [line] = await db.insert(statement_lines).values({
        statement_id: statement.id,
        transaction_date: "2026-09-20",
        description: "Reconciliation fixture",
        amount: "-25.00",
        status: "unmatched",
      }).returning();
      const matched = await operations.matchStatementLine(line.id, {
        transaction_id: transaction.id,
        match_type: "manual",
      });
      assert.equal(matched.line.status, "matched");
      const matches = await db.select().from(reconciliation_matches)
        .where(eq(reconciliation_matches.statement_line_id, line.id));
      assert.equal(matches.length, 1);
      await assert.rejects(
        operations.matchStatementLine(line.id, { transaction_id: transaction.id, match_type: "manual" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "STATEMENT_LINE_ALREADY_MATCHED",
      );

      const archived = await operations.archiveStatement(statement.id);
      assert.ok(archived.archived_at);
      assert.equal(archived.status, "reconciling");
      assert.equal((await db.select().from(statement_lines).where(eq(statement_lines.statement_id, statement.id))).length, 1);
      assert.equal((await db.select().from(reconciliation_matches).where(eq(reconciliation_matches.statement_line_id, line.id))).length, 1);
      assert.equal(
        (await db.select().from(audit_log).where(eq(audit_log.record_id, statement.id))).some((audit) => audit.action === "archive"),
        true,
      );
      await assert.rejects(
        operations.matchStatementLine(line.id, { transaction_id: transaction.id, match_type: "manual" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "STATEMENT_ARCHIVED",
      );
    });

    await t.test("statement imports are atomic, duplicate-safe, and audited", async () => {
      const [statement] = await db.insert(statements).values({
        account_id: accountA.id,
        statement_month: "2026-10-01",
        status: "uploaded",
      }).returning();
      const importRows = [
        { sourceRow: 2, transaction_date: "2026-10-02", posted_date: null, description: "Imported debit", amount: -18.25, balance_after: 981.75 },
        { sourceRow: 3, transaction_date: "2026-10-03", posted_date: "2026-10-04", description: "Imported credit", amount: 40, balance_after: 1021.75 },
      ];
      const first = await operations.importStatementLines(statement.id, importRows, { skipDuplicates: false, sourceFileName: "october.csv" });
      assert.equal(first.inserted.length, 2);
      assert.equal(first.skipped_duplicate_count, 0);

      await assert.rejects(
        operations.importStatementLines(statement.id, importRows, { skipDuplicates: false, sourceFileName: "october.csv" }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "STATEMENT_IMPORT_DUPLICATES",
      );
      assert.equal((await db.select().from(statement_lines).where(eq(statement_lines.statement_id, statement.id))).length, 2);

      const withNewRow = [...importRows, { sourceRow: 4, transaction_date: "2026-10-05", posted_date: null, description: "Only new row", amount: -7.5, balance_after: 1014.25 }];
      const skipped = await operations.importStatementLines(statement.id, withNewRow, { skipDuplicates: true, sourceFileName: "october-revised.csv" });
      assert.equal(skipped.inserted.length, 1);
      assert.equal(skipped.skipped_duplicate_count, 2);
      assert.equal((await db.select().from(statement_lines).where(eq(statement_lines.statement_id, statement.id))).length, 3);
      assert.equal(
        (await db.select().from(audit_log).where(eq(audit_log.record_id, statement.id))).filter((audit) => audit.action === "import_csv").length,
        2,
      );
    });

    await t.test("closed periods reject settlement, reimbursement, contribution, and reconciliation writes", async () => {
      const transactionCountBefore = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      const [closedLink] = await db.insert(intercompany_links).values({
        owing_entity_id: companyB.id,
        owed_entity_id: companyA.id,
        amount: "45.00",
        status: "open",
      }).returning();
      await assert.rejects(
        operations.settleIntercompanyLink(closedLink.id, { payment_date: "2026-08-18" }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "PERIOD_CLOSED",
      );
      const [unchangedLink] = await db.select().from(intercompany_links).where(eq(intercompany_links.id, closedLink.id));
      assert.equal(unchangedLink.status, "open");
      assert.equal(unchangedLink.reimbursement_transaction_id, null);

      const [closedReimbursement] = await db.insert(reimbursement_requests).values({
        owed_to_entity_id: companyA.id,
        owed_by_entity_id: companyB.id,
        amount: "20.00",
        status: "pending",
      }).returning();
      await assert.rejects(
        operations.settleReimbursement(closedReimbursement.id, { payment_date: "2026-08-18" }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "PERIOD_CLOSED",
      );
      await assert.rejects(
        operations.createOwnerContribution({
          entity_id: companyA.id,
          amount: 100,
          contribution_type: "capital_contribution",
          contribution_date: "2026-08-18",
        }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "PERIOD_CLOSED",
      );

      const [posted] = await db.insert(transactions).values({
        transaction_date: "2026-08-19",
        transaction_type: "expense",
        description: "Closed reconciliation fixture",
        total_amount: "15.00",
        status: "posted",
        is_balanced: true,
      }).returning();
      await db.insert(transaction_lines).values([
        { transaction_id: posted.id, entity_id: companyA.id, debit: "15", credit: "0", category_id: category.id },
        { transaction_id: posted.id, entity_id: companyA.id, account_id: accountA.id, debit: "0", credit: "15" },
      ]);
      const [statement] = await db.insert(statements).values({
        account_id: accountA.id,
        statement_month: "2026-08-01",
        status: "reconciling",
      }).returning();
      const [line] = await db.insert(statement_lines).values({
        statement_id: statement.id,
        transaction_date: "2026-08-19",
        amount: "-15.00",
        status: "unmatched",
      }).returning();
      await assert.rejects(
        operations.matchStatementLine(line.id, { transaction_id: posted.id, match_type: "manual" }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "PERIOD_CLOSED",
      );
      await assert.rejects(
        operations.importStatementLines(statement.id, [{
          sourceRow: 2,
          transaction_date: "2026-08-20",
          posted_date: null,
          description: "Closed import fixture",
          amount: -9,
          balance_after: null,
        }], { skipDuplicates: false, sourceFileName: "closed.csv" }),
        (error: unknown) => error instanceof operations.FinancialOperationError && error.code === "PERIOD_CLOSED",
      );
      const [unchangedLine] = await db.select().from(statement_lines).where(eq(statement_lines.id, line.id));
      assert.equal(unchangedLine.status, "unmatched");
      assert.equal(unchangedLine.matched_transaction_id, null);
      assert.equal((await db.select().from(statement_lines).where(eq(statement_lines.statement_id, statement.id))).length, 1);
      const transactionCountAfter = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(transactions);
      assert.equal(transactionCountAfter[0].count, transactionCountBefore[0].count + 1);
    });

    await t.test("monthly close requires a complete checklist and an audited correction memo to reopen", async () => {
      const created = await operations.createMonthlyClosePeriod({
        entity_id: companyA.id,
        period_month: "2026-10-01",
      });
      await assert.rejects(
        operations.updateMonthlyClosePeriod(created.period.id, { status: "closed" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "CLOSE_CHECKLIST_INCOMPLETE",
      );
      const closed = await operations.updateMonthlyClosePeriod(created.period.id, {
        status: "closed",
        all_statements_uploaded: true,
        all_transactions_reconciled: true,
        all_receipts_attached: true,
        all_allocations_complete: true,
        intercompany_reviewed: true,
        tax_reserve_reviewed: true,
        export_generated: true,
      });
      assert.equal(closed.period.status, "closed");
      await assert.rejects(
        operations.updateMonthlyClosePeriod(created.period.id, { status: "reopened" }),
        (error: unknown) => error instanceof operations.FinancialOperationError
          && error.code === "CORRECTION_MEMO_REQUIRED",
      );
      const reopened = await operations.updateMonthlyClosePeriod(created.period.id, {
        status: "reopened",
        correction_memo: "Correcting a reconciled fixture.",
      });
      assert.equal(reopened.period.status, "reopened");
      assert.equal(reopened.period.correction_memo, "Correcting a reconciled fixture.");
      const correction = await operations.createOwnerContribution({
        entity_id: companyA.id,
        amount: 25,
        contribution_type: "capital_contribution",
        contribution_date: "2026-10-10",
        memo: "Permitted after documented reopen.",
      });
      assert.ok(correction.contribution.id);
    });
  } finally {
    await database.pool.end();
    await dropDatabase(adminUrl, databaseName);
  }
});
