import "./load-env";
import { createBackup, verifyBackup } from "@workspace/backup";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to create a backup.");
}

const passphrase = process.env.BACKUP_PASSPHRASE;
if (!passphrase) throw new Error("BACKUP_PASSPHRASE is required to encrypt a backup.");

const backupRoot = resolve(process.env.BACKUP_STORAGE_ROOT ?? process.env.BACKUP_ROOT ?? "backups");
const metadata = await createBackup({
  databaseUrl,
  backupRoot,
  evidenceRoot: resolve(process.env.EVIDENCE_STORAGE_ROOT ?? "evidence"),
  passphrase,
  postgresBin: process.env.POSTGRES_BIN,
});
await verifyBackup(backupRoot, metadata.id, passphrase, process.env.POSTGRES_BIN);

console.log(`Encrypted and verified backup complete: ${metadata.file_name}`);
