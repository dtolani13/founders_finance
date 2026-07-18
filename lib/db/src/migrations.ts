import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";

type SnapshotColumn = {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
};

type SnapshotTable = {
  name: string;
  columns: Record<string, SnapshotColumn>;
};

type BaselineSnapshot = {
  tables: Record<string, SnapshotTable>;
};

export type MigrationStatus = {
  applied: number;
  pending: number;
  total: number;
  latest_applied: string | null;
  next_pending: string | null;
};

export function resolveMigrationsFolder(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
}

export async function migrateDatabase(
  database: NodePgDatabase<typeof schema>,
  migrationsFolder = resolveMigrationsFolder(),
): Promise<void> {
  await migrate(database, { migrationsFolder });
}

export async function getMigrationStatus(
  pool: Pool,
  migrationsFolder = resolveMigrationsFolder(),
): Promise<MigrationStatus> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const result = await pool.query<{ hash: string; created_at: string }>(`
    select hash, created_at::text
    from drizzle.__drizzle_migrations
    order by created_at
  `).catch((error: NodeJS.ErrnoException & { code?: string }) => {
    if (error.code === "42P01" || error.code === "3F000") {
      return { rows: [] } as { rows: Array<{ hash: string; created_at: string }> };
    }
    throw error;
  });

  // Drizzle identifies ordered migrations by the journal timestamp. Using the
  // SQL hash here would report false pending work when Git normalizes line endings.
  const appliedTimestamps = new Set(result.rows.map((row) => Number(row.created_at)));
  const applied = migrations.filter((migration) => appliedTimestamps.has(migration.folderMillis));
  const pending = migrations.filter((migration) => !appliedTimestamps.has(migration.folderMillis));

  return {
    applied: applied.length,
    pending: pending.length,
    total: migrations.length,
    latest_applied: applied.at(-1)?.hash ?? null,
    next_pending: pending[0]?.hash ?? null,
  };
}

function normalizeType(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace("charactervarying", "varchar");
}

async function readBaselineSnapshot(migrationsFolder: string): Promise<BaselineSnapshot> {
  const snapshotPath = join(migrationsFolder, "meta", "0000_snapshot.json");
  return JSON.parse(await readFile(snapshotPath, "utf8")) as BaselineSnapshot;
}

async function verifyExistingSchemaMatchesBaseline(pool: Pool, migrationsFolder: string): Promise<void> {
  const snapshot = await readBaselineSnapshot(migrationsFolder);
  const expectedTables = Object.values(snapshot.tables);
  const tableRows = await pool.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  const actualTableNames = new Set(tableRows.rows.map((row) => row.table_name));
  const expectedTableNames = new Set(expectedTables.map((table) => table.name));
  const missingTables = [...expectedTableNames].filter((name) => !actualTableNames.has(name));
  const unexpectedTables = [...actualTableNames].filter((name) => !expectedTableNames.has(name));

  if (missingTables.length || unexpectedTables.length) {
    throw new Error(
      `Existing database does not match baseline tables. Missing: ${missingTables.join(", ") || "none"}. Unexpected: ${unexpectedTables.join(", ") || "none"}.`,
    );
  }

  const columnRows = await pool.query<{
    table_name: string;
    column_name: string;
    formatted_type: string;
    not_null: boolean;
    primary_key: boolean;
  }>(`
    select
      c.relname as table_name,
      a.attname as column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as formatted_type,
      a.attnotnull as not_null,
      exists (
        select 1
        from pg_constraint pk
        where pk.conrelid = c.oid
          and pk.contype = 'p'
          and a.attnum = any(pk.conkey)
      ) as primary_key
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and a.attnum > 0
      and not a.attisdropped
    order by c.relname, a.attnum
  `);

  const actualColumns = new Map(
    columnRows.rows.map((column) => [`${column.table_name}.${column.column_name}`, column]),
  );
  const errors: string[] = [];

  for (const table of expectedTables) {
    for (const column of Object.values(table.columns)) {
      const key = `${table.name}.${column.name}`;
      const actual = actualColumns.get(key);
      if (!actual) {
        errors.push(`${key} is missing`);
        continue;
      }
      if (normalizeType(actual.formatted_type) !== normalizeType(column.type)) {
        errors.push(`${key} type is ${actual.formatted_type}, expected ${column.type}`);
      }
      if (actual.not_null !== column.notNull) {
        errors.push(`${key} nullability differs`);
      }
      if (actual.primary_key !== column.primaryKey) {
        errors.push(`${key} primary-key state differs`);
      }
      actualColumns.delete(key);
    }
  }

  if (actualColumns.size) {
    errors.push(`Unexpected columns: ${[...actualColumns.keys()].join(", ")}`);
  }
  if (errors.length) {
    throw new Error(`Existing database does not match the committed baseline: ${errors.join("; ")}`);
  }
}

export async function adoptBaseline(
  pool: Pool,
  migrationsFolder = resolveMigrationsFolder(),
): Promise<{ adopted: boolean; hash: string }> {
  const migrations = readMigrationFiles({ migrationsFolder });
  const baseline = migrations[0];
  if (!baseline) throw new Error("No baseline migration exists.");

  await verifyExistingSchemaMatchesBaseline(pool, migrationsFolder);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock(7182026)");
    await client.query("create schema if not exists drizzle");
    await client.query(`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `);
    const existing = await client.query<{ hash: string }>(
      "select hash from drizzle.__drizzle_migrations where hash = $1",
      [baseline.hash],
    );
    if (existing.rowCount === 0) {
      await client.query(
        "insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)",
        [baseline.hash, baseline.folderMillis],
      );
    }
    await client.query("commit");
    return { adopted: existing.rowCount === 0, hash: baseline.hash };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function fingerprintPublicSchema(pool: Pool): Promise<string> {
  const result = await pool.query<{ definition: string }>(`
    select string_agg(definition, E'\n' order by definition) as definition
    from (
      select concat_ws('|', 'column', table_name, column_name, data_type, udt_name, is_nullable, coalesce(column_default, '')) as definition
      from information_schema.columns
      where table_schema = 'public'
      union all
      select concat_ws('|', 'constraint', table_name, constraint_name, constraint_definition)
      from (
        select
          relation.relname as table_name,
          constraint_record.conname as constraint_name,
          pg_get_constraintdef(constraint_record.oid, true) as constraint_definition
        from pg_constraint constraint_record
        join pg_class relation on relation.oid = constraint_record.conrelid
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
      ) constraints
      union all
      select concat_ws('|', 'index', tablename, indexname, indexdef)
      from pg_indexes
      where schemaname = 'public'
    ) definitions
  `);
  return createHash("sha256").update(result.rows[0]?.definition ?? "").digest("hex");
}
