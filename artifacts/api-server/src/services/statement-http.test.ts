import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { get } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrateDatabase } from "@workspace/db/migrations";
import * as schema from "@workspace/db/schema";
import { eq } from "drizzle-orm";

type Preview = { totals: { debit_cents: number; credit_cents: number; net_cents: number }; importable_totals: { net_cents: number }; rows: unknown[]; errors: unknown[]; ready_to_import: boolean; preview_fingerprint: string; existing_duplicate_rows: number[] };

test("statement HTTP ingestion enforces access, preview binding, bounds, and atomic duplicates", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const testName = `ff_statement_http_${randomBytes(5).toString("hex")}`;
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const testUrl = new URL(adminUrl); testUrl.pathname = `/${testName}`;
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`create database "${testName}"`);
  const migrations = new pg.Pool({ connectionString: testUrl.toString() });
  let server: ReturnType<typeof import("node:http").createServer> | undefined;
  let applicationPool: pg.Pool | undefined;
  try {
    await migrateDatabase(drizzle(migrations, { schema }));
    await migrations.end();
    process.env.DATABASE_URL = testUrl.toString();
    process.env.SESSION_SECRET = randomBytes(48).toString("hex");
    process.env.APP_ALLOWED_ORIGINS = "http://127.0.0.1:5175";
    const database = await import("@workspace/db");
    const { db, entities, accounts, statements, statement_lines, transactions, audit_log } = database;
    applicationPool = database.pool;
    const [entity] = await db.insert(entities).values({ legal_name: "HTTP Fixture LLC", display_name: "HTTP Fixture", short_code: "HTTP", entity_type: "llc" }).returning();
    const [account, secondAccount] = await db.insert(accounts).values([
      { entity_id: entity.id, name: "Fixture Checking", account_type: "checking" },
      { entity_id: entity.id, name: "Other Checking", account_type: "checking" },
    ]).returning();
    const [statement, overlap, separate] = await db.insert(statements).values([
      { account_id: account.id, statement_month: "2026-10-01", status: "uploaded" },
      { account_id: account.id, statement_month: "2026-11-01", status: "uploaded" },
      { account_id: secondAccount.id, statement_month: "2026-10-01", status: "uploaded" },
    ]).returning();
    const { default: app } = await import("../app");
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    assert.equal((await fetch(`${base}/statements`)).status, 401);
    const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
      get(`${base}/auth/status`, { headers: { Host: "attacker.example" } }, (response) => { response.resume(); resolve(response.statusCode); }).on("error", reject);
    });
    assert.equal(hostileHostStatus, 403);
    assert.equal((await fetch(`${base}/auth/status`, { headers: { Origin: "https://attacker.example" } })).status, 403);
    assert.equal((await fetch(`${base}/auth/status`, { headers: { Origin: "http://127.0.0.1:9999" } })).status, 403);
    assert.equal((await fetch(`${base}/auth/status`, { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    const setup = await fetch(`${base}/auth/setup`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5175" }, body: JSON.stringify({ password: "Synthetic-http-fixture-2026" }) });
    assert.equal(setup.status, 201);
    const cookie = setup.headers.get("set-cookie")!.split(";")[0];
    const csv = "Date,Description,Amount,Balance\n10/05/2026,Sample subscription,-10.25,989.75\n10/06/2026,Sample deposit,40.10,1029.85\n";
    function form(content = csv, extra: Record<string, string> = {}) {
      const data = new FormData();
      data.append("file", new Blob([content], { type: "text/csv" }), "private-source-name.csv");
      for (const [key, value] of Object.entries({ transaction_date_column: "Date", posted_date_column: "", description_column: "Description", amount_column: "Amount", debit_column: "", credit_column: "", balance_column: "Balance", date_format: "us", amount_sign: "negative_outflow", currency: "USD", skip_duplicates: "false", ...extra })) data.append(key, value);
      return data;
    }
    const post = (id: string, suffix: string, data: FormData, authenticated = true) => fetch(`${base}/statements/${id}/import${suffix}`, { method: "POST", headers: authenticated ? { Cookie: cookie } : {}, body: data });
    assert.equal((await post(statement.id, "/preview", form(), false)).status, 401);
    const inspected = await post(statement.id, "/inspect", form()); assert.equal(inspected.status, 200);
    const previewResponse = await post(statement.id, "/preview", form()); assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json() as Preview;
    assert.deepEqual(preview.totals, { debit_cents: 1025, credit_cents: 4010, net_cents: 2985 });
    assert.equal(preview.rows.length, 2);
    const digest = preview.preview_fingerprint;
    assert.match(digest, /^[a-f0-9]{64}$/);
    assert.equal((await post(statement.id, "", form())).status, 409);
    assert.equal((await post(statement.id, "", form(csv.replace("10.25", "10.26"), { preview_fingerprint: digest }))).status, 409);
    assert.equal((await post(statement.id, "", form(csv, { preview_fingerprint: digest, amount_sign: "positive_outflow" }))).status, 409);
    assert.equal((await post(separate.id, "", form(csv, { preview_fingerprint: digest }))).status, 409);
    assert.equal((await post(statement.id, "/preview", form(csv, { currency: "EUR" }))).status, 400);
    assert.equal((await post(statement.id, "/preview", form("x".repeat(2 * 1024 * 1024 + 1)))).status, 413);
    const invalid = await (await post(statement.id, "/preview", form(csv.replace("-10.25", "-10.251")))).json() as Preview;
    assert.equal(invalid.ready_to_import, false); assert.equal(invalid.errors.length, 1);
    assert.equal((await db.select().from(statement_lines)).length, 0);
    const concurrent = await Promise.all([post(statement.id, "", form(csv, { preview_fingerprint: digest })), post(statement.id, "", form(csv, { preview_fingerprint: digest }))]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
    assert.equal((await db.select().from(statement_lines)).length, 2);
    assert.equal((await db.select().from(transactions)).length, 0);
    const overlappingPreview = await (await post(overlap.id, "/preview", form())).json() as Preview;
    assert.deepEqual(overlappingPreview.existing_duplicate_rows, [2, 3]);
    assert.equal(overlappingPreview.importable_totals.net_cents, 0);
    const separatePreview = await (await post(separate.id, "/preview", form())).json() as Preview;
    assert.deepEqual(separatePreview.existing_duplicate_rows, []);
    const audit = await db.select().from(audit_log).where(eq(audit_log.record_id, statement.id));
    assert.equal(audit.filter((row) => row.action === "import_csv").length, 1);
    assert.ok(!JSON.stringify(audit).includes("private-source-name.csv"));
    assert.ok(JSON.stringify(audit).includes(digest));
    // Posted ledger movements must reach account and dashboard reads; drafts
    // and voids must not change cash. This reproduces the stale-balance bug.
    await db.update(accounts).set({ opening_balance: "10", current_balance: "10" }).where(eq(accounts.id, account.id));
    for (const status of ["posted", "draft", "voided"]) {
      const [entry] = await db.insert(transactions).values({ transaction_date: "2026-10-10", description: `Balance fixture ${status}`, transaction_type: "owner_contribution", total_amount: "40", status, is_balanced: true }).returning();
      await db.insert(database.transaction_lines).values([
        { transaction_id: entry.id, entity_id: entity.id, account_id: account.id, debit: "40", credit: "0" },
        { transaction_id: entry.id, entity_id: entity.id, debit: "0", credit: "40" },
      ]);
    }
    const accountRead = await (await fetch(`${base}/accounts/${account.id}`, { headers: { Cookie: cookie } })).json() as { current_balance: string };
    assert.equal(Number(accountRead.current_balance), 50);
    const dashboard = await (await fetch(`${base}/dashboard/summary`, { headers: { Cookie: cookie } })).json() as { entities: Array<{ operating_cash: number }> };
    assert.equal(dashboard.entities[0].operating_cash, 50);
    const [otherEntity] = await db.insert(entities).values({ legal_name: "Other Fixture LLC", display_name: "Other Fixture", short_code: "OTHER", entity_type: "llc" }).returning();
    await db.update(accounts).set({ is_tax_reserve: true, opening_balance: "5" }).where(eq(accounts.id, secondAccount.id));
    for (const [entityId, amount, status, date] of [[entity.id, 100, "posted", "2026-10-11"], [otherEntity.id, 700, "posted", "2026-10-12"], [entity.id, 900, "draft", "2026-10-13"]] as const) {
      const [entry] = await db.insert(transactions).values({ description: "Revenue isolation fixture", transaction_date: date, transaction_type: "revenue", total_amount: String(amount), status, is_balanced: true }).returning();
      await db.insert(database.transaction_lines).values([
        { transaction_id: entry.id, entity_id: entityId, account_id: entityId === entity.id ? secondAccount.id : null, debit: String(amount), credit: "0" },
        { transaction_id: entry.id, entity_id: entityId, debit: "0", credit: String(amount) },
      ]);
    }
    const reserve = await (await fetch(`${base}/tax-reserve/summary`, { headers: { Cookie: cookie } })).json() as Array<{ entity: { id: string }; last_revenue_amount: number; current_reserve_balance: number }>;
    assert.equal(reserve.find((row) => row.entity.id === entity.id)?.last_revenue_amount, 100);
    assert.equal(reserve.find((row) => row.entity.id === otherEntity.id)?.last_revenue_amount, 700);
    assert.equal(reserve.find((row) => row.entity.id === entity.id)?.current_reserve_balance, 105);
    assert.equal((await fetch(`${base}/auth/logout`, { method: "POST", headers: { Cookie: cookie } })).status, 204);
    assert.equal((await fetch(`${base}/statements`, { headers: { Cookie: cookie } })).status, 401);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    await applicationPool?.end();
    await admin.query(`drop database "${testName}" with (force)`);
    await admin.end();
  }
});
