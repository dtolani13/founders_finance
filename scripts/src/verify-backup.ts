import "./load-env";
import { verifyBackup } from "@workspace/backup";
import { resolve } from "node:path";

const backupId = process.argv[2];
const passphrase = process.env.BACKUP_PASSPHRASE;
if (!backupId || !passphrase) throw new Error("Usage: BACKUP_PASSPHRASE=... pnpm run backup:verify -- <backup-id>");

const result = await verifyBackup(
  resolve(process.env.BACKUP_STORAGE_ROOT ?? process.env.BACKUP_ROOT ?? "backups"),
  backupId,
  passphrase,
  process.env.POSTGRES_BIN,
);
console.log(`Backup verified: ${result.backup_id}`);
