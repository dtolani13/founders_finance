import { createBackup, runRecoveryDrill, verifyBackup } from "@workspace/backup";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the backup acceptance test.");

const temporaryRoot = await mkdtemp(join(tmpdir(), "founders-finance-acceptance-"));
const passphrase = randomBytes(32).toString("base64url");
const evidenceFixtureRoot = join(temporaryRoot, "evidence-fixture");

try {
  await mkdir(join(evidenceFixtureRoot, "receipts"), { recursive: true });
  await writeFile(join(evidenceFixtureRoot, "receipts", "acceptance-proof.txt"), "Founders Finance backup acceptance evidence.\n");
  const backup = await createBackup({
    databaseUrl,
    backupRoot: temporaryRoot,
    evidenceRoot: evidenceFixtureRoot,
    passphrase,
    postgresBin: process.env.POSTGRES_BIN,
  });
  const verification = await verifyBackup(temporaryRoot, backup.id, passphrase, process.env.POSTGRES_BIN);
  const drill = await runRecoveryDrill(
    temporaryRoot,
    backup.id,
    passphrase,
    databaseUrl,
    process.env.POSTGRES_BIN,
  );

  console.log(JSON.stringify({
    backup_id: backup.id,
    encrypted_bytes: backup.bytes,
    database_tables: verification.database_table_count,
    evidence_files: verification.evidence_file_count,
    recovery_drill: drill.table_counts_match ? "passed" : "failed",
  }, null, 2));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
