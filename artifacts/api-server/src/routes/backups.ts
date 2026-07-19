import { Router, type Request, type Response } from "express";
import { resolve } from "node:path";
import { z } from "zod";
import {
  createBackup,
  findBackup,
  listBackups,
  restoreBackup,
  runRecoveryDrill,
  verifyBackup,
} from "@workspace/backup";
import { writeAuditLog } from "../lib/audit";

const router = Router();
const applicationRoot = process.env.FOUNDERS_FINANCE_HOME ?? process.cwd();
const backupRoot = resolve(applicationRoot, process.env.BACKUP_STORAGE_ROOT ?? process.env.BACKUP_ROOT ?? "backups");
const evidenceRoot = resolve(applicationRoot, process.env.EVIDENCE_STORAGE_ROOT ?? "evidence");
const postgresBin = process.env.POSTGRES_BIN;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is required for backup operations.");

const passphraseSchema = z.object({
  passphrase: z.string().min(12).max(128),
});
const createSchema = passphraseSchema.extend({
  passphrase_confirmation: z.string().min(12).max(128),
}).refine((value) => value.passphrase === value.passphrase_confirmation, {
  message: "Backup passphrases do not match.",
  path: ["passphrase_confirmation"],
});
const restoreSchema = passphraseSchema.extend({
  confirmation: z.literal("RESTORE FOUNDERS FINANCE"),
});

type Operation = "create" | "verify" | "recovery_drill" | "restore";
let activeOperation: { type: Operation; started_at: string } | null = null;

async function writeBackupAudit(
  backupId: string,
  action: string,
  memo: string,
  details: Record<string, unknown> = {},
) {
  await writeAuditLog({
    tableName: "backup_operations",
    action,
    newValue: { backup_id: backupId, ...details },
    memo,
  });
}

async function exclusive<T>(type: Operation, task: () => Promise<T>): Promise<T> {
  if (activeOperation) throw new Error(`A ${activeOperation.type.replace("_", " ")} operation is already running.`);
  activeOperation = { type, started_at: new Date().toISOString() };
  try {
    return await task();
  } finally {
    activeOperation = null;
  }
}

function respondError(req: Request, res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues });
  const message = error instanceof Error ? error.message : "Backup operation failed.";
  req.log.error({ err: error }, "Backup operation failed");
  const status = message.includes("not found") || message.includes("missing") ? 404
    : message.includes("already running") ? 409
      : /passphrase|could not be decrypted|invalid|unsupported/i.test(message) ? 400
        : /integrity|row counts|file count/i.test(message) ? 422
          : 500;
  return res.status(status).json({ error: message });
}

router.get("/", async (req, res) => {
  try {
    const backups = await listBackups(backupRoot);
    res.json({
      storage_destination: backupRoot,
      evidence_source: evidenceRoot,
      encryption: "AES-256-GCM",
      active_operation: activeOperation,
      latest_successful_at: backups.find((backup) => backup.status === "complete")?.completed_at ?? null,
      latest_verified_at: backups.find((backup) => backup.verification_status === "verified")?.last_verified_at ?? null,
      backups,
    });
  } catch (error) {
    respondError(req, res, error);
  }
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const metadata = await exclusive("create", async () => {
      const created = await createBackup({
        databaseUrl,
        backupRoot,
        evidenceRoot,
        passphrase: body.passphrase,
        postgresBin,
      });
      await verifyBackup(backupRoot, created.id, body.passphrase, postgresBin);
      return (await findBackup(backupRoot, created.id)).metadata;
    });
    await writeBackupAudit(metadata.id, "backup_create", "Encrypted backup created and integrity verified", {
      file_name: metadata.file_name,
      bytes: metadata.bytes,
      includes_evidence: metadata.includes_evidence,
    });
    res.status(201).json(metadata);
  } catch (error) {
    respondError(req, res, error);
  }
});

router.post("/:id/verify", async (req, res) => {
  try {
    const body = passphraseSchema.parse(req.body);
    const result = await exclusive("verify", () => verifyBackup(backupRoot, req.params.id, body.passphrase, postgresBin));
    await writeBackupAudit(req.params.id, "backup_verify", "Encrypted backup integrity verified");
    res.json(result);
  } catch (error) {
    respondError(req, res, error);
  }
});

router.post("/:id/recovery-drill", async (req, res) => {
  try {
    const body = passphraseSchema.parse(req.body);
    const result = await exclusive("recovery_drill", () => runRecoveryDrill(
      backupRoot,
      req.params.id,
      body.passphrase,
      databaseUrl,
      postgresBin,
    ));
    await writeBackupAudit(req.params.id, "recovery_drill", "Backup restored into an isolated database and row counts matched");
    res.json(result);
  } catch (error) {
    respondError(req, res, error);
  }
});

router.post("/:id/restore", async (req, res) => {
  try {
    const body = restoreSchema.parse(req.body);
    const result = await exclusive("restore", () => restoreBackup({
      databaseUrl,
      backupRoot,
      evidenceRoot,
      passphrase: body.passphrase,
      postgresBin,
    }, req.params.id));
    await writeBackupAudit(req.params.id, "backup_restore", "Encrypted backup restored after automatic pre-restore backup", {
      pre_restore_backup_id: result.pre_restore_backup_id,
    });
    res.json(result);
  } catch (error) {
    respondError(req, res, error);
  }
});

router.get("/:id/download", async (req, res) => {
  try {
    const { metadata, filePath } = await findBackup(backupRoot, req.params.id);
    await writeBackupAudit(req.params.id, "backup_download", "Encrypted backup downloaded");
    res.download(filePath, metadata.file_name);
  } catch (error) {
    respondError(req, res, error);
  }
});

export default router;
