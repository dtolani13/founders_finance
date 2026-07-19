import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, parse, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { db, documents } from "@workspace/db";
import { eq } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const EVIDENCE_MAX_BYTES = 20 * 1024 * 1024;

const DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "screenshot",
  "contract",
  "bank_statement",
  "subscription_receipt",
  "tax_document",
  "note",
  "other",
] as const;

export type EvidenceDocumentType = (typeof DOCUMENT_TYPES)[number];

export type EvidenceMetadataInput = {
  document_type: EvidenceDocumentType;
  entity_id?: string | null;
  account_id?: string | null;
  transaction_id?: string | null;
  statement_id?: string | null;
  period_month?: string | null;
  description?: string | null;
};

export type StagedEvidenceFile = {
  path: string;
  originalname: string;
  mimetype: string;
  size: number;
};

type InspectedEvidenceFile = {
  originalName: string;
  mimeType: string;
  extension: string;
  bytes: number;
  sha256: string;
};

export class EvidenceStorageError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = "EVIDENCE_STORAGE_ERROR",
  ) {
    super(message);
    this.name = "EvidenceStorageError";
  }
}

function assertSafeRoot(rawRoot: string): string {
  const root = resolve(rawRoot);
  if (root === parse(root).root) {
    throw new EvidenceStorageError("Evidence storage cannot use a filesystem root.", 500, "UNSAFE_EVIDENCE_ROOT");
  }
  const normalized = root.toLowerCase().replaceAll("\\", "/");
  if (
    normalized.includes("/artifacts/founders-finance/public")
    || normalized.includes("/.git/")
    || normalized.endsWith("/.git")
    || normalized.includes("/node_modules/")
  ) {
    throw new EvidenceStorageError("Evidence storage must be outside public and tool-managed directories.", 500, "UNSAFE_EVIDENCE_ROOT");
  }
  return root;
}

export function getEvidenceRoot(): string {
  return assertSafeRoot(process.env.EVIDENCE_STORAGE_ROOT ?? "evidence");
}

export function getEvidenceStagingRoot(): string {
  return assertSafeRoot(resolve(tmpdir(), "founders-finance-evidence-staging"));
}

export async function prepareEvidenceDirectories(): Promise<void> {
  await Promise.all([
    mkdir(getEvidenceRoot(), { recursive: true }),
    mkdir(getEvidenceStagingRoot(), { recursive: true }),
  ]);
}

function assertStorageKey(key: string): string {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new EvidenceStorageError("Stored evidence path is invalid.", 500, "INVALID_STORAGE_KEY");
  }
  return normalized;
}

export function resolveEvidencePath(key: string): string {
  const root = getEvidenceRoot();
  const normalized = assertStorageKey(key);
  const target = resolve(root, ...normalized.split("/"));
  const fromRoot = relative(root, target);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || isAbsolute(fromRoot)) {
    throw new EvidenceStorageError("Stored evidence path escaped the configured root.", 500, "EVIDENCE_PATH_ESCAPE");
  }
  return target;
}

function safeOriginalName(value: string): string {
  const leaf = basename(value.replaceAll("\\", "/"))
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!leaf) return "evidence";
  return leaf.slice(0, 180);
}

function detectFileType(header: Buffer, originalName: string): { mimeType: string; extension: string } {
  if (header.subarray(0, 5).toString("ascii") === "%PDF-") return { mimeType: "application/pdf", extension: ".pdf" };
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: "image/png", extension: ".png" };
  }
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: ".jpg" };
  }
  if (header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") {
    return { mimeType: "image/webp", extension: ".webp" };
  }

  const extension = extname(originalName).toLowerCase();
  const text = header.toString("utf8");
  if (extension === ".csv" && !header.includes(0) && /[,;\t]/.test(text)) {
    return { mimeType: "text/csv", extension: ".csv" };
  }
  throw new EvidenceStorageError(
    "Unsupported file. Use PDF, PNG, JPEG, WebP, or CSV.",
    415,
    "EVIDENCE_TYPE_NOT_ALLOWED",
  );
}

async function sha256File(path: string): Promise<string> {
  const handle = await open(path, "r");
  const hash = createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) hash.update(Buffer.from(chunk));
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

export async function inspectStagedEvidence(file: StagedEvidenceFile): Promise<InspectedEvidenceFile> {
  const info = await lstat(file.path).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink()) {
    throw new EvidenceStorageError("The staged upload is unavailable.", 400, "EVIDENCE_UPLOAD_MISSING");
  }
  if (info.size <= 0) throw new EvidenceStorageError("The uploaded file is empty.", 400, "EVIDENCE_FILE_EMPTY");
  if (info.size > EVIDENCE_MAX_BYTES || file.size > EVIDENCE_MAX_BYTES) {
    throw new EvidenceStorageError("Evidence files cannot exceed 20 MB.", 413, "EVIDENCE_FILE_TOO_LARGE");
  }
  const handle = await open(file.path, "r");
  const header = Buffer.alloc(Math.min(8192, info.size));
  try {
    await handle.read(header, 0, header.length, 0);
  } finally {
    await handle.close();
  }
  const detected = detectFileType(header, file.originalname);
  return {
    originalName: safeOriginalName(file.originalname),
    mimeType: detected.mimeType,
    extension: detected.extension,
    bytes: info.size,
    sha256: await sha256File(file.path),
  };
}

function dateStoragePrefix(now = new Date()): string {
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function moveExclusive(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  try {
    await rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    await copyFile(source, destination, constants.COPYFILE_EXCL);
    await unlink(source);
  }
}

async function removeIfPresent(path: string | undefined): Promise<void> {
  if (!path) return;
  await rm(path, { force: true }).catch(() => undefined);
}

function validPeriodMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-01$/.test(value) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new EvidenceStorageError("Period month must be the first day of a valid month.", 400, "INVALID_PERIOD_MONTH");
  }
  return value;
}

function normalizeMetadata(input: EvidenceMetadataInput) {
  if (!DOCUMENT_TYPES.includes(input.document_type)) {
    throw new EvidenceStorageError("Document type is not supported.", 400, "INVALID_DOCUMENT_TYPE");
  }
  return {
    document_type: input.document_type,
    entity_id: input.entity_id || null,
    account_id: input.account_id || null,
    transaction_id: input.transaction_id || null,
    statement_id: input.statement_id || null,
    period_month: validPeriodMonth(input.period_month),
    description: input.description?.trim() || null,
  };
}

async function getDocumentOrThrow(executor: DbTransaction | typeof db, documentId: string) {
  const rows = await executor.select().from(documents).where(eq(documents.id, documentId));
  const document = rows[0];
  if (!document) throw new EvidenceStorageError("Document not found.", 404, "DOCUMENT_NOT_FOUND");
  return document;
}

function assertNotArchived(document: typeof documents.$inferSelect): void {
  if (document.archived_at || document.evidence_status === "archived") {
    throw new EvidenceStorageError("Archived evidence is read-only.", 409, "DOCUMENT_ARCHIVED");
  }
}

export function toPublicDocument(document: typeof documents.$inferSelect) {
  const { file_path: _storageKey, ...publicFields } = document;
  return {
    ...publicFields,
    has_file: Boolean(document.file_path),
  };
}

export async function createEvidenceMetadata(input: EvidenceMetadataInput) {
  const normalized = normalizeMetadata(input);
  return db.transaction(async (tx) => {
    const [document] = await tx.insert(documents).values({
      ...normalized,
      evidence_status: "metadata_only",
    }).returning();
    await writeAuditLog({
      tableName: "documents",
      recordId: document.id,
      action: "create_metadata",
      newValue: toPublicDocument(document),
      memo: "Evidence metadata created without an attached file.",
    }, tx);
    return document;
  });
}

export async function createEvidenceWithFile(
  input: EvidenceMetadataInput,
  stagedFile: StagedEvidenceFile,
  hooks: { afterFileStored?: () => void | Promise<void> } = {},
) {
  const normalized = normalizeMetadata(input);
  const inspected = await inspectStagedEvidence(stagedFile).catch(async (error) => {
    await removeIfPresent(stagedFile.path);
    throw error;
  });
  const storageKey = `files/${dateStoragePrefix()}/${randomUUID()}${inspected.extension}`;
  const destination = resolveEvidencePath(storageKey);
  try {
    await moveExclusive(stagedFile.path, destination);
    await hooks.afterFileStored?.();
    return await db.transaction(async (tx) => {
      const [document] = await tx.insert(documents).values({
        ...normalized,
        file_name: inspected.originalName,
        file_path: storageKey,
        mime_type: inspected.mimeType,
        file_size_bytes: inspected.bytes,
        file_sha256: inspected.sha256,
        evidence_status: "attached",
      }).returning();
      await writeAuditLog({
        tableName: "documents",
        recordId: document.id,
        action: "upload",
        newValue: toPublicDocument(document),
        memo: `Evidence file uploaded (${inspected.bytes} bytes).`,
      }, tx);
      return document;
    });
  } catch (error) {
    await removeIfPresent(destination);
    throw error;
  } finally {
    await removeIfPresent(stagedFile.path);
  }
}

export async function replaceEvidenceFile(
  documentId: string,
  stagedFile: StagedEvidenceFile,
  hooks: { afterFilesMoved?: () => void | Promise<void> } = {},
) {
  const existing = await getDocumentOrThrow(db, documentId);
  assertNotArchived(existing);
  const inspected = await inspectStagedEvidence(stagedFile).catch(async (error) => {
    await removeIfPresent(stagedFile.path);
    throw error;
  });
  const newStorageKey = `files/${dateStoragePrefix()}/${randomUUID()}${inspected.extension}`;
  const newPath = resolveEvidencePath(newStorageKey);
  const oldPath = existing.file_path ? resolveEvidencePath(existing.file_path) : undefined;
  const oldExtension = oldPath ? extname(oldPath) : "";
  const versionKey = oldPath
    ? `versions/${documentId}/${Date.now()}-${randomUUID()}${oldExtension}`
    : undefined;
  const versionPath = versionKey ? resolveEvidencePath(versionKey) : undefined;
  let oldMoved = false;
  try {
    await moveExclusive(stagedFile.path, newPath);
    if (oldPath && versionPath) {
      const oldInfo = await lstat(oldPath).catch(() => null);
      if (oldInfo?.isSymbolicLink()) throw new EvidenceStorageError("Existing evidence path is unsafe.", 409, "EVIDENCE_PATH_UNSAFE");
      if (oldInfo?.isFile()) {
        await moveExclusive(oldPath, versionPath);
        oldMoved = true;
      }
    }
    await hooks.afterFilesMoved?.();
    return await db.transaction(async (tx) => {
      const current = await getDocumentOrThrow(tx, documentId);
      assertNotArchived(current);
      if (current.updated_at.getTime() !== existing.updated_at.getTime()) {
        throw new EvidenceStorageError("Document changed during replacement. Try again.", 409, "DOCUMENT_CHANGED");
      }
      const [updated] = await tx.update(documents).set({
        file_name: inspected.originalName,
        file_path: newStorageKey,
        mime_type: inspected.mimeType,
        file_size_bytes: inspected.bytes,
        file_sha256: inspected.sha256,
        evidence_status: "attached",
        updated_at: new Date(),
      }).where(eq(documents.id, documentId)).returning();
      await writeAuditLog({
        tableName: "documents",
        recordId: documentId,
        action: "replace_file",
        previousValue: toPublicDocument(existing),
        newValue: { ...toPublicDocument(updated), previous_version_preserved: Boolean(oldMoved) },
        memo: oldMoved ? "Evidence file replaced; previous bytes retained in version storage." : "Evidence file attached.",
      }, tx);
      return updated;
    });
  } catch (error) {
    await removeIfPresent(newPath);
    if (oldMoved && oldPath && versionPath) {
      await mkdir(dirname(oldPath), { recursive: true });
      await rename(versionPath, oldPath).catch(() => undefined);
    }
    throw error;
  } finally {
    await removeIfPresent(stagedFile.path);
  }
}

export async function updateEvidenceMetadata(
  documentId: string,
  input: Partial<EvidenceMetadataInput>,
) {
  return db.transaction(async (tx) => {
    const existing = await getDocumentOrThrow(tx, documentId);
    assertNotArchived(existing);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (input.document_type !== undefined) {
      if (!DOCUMENT_TYPES.includes(input.document_type)) {
        throw new EvidenceStorageError("Document type is not supported.", 400, "INVALID_DOCUMENT_TYPE");
      }
      update.document_type = input.document_type;
    }
    for (const field of ["entity_id", "account_id", "transaction_id", "statement_id"] as const) {
      if (input[field] !== undefined) update[field] = input[field] || null;
    }
    if (input.period_month !== undefined) update.period_month = validPeriodMonth(input.period_month);
    if (input.description !== undefined) update.description = input.description?.trim() || null;
    const [updated] = await tx.update(documents).set(update).where(eq(documents.id, documentId)).returning();
    await writeAuditLog({
      tableName: "documents",
      recordId: documentId,
      action: "update_metadata",
      previousValue: toPublicDocument(existing),
      newValue: toPublicDocument(updated),
    }, tx);
    return updated;
  });
}

export async function archiveEvidence(documentId: string) {
  return db.transaction(async (tx) => {
    const existing = await getDocumentOrThrow(tx, documentId);
    if (existing.archived_at) return existing;
    const [archived] = await tx.update(documents).set({
      evidence_status: "archived",
      archived_at: new Date(),
      updated_at: new Date(),
    }).where(eq(documents.id, documentId)).returning();
    await writeAuditLog({
      tableName: "documents",
      recordId: documentId,
      action: "archive",
      previousValue: toPublicDocument(existing),
      newValue: toPublicDocument(archived),
      memo: "Evidence archived; file and metadata retained for recordkeeping.",
    }, tx);
    return archived;
  });
}

async function markEvidenceProblem(
  document: typeof documents.$inferSelect,
  status: "missing" | "needs_review",
  memo: string,
) {
  if (document.evidence_status === status) return;
  await db.transaction(async (tx) => {
    const [updated] = await tx.update(documents).set({ evidence_status: status, updated_at: new Date() })
      .where(eq(documents.id, document.id)).returning();
    await writeAuditLog({
      tableName: "documents",
      recordId: document.id,
      action: status === "missing" ? "file_missing" : "integrity_failure",
      previousValue: toPublicDocument(document),
      newValue: toPublicDocument(updated),
      memo,
    }, tx);
  });
}

export async function getEvidenceContent(documentId: string) {
  const document = await getDocumentOrThrow(db, documentId);
  if (!document.file_path || !document.mime_type || !document.file_sha256 || document.file_size_bytes == null) {
    throw new EvidenceStorageError("No file is attached to this document.", 404, "EVIDENCE_FILE_NOT_ATTACHED");
  }
  const path = resolveEvidencePath(document.file_path);
  const info = await lstat(path).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink()) {
    await markEvidenceProblem(document, "missing", "Stored evidence file could not be found.");
    throw new EvidenceStorageError("The evidence file is missing from storage.", 410, "EVIDENCE_FILE_MISSING");
  }
  const actualHash = await sha256File(path);
  if (info.size !== document.file_size_bytes || actualHash !== document.file_sha256) {
    await markEvidenceProblem(document, "needs_review", "Stored evidence failed size or checksum verification.");
    throw new EvidenceStorageError("The evidence file failed integrity verification.", 409, "EVIDENCE_INTEGRITY_FAILURE");
  }
  return {
    document,
    path,
    fileName: safeOriginalName(document.file_name ?? "evidence"),
    mimeType: document.mime_type,
    bytes: info.size,
  };
}

export async function cleanupStagedEvidence(path: string | undefined): Promise<void> {
  await removeIfPresent(path);
}
