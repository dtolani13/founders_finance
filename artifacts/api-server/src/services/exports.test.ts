import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { existsSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import test from "node:test";
import * as schema from "@workspace/db/schema";
import { migrateDatabase } from "@workspace/db/migrations";
import { drizzle } from "drizzle-orm/node-postgres";
import express from "express";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(resolve(".env"))) {
  process.loadEnvFile(resolve(".env"));
}

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for export integration tests.");

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

type ExportResult = {
  export_type: string;
  entity_id: string | null;
  period_month: string | null;
  record_count: number;
  records: Record<string, unknown>[];
  generated_at: string;
};

test("all production exports preserve source identity, filters, counts, and totals", async () => {
  const databaseName = `ff_exports_test_${randomBytes(5).toString("hex")}`;
  const adminUrl = urlForDatabase(sourceDatabaseUrl, "postgres");
  const testUrl = urlForDatabase(sourceDatabaseUrl, databaseName);
  await createDatabase(adminUrl, databaseName);

  const migrationPool = new Pool({ connectionString: testUrl });
  await migrateDatabase(drizzle(migrationPool, { schema }));
  await migrationPool.end();

  process.env.DATABASE_URL = testUrl;
  const database = await import("@workspace/db");
  const exportsRouter = (await import("../routes/exports")).default;
  const {
    accounts,
    categories,
    db,
    documents,
    entities,
    expense_allocations,
    intercompany_links,
    monthly_close_periods,
    owner_contributions,
    owner_draws,
    reimbursement_requests,
    statement_lines,
    statements,
    tax_reserve_rules,
    transaction_lines,
    transactions,
    vendors,
  } = database;

  const app = express();
  app.use("/api/exports", exportsRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const [companyA, companyB, personal, archived] = await db.insert(entities).values([
      { legal_name: "Export Alpha LLC", display_name: "Export Alpha", short_code: "EXPA", entity_type: "llc" },
      { legal_name: "Export Beta LLC", display_name: "Export Beta", short_code: "EXPB", entity_type: "llc" },
      { legal_name: "Personal", display_name: "Personal", short_code: "PERSONAL", entity_type: "personal" },
      {
        legal_name: "Archived Export LLC",
        display_name: "Archived Export",
        short_code: "EXPARC",
        entity_type: "llc",
        lifecycle_status: "archived",
        is_active: false,
        closed_at: new Date("2026-06-30T12:00:00.000Z"),
        archive_until: new Date("2033-06-30T12:00:00.000Z"),
        archive_reason: "Fixture retention period",
      },
    ]).returning();
    const [accountA, accountB] = await db.insert(accounts).values([
      { entity_id: companyA.id, name: "Alpha Checking", account_type: "checking" },
      { entity_id: companyB.id, name: "Beta Checking", account_type: "checking" },
    ]).returning();
    const [category] = await db.insert(categories).values({
      name: "Export Software",
      category_type: "expense",
    }).returning();
    const [vendor] = await db.insert(vendors).values({ name: "Export Vendor" }).returning();

    const [julyExpense, augustExpense, contributionTx, drawTx] = await db.insert(transactions).values([
      { transaction_date: "2026-07-10", transaction_type: "expense", description: "July allocation", vendor_id: vendor.id, total_amount: "100", status: "posted", is_balanced: true },
      { transaction_date: "2026-08-10", transaction_type: "expense", description: "August allocation", total_amount: "25", status: "posted", is_balanced: true },
      { transaction_date: "2026-07-15", transaction_type: "owner_contribution", description: "July contribution", total_amount: "500", status: "posted", is_balanced: true },
      { transaction_date: "2026-07-20", transaction_type: "owner_draw", description: "July draw", total_amount: "125", status: "posted", is_balanced: true },
    ]).returning();
    await db.insert(transaction_lines).values([
      { transaction_id: julyExpense.id, entity_id: companyA.id, category_id: category.id, debit: "60", credit: "0" },
      { transaction_id: julyExpense.id, entity_id: personal.id, category_id: category.id, debit: "40", credit: "0" },
      { transaction_id: julyExpense.id, entity_id: companyA.id, account_id: accountA.id, debit: "0", credit: "100" },
      { transaction_id: augustExpense.id, entity_id: companyB.id, category_id: category.id, debit: "25", credit: "0" },
      { transaction_id: augustExpense.id, entity_id: companyB.id, account_id: accountB.id, debit: "0", credit: "25" },
      { transaction_id: contributionTx.id, entity_id: companyA.id, account_id: accountA.id, debit: "500", credit: "0" },
      { transaction_id: contributionTx.id, entity_id: companyA.id, debit: "0", credit: "500" },
      { transaction_id: drawTx.id, entity_id: companyA.id, debit: "125", credit: "0" },
      { transaction_id: drawTx.id, entity_id: companyA.id, account_id: accountA.id, debit: "0", credit: "125" },
    ]);
    await db.insert(expense_allocations).values([
      { transaction_id: julyExpense.id, target_entity_id: companyA.id, category_id: category.id, allocation_percent: "60", allocation_amount: "60", memo: "Alpha share" },
      { transaction_id: julyExpense.id, target_entity_id: personal.id, category_id: category.id, allocation_percent: "40", allocation_amount: "40", memo: "Personal share" },
      { transaction_id: augustExpense.id, target_entity_id: companyB.id, category_id: category.id, allocation_percent: "100", allocation_amount: "25", memo: "Beta share" },
    ]);
    await db.insert(owner_contributions).values({
      transaction_id: contributionTx.id,
      entity_id: companyA.id,
      amount: "500",
      contribution_type: "capital_contribution",
      contribution_date: "2026-07-15",
      memo: "Fixture contribution",
    });
    await db.insert(owner_draws).values({
      transaction_id: drawTx.id,
      entity_id: companyA.id,
      amount: "125",
      draw_date: "2026-07-20",
      memo: "Fixture draw",
    });
    await db.insert(reimbursement_requests).values({
      original_transaction_id: julyExpense.id,
      owed_to_entity_id: companyA.id,
      owed_by_entity_id: companyB.id,
      amount: "15",
      status: "paid",
      paid_transaction_id: augustExpense.id,
      memo: "Fixture reimbursement",
    });
    await db.insert(intercompany_links).values({
      source_transaction_id: julyExpense.id,
      owing_entity_id: companyB.id,
      owed_entity_id: companyA.id,
      amount: "35",
      status: "paid",
      reimbursement_transaction_id: augustExpense.id,
      memo: "Fixture intercompany",
    });
    await db.insert(tax_reserve_rules).values({
      entity_id: companyA.id,
      reserve_percent: "24",
      rule_basis: "revenue",
      notes: "Fixture reserve",
    });
    await db.insert(documents).values({
      document_type: "receipt",
      file_name: "july-receipt.pdf",
      entity_id: companyA.id,
      account_id: accountA.id,
      transaction_id: julyExpense.id,
      period_month: "2026-07-01",
      description: "Fixture receipt",
      evidence_status: "metadata_only",
    });
    await db.insert(monthly_close_periods).values({
      entity_id: companyA.id,
      period_month: "2026-07-01",
      status: "closed",
      all_statements_uploaded: true,
      all_transactions_reconciled: true,
      all_receipts_attached: true,
      all_allocations_complete: true,
      intercompany_reviewed: true,
      tax_reserve_reviewed: true,
      export_generated: true,
      closed_at: new Date("2026-08-01T12:00:00.000Z"),
    });
    const [statement] = await db.insert(statements).values({
      account_id: accountA.id,
      statement_month: "2026-07-01",
      opening_balance: "1000",
      closing_balance: "900",
      status: "reconciled",
    }).returning();
    await db.insert(statement_lines).values([
      { statement_id: statement.id, transaction_date: "2026-07-10", amount: "-100", status: "matched", matched_transaction_id: julyExpense.id },
      { statement_id: statement.id, transaction_date: "2026-07-11", amount: "10", status: "unmatched" },
    ]);

    async function getExport(type: string, params: Record<string, string> = {}): Promise<ExportResult> {
      const query = new URLSearchParams(params);
      const response = await fetch(`${baseUrl}/api/exports/${type}?${query}`);
      assert.equal(response.status, 200, `${type} should return 200`);
      const result = await response.json() as ExportResult;
      assert.equal(result.export_type, type);
      assert.equal(result.record_count, result.records.length);
      assert.ok(Number.isFinite(Date.parse(result.generated_at)));
      return result;
    }

    function requireColumns(result: ExportResult, columns: string[]): void {
      assert.ok(result.records.length > 0, `${result.export_type} should contain fixture rows`);
      for (const column of columns) {
        assert.ok(column in result.records[0], `${result.export_type} is missing ${column}`);
      }
    }

    const transactionExport = await getExport("all_transactions", { period_month: "2026-07-01" });
    assert.equal(transactionExport.record_count, 3);
    requireColumns(transactionExport, ["id", "entity_ids", "entity_short_codes", "date", "type", "amount", "status"]);
    assert.equal(transactionExport.records.reduce((sum, row) => sum + Number(row.amount), 0), 725);

    const byEntity = await getExport("expenses_by_entity", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(byEntity.record_count, 1);
    requireColumns(byEntity, ["transaction_id", "transaction_date", "transaction_status", "entity_id", "entity_short_code", "amount"]);
    assert.equal(Number(byEntity.records[0].amount), 60);

    const byCategory = await getExport("expenses_by_category", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(byCategory.record_count, 1);
    requireColumns(byCategory, ["transaction_id", "entity_id", "category_id", "category", "amount"]);

    const contributions = await getExport("owner_contributions", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(contributions.record_count, 1);
    requireColumns(contributions, ["id", "transaction_id", "transaction_status", "entity_id", "amount", "date"]);
    assert.equal(Number(contributions.records[0].amount), 500);

    const draws = await getExport("owner_draws", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(draws.record_count, 1);
    requireColumns(draws, ["id", "transaction_id", "transaction_status", "entity_id", "amount", "date"]);
    assert.equal(Number(draws.records[0].amount), 125);

    const retention = await getExport("company_retention");
    assert.equal(retention.record_count, 1);
    requireColumns(retention, ["id", "legal_name", "short_code", "lifecycle_status", "closed_at", "archive_until", "archive_reason"]);
    assert.equal(retention.records[0].id, archived.id);

    const reimbursements = await getExport("reimbursements", { entity_id: companyA.id });
    assert.equal(reimbursements.record_count, 1);
    requireColumns(reimbursements, ["id", "original_transaction_id", "paid_transaction_id", "status", "owed_to_entity_id", "owed_by_entity_id", "amount"]);

    const intercompany = await getExport("intercompany_balances", { entity_id: companyA.id });
    assert.equal(intercompany.record_count, 1);
    requireColumns(intercompany, ["id", "source_transaction_id", "settlement_transaction_id", "status", "owing_entity_id", "owed_entity_id", "amount"]);

    const taxReserve = await getExport("tax_reserve_activity", { entity_id: companyA.id });
    assert.equal(taxReserve.record_count, 1);
    requireColumns(taxReserve, ["id", "entity_id", "entity_short_code", "percent", "basis", "is_active"]);
    assert.equal(Number(taxReserve.records[0].percent), 24);

    const documentIndex = await getExport("document_index", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(documentIndex.record_count, 1);
    requireColumns(documentIndex, ["id", "entity_id", "account_id", "transaction_id", "period_month", "status", "file_sha256", "archived_at"]);

    const personalExport = await getExport("personal_non_deductible", { period_month: "2026-07-01" });
    assert.equal(personalExport.record_count, 1);
    requireColumns(personalExport, ["transaction_id", "transaction_date", "transaction_status", "entity_id", "entity_short_code", "amount"]);
    assert.equal(Number(personalExport.records[0].amount), 40);

    const closeSummary = await getExport("monthly_close_summary", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(closeSummary.record_count, 1);
    requireColumns(closeSummary, ["id", "entity_id", "entity_short_code", "period_month", "status", "export_generated"]);

    const reconciliation = await getExport("statement_reconciliation_summary", { entity_id: companyA.id, period_month: "2026-07-01" });
    assert.equal(reconciliation.record_count, 1);
    requireColumns(reconciliation, ["id", "account_id", "entity_id", "month", "status", "total_lines", "matched_lines", "unmatched_lines"]);
    assert.equal(reconciliation.records[0].total_lines, 2);
    assert.equal(reconciliation.records[0].matched_lines, 1);
    assert.equal(reconciliation.records[0].unmatched_lines, 1);
  } finally {
    server.close();
    await once(server, "close");
    await database.pool.end();
    await dropDatabase(adminUrl, databaseName);
  }
});
