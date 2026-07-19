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
import { eq } from "drizzle-orm";
import express from "express";
import pg from "pg";

if (!process.env.DATABASE_URL && existsSync(resolve(".env"))) {
  process.loadEnvFile(resolve(".env"));
}

const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for mutation audit tests.");

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

test("statement and tax-rule mutations are atomic, period-guarded, and audited", async () => {
  const databaseName = `ff_mutation_audit_${randomBytes(5).toString("hex")}`;
  const adminUrl = urlForDatabase(sourceDatabaseUrl, "postgres");
  const testUrl = urlForDatabase(sourceDatabaseUrl, databaseName);
  await createDatabase(adminUrl, databaseName);

  const migrationPool = new Pool({ connectionString: testUrl });
  await migrateDatabase(drizzle(migrationPool, { schema }));
  await migrationPool.end();

  process.env.DATABASE_URL = testUrl;
  const database = await import("@workspace/db");
  const statementsRouter = (await import("../routes/statements")).default;
  const taxReserveRouter = (await import("../routes/tax_reserve")).default;
  const { accounts, audit_log, db, entities, monthly_close_periods, statement_lines, tax_reserve_rules } = database;

  const app = express();
  app.use(express.json());
  app.use("/api/statements", statementsRouter);
  app.use("/api/statement-lines", statementsRouter);
  app.use("/api/tax-reserve", taxReserveRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  async function request(path: string, method: string, body: unknown): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  try {
    const [entity] = await db.insert(entities).values({
      legal_name: "Mutation Audit LLC",
      display_name: "Mutation Audit",
      short_code: `MA${randomBytes(2).toString("hex")}`,
      entity_type: "llc",
    }).returning();
    const [account] = await db.insert(accounts).values({
      entity_id: entity.id,
      name: "Audit Checking",
      account_type: "checking",
    }).returning();

    const createStatementResponse = await request("/api/statements", "POST", {
      account_id: account.id,
      statement_month: "2026-11-01",
      opening_balance: 1000,
      closing_balance: 950,
    });
    assert.equal(createStatementResponse.status, 201);
    const statement = await createStatementResponse.json() as { id: string };

    const addLinesResponse = await request(`/api/statements/${statement.id}/lines`, "POST", {
      lines: [{ transaction_date: "2026-11-04", description: "Audit fixture", amount: -50 }],
    });
    assert.equal(addLinesResponse.status, 200);
    const statementDetail = await addLinesResponse.json() as { lines: Array<{ id: string }> };
    const lineId = statementDetail.lines[0].id;

    const updateLineResponse = await request(`/api/statement-lines/${lineId}`, "PUT", {
      status: "ignored",
      notes: "Duplicate bank feed line",
    });
    assert.equal(updateLineResponse.status, 200);

    const firstTaxRule = await request("/api/tax-reserve/rules", "POST", {
      entity_id: entity.id,
      reserve_percent: 22,
      rule_basis: "revenue",
      notes: "Initial fixture",
    });
    assert.equal(firstTaxRule.status, 201);
    const secondTaxRule = await request("/api/tax-reserve/rules", "POST", {
      entity_id: entity.id,
      reserve_percent: 24,
      rule_basis: "revenue",
      notes: "Updated fixture",
    });
    assert.equal(secondTaxRule.status, 201);

    const statementAudits = await db.select().from(audit_log).where(eq(audit_log.record_id, statement.id));
    assert.deepEqual(statementAudits.map((row) => row.action).sort(), ["add_lines", "create"]);
    const lineAudits = await db.select().from(audit_log).where(eq(audit_log.record_id, lineId));
    assert.equal(lineAudits.some((row) => row.action === "update"), true);
    const activeRules = await db.select().from(tax_reserve_rules).where(eq(tax_reserve_rules.is_active, true));
    assert.equal(activeRules.length, 1);
    assert.equal(Number(activeRules[0].reserve_percent), 24);
    const ruleAudits = (await db.select().from(audit_log).where(eq(audit_log.table_name, "tax_reserve_rules")))
      .filter((row) => row.action === "replace_active_rule");
    assert.equal(ruleAudits.length, 2);

    await db.insert(monthly_close_periods).values({
      entity_id: entity.id,
      period_month: "2026-11-01",
      status: "closed",
    });
    const closedUpdateResponse = await request(`/api/statement-lines/${lineId}`, "PUT", {
      notes: "This must not be written after close",
    });
    assert.equal(closedUpdateResponse.status, 409);
    const [unchangedLine] = await db.select().from(statement_lines).where(eq(statement_lines.id, lineId));
    assert.equal(unchangedLine.notes, "Duplicate bank feed line");
    const auditsAfterRejectedUpdate = await db.select().from(audit_log).where(eq(audit_log.record_id, lineId));
    assert.equal(auditsAfterRejectedUpdate.length, lineAudits.length);
  } finally {
    server.close();
    await once(server, "close");
    await database.pool.end();
    await dropDatabase(adminUrl, databaseName);
  }
});
