import "./load-env";
import { mkdir, readdir, rm } from "node:fs/promises";
import { parse, resolve } from "node:path";
import pg from "pg";
import { repositoryRoot } from "./load-env";

const { Client } = pg;
const confirmation = "--confirm-owner-reset";
const expectedCompanyCodes = ["SM", "POLY", "RCL", "PERSONAL"] as const;
const clearedTables = [
  "reconciliation_matches",
  "statement_lines",
  "statements",
  "documents",
  "expense_allocations",
  "intercompany_links",
  "reimbursement_requests",
  "owner_contributions",
  "owner_draws",
  "transaction_lines",
  "transactions",
  "allocation_preset_lines",
  "allocation_presets",
  "tax_reserve_rules",
  "monthly_close_periods",
  "exports",
  "audit_log",
  "accounts",
  "vendors",
  "categories",
  "auth_sessions",
  "auth_login_attempts",
] as const;

function requireConfirmation(): void {
  if (!process.argv.includes(confirmation)) {
    throw new Error(`Owner data preparation is destructive. Run again with ${confirmation}.`);
  }
}

function safeStorageRoot(rawPath: string): string {
  const root = resolve(repositoryRoot, rawPath);
  const normalized = root.toLowerCase().replaceAll("\\", "/");
  if (
    root === parse(root).root
    || root === repositoryRoot
    || normalized.includes("/.git/")
    || normalized.endsWith("/.git")
    || normalized.includes("/node_modules/")
    || normalized.includes("/artifacts/founders-finance/public/")
  ) {
    throw new Error(`Unsafe evidence storage root: ${root}`);
  }
  return root;
}

async function clearStorage(root: string): Promise<void> {
  await mkdir(root, { recursive: true });
  for (const entry of await readdir(root)) {
    await rm(resolve(root, entry), { recursive: true, force: true });
  }
}

async function prepareOwnerData(): Promise<void> {
  requireConfirmation();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const companies = await client.query<{ id: string; short_code: string; display_name: string }>(
      "select id, short_code, display_name from entities order by short_code",
    );
    const existingCodes = new Set(companies.rows.map((company) => company.short_code));
    const missingCodes = expectedCompanyCodes.filter((code) => !existingCodes.has(code));
    if (missingCodes.length) {
      throw new Error(`Refusing owner reset because required companies are missing: ${missingCodes.join(", ")}`);
    }

    await client.query("begin");
    try {
      await client.query(`truncate table ${clearedTables.map((table) => `"${table}"`).join(", ")} restart identity cascade`);
      await client.query(
        "delete from entities where not (short_code = any($1::text[]))",
        [expectedCompanyCodes],
      );
      await client.query(
        `update entities
         set lifecycle_status = 'active', is_active = true, closed_at = null,
             archive_until = null, archive_reason = null, updated_at = now()
         where short_code = any($1::text[])`,
        [expectedCompanyCodes],
      );

      const ownerCompanies = await client.query<{ id: string; short_code: string }>(
        "select id, short_code from entities where short_code = any($1::text[]) order by short_code",
        [expectedCompanyCodes],
      );
      for (const company of ownerCompanies.rows) {
        await client.query(
          `insert into accounts
             (entity_id, name, account_type, opening_balance, current_balance, is_tax_reserve, is_active)
           values
             ($1, $2, 'checking', 0, 0, false, true),
             ($1, $3, 'savings', 0, 0, true, true)`,
          [company.id, `${company.short_code} Checking`, `${company.short_code} Tax Reserve`],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const evidenceRoot = safeStorageRoot(process.env.EVIDENCE_STORAGE_ROOT ?? "evidence");
    await clearStorage(evidenceRoot);

    const result = await client.query<{ entities: number; accounts: number; credentials: number; financial_records: number }>(
      `select
         (select count(*)::int from entities) as entities,
         (select count(*)::int from accounts) as accounts,
         (select count(*)::int from auth_credentials) as credentials,
         ((select count(*) from transactions)
           + (select count(*) from documents)
           + (select count(*) from statements)
           + (select count(*) from reimbursement_requests)
           + (select count(*) from intercompany_links))::int as financial_records`,
    );
    console.log(JSON.stringify({
      status: "owner_data_ready",
      companies: expectedCompanyCodes,
      ...result.rows[0],
      evidence_files: 0,
    }, null, 2));
  } finally {
    await client.end();
  }
}

prepareOwnerData().catch((error) => {
  console.error(`Founders Finance owner preparation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
