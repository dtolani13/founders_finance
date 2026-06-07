import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to create a backup.");
}

const backupRoot = resolve(process.env.BACKUP_ROOT ?? "backups");
const evidenceRoot = process.env.EVIDENCE_STORAGE_ROOT;
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = join(backupRoot, `founders-finance-backup-${timestamp}`);

mkdirSync(backupDir, { recursive: true });

const dumpPath = join(backupDir, "database.dump");
const pgDump = spawnSync("pg_dump", ["--format=custom", "--file", dumpPath, databaseUrl], {
  stdio: "inherit",
});

if (pgDump.status !== 0) {
  throw new Error("pg_dump failed. Confirm PostgreSQL client tools are installed and DATABASE_URL is valid.");
}

const manifest = {
  app: "Founders Finance",
  created_at: new Date().toISOString(),
  database_dump: "database.dump",
  evidence_root: evidenceRoot ?? null,
  includes_evidence: Boolean(evidenceRoot && existsSync(evidenceRoot)),
};

writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (process.env.BACKUP_COPY_TO) {
  mkdirSync(process.env.BACKUP_COPY_TO, { recursive: true });
  copyFileSync(dumpPath, join(process.env.BACKUP_COPY_TO, `founders-finance-${timestamp}.dump`));
  copyFileSync(join(backupDir, "manifest.json"), join(process.env.BACKUP_COPY_TO, `founders-finance-${timestamp}.manifest.json`));
}

console.log(`Backup complete: ${backupDir}`);
