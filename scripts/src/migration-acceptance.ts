import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getTableCounts, resolvePostgresToolForDatabase } from "@workspace/backup";
import * as schema from "@workspace/db/schema";
import {
  adoptBaseline,
  fingerprintPublicSchema,
  getMigrationStatus,
  migrateDatabase,
} from "@workspace/db/migrations";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const { Client, Pool } = pg;
const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for migration acceptance.");

function databaseUrlWithName(source: string, databaseName: string): string {
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.trim()}`));
    });
  });
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

function assertCountsEqual(before: Record<string, number>, after: Record<string, number>): void {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const mismatches = [...keys].filter((key) => before[key] !== after[key]);
  if (mismatches.length) {
    throw new Error(`Migration changed row counts: ${mismatches.map((key) => `${key} ${before[key]} -> ${after[key]}`).join(", ")}`);
  }
}

const suffix = randomBytes(5).toString("hex");
const emptyDatabaseName = `ff_migration_empty_${suffix}`;
const copyDatabaseName = `ff_migration_copy_${suffix}`;
const sourceUrl = new URL(sourceDatabaseUrl);
const adminUrl = databaseUrlWithName(sourceDatabaseUrl, "postgres");
const emptyUrl = databaseUrlWithName(sourceDatabaseUrl, emptyDatabaseName);
const copyUrl = databaseUrlWithName(sourceDatabaseUrl, copyDatabaseName);
const temporaryRoot = await mkdtemp(join(tmpdir(), "founders-finance-migrations-"));
const dumpPath = join(temporaryRoot, "current.dump");

try {
  await createDatabase(adminUrl, emptyDatabaseName);
  const emptyPool = new Pool({ connectionString: emptyUrl });
  try {
    await migrateDatabase(drizzle(emptyPool, { schema }));
    const emptyStatus = await getMigrationStatus(emptyPool);
    if (emptyStatus.pending !== 0) throw new Error("Empty-database migration left pending migrations.");
  } finally {
    await emptyPool.end();
  }

  await run(await resolvePostgresToolForDatabase("pg_dump", sourceDatabaseUrl, process.env.POSTGRES_BIN), [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    `--file=${dumpPath}`,
    sourceDatabaseUrl,
  ]);
  await createDatabase(adminUrl, copyDatabaseName);
  await run(await resolvePostgresToolForDatabase("pg_restore", copyUrl, process.env.POSTGRES_BIN), [
    "--no-owner",
    "--no-acl",
    `--dbname=${copyUrl}`,
    dumpPath,
  ]);

  const beforeCounts = await getTableCounts(copyUrl);
  const copyPool = new Pool({ connectionString: copyUrl });
  try {
    const copyStatusBefore = await getMigrationStatus(copyPool);
    if (copyStatusBefore.applied === 0) await adoptBaseline(copyPool);
    await migrateDatabase(drizzle(copyPool, { schema }));
    const copyStatus = await getMigrationStatus(copyPool);
    if (copyStatus.pending !== 0) throw new Error("Existing-database migration left pending migrations.");
  } finally {
    await copyPool.end();
  }
  const afterCounts = await getTableCounts(copyUrl);
  assertCountsEqual(beforeCounts, afterCounts);

  const emptyFingerprintPool = new Pool({ connectionString: emptyUrl });
  const copyFingerprintPool = new Pool({ connectionString: copyUrl });
  try {
    const [emptyFingerprint, copyFingerprint] = await Promise.all([
      fingerprintPublicSchema(emptyFingerprintPool),
      fingerprintPublicSchema(copyFingerprintPool),
    ]);
    if (emptyFingerprint !== copyFingerprint) {
      throw new Error("Empty and existing databases did not converge to the same public schema fingerprint.");
    }
    console.log(JSON.stringify({
      source_database: sourceUrl.pathname.slice(1),
      migrations: "applied",
      empty_database: "passed",
      existing_database_copy: "passed",
      row_counts_preserved: true,
      schema_fingerprint: emptyFingerprint,
    }, null, 2));
  } finally {
    await emptyFingerprintPool.end();
    await copyFingerprintPool.end();
  }
} finally {
  await dropDatabase(adminUrl, emptyDatabaseName).catch(() => undefined);
  await dropDatabase(adminUrl, copyDatabaseName).catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
