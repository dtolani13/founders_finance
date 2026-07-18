import { runRecoveryDrill } from "@workspace/backup";
import { resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
const backupId = process.argv[2];
const passphrase = process.env.BACKUP_PASSPHRASE;

if (!databaseUrl || !backupId || !passphrase) {
  throw new Error("Usage: DATABASE_URL=... BACKUP_PASSPHRASE=... pnpm run verify-restore -- <backup-id>");
}

const result = await runRecoveryDrill(
  resolve(process.env.BACKUP_STORAGE_ROOT ?? process.env.BACKUP_ROOT ?? "backups"),
  backupId,
  passphrase,
  databaseUrl,
  process.env.POSTGRES_BIN,
);
console.log(`Recovery drill completed: ${result.backup_id}; table counts matched.`);
