import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
} from "node:crypto";
import {
  appendFile,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import pg from "pg";

const { Client } = pg;
const MAGIC = Buffer.from("FFBAK01\n", "ascii");
const AUTH_TAG_BYTES = 16;
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const META_SUFFIX = ".meta.json";

function deriveKey(
  passphrase: string,
  salt: Buffer,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    scryptCallback(passphrase, salt, 32, options, (error, key) => {
      if (error) reject(error);
      else resolvePromise(key);
    });
  });
}

export type BackupStatus = "complete" | "failed";
export type VerificationStatus = "not_verified" | "verified" | "failed";

export interface BackupMetadata {
  id: string;
  app: "Founders Finance";
  file_name: string;
  created_at: string;
  completed_at: string | null;
  bytes: number;
  status: BackupStatus;
  verification_status: VerificationStatus;
  last_verified_at: string | null;
  last_recovery_drill_at: string | null;
  recovery_drill_status: VerificationStatus;
  includes_evidence: boolean;
  evidence_file_count: number;
  database_table_count: number;
  destination: string;
  error: string | null;
}

export interface BackupManifest {
  format_version: 1;
  app: "Founders Finance";
  backup_id: string;
  created_at: string;
  database: {
    file: "database.dump";
    bytes: number;
    sha256: string;
    table_counts: Record<string, number>;
  };
  evidence: {
    included: boolean;
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
}

export interface BackupConfig {
  databaseUrl: string;
  backupRoot: string;
  evidenceRoot: string;
  passphrase: string;
  postgresBin?: string;
}

export interface VerificationResult {
  valid: true;
  backup_id: string;
  verified_at: string;
  database_table_count: number;
  evidence_file_count: number;
  manifest: BackupManifest;
}

export interface RecoveryDrillResult {
  valid: true;
  backup_id: string;
  verified_at: string;
  restored_database: string;
  table_counts_match: true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown backup error";
}

function assertPassphrase(passphrase: string) {
  if (passphrase.length < 12 || passphrase.length > 128) {
    throw new Error("Backup passphrase must be between 12 and 128 characters.");
  }
}

function assertSafeRoot(root: string, label: string): string {
  const resolved = resolve(root);
  const parsedRoot = resolve(resolved, sep);
  if (resolved === parsedRoot || resolved === dirname(resolved)) {
    throw new Error(`${label} cannot be a filesystem root.`);
  }
  return resolved;
}

function safeBackupPath(backupRoot: string, fileName: string): string {
  if (basename(fileName) !== fileName || !fileName.endsWith(".ffbackup")) {
    throw new Error("Invalid backup file name.");
  }
  const root = assertSafeRoot(backupRoot, "Backup storage root");
  const target = resolve(root, fileName);
  if (!target.startsWith(`${root}${sep}`)) throw new Error("Backup path escaped the storage root.");
  return target;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function run(command: string, args: string[], options: { cwd?: string } = {}) {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${basename(command)} failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
    });
  });
}

async function runWithOutput(command: string, args: string[], options: { cwd?: string } = {}): Promise<string> {
  return new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(`${basename(command)} failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
    });
  });
}

export function resolvePostgresTool(tool: "pg_dump" | "pg_restore", postgresBin?: string): string {
  if (postgresBin) return join(resolve(postgresBin), process.platform === "win32" ? `${tool}.exe` : tool);
  if (process.platform === "win32") {
    for (let version = 20; version >= 12; version -= 1) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${version}\\bin\\${tool}.exe`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return tool;
}

export async function getTableCounts(databaseUrl: string): Promise<Record<string, number>> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = await client.query<{ table_schema: string; table_name: string }>(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const counts: Record<string, number> = {};
    for (const table of tables.rows) {
      const schema = table.table_schema.replace(/"/g, '""');
      const name = table.table_name.replace(/"/g, '""');
      const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${schema}"."${name}"`);
      counts[table.table_name] = Number(result.rows[0]?.count ?? 0);
    }
    return counts;
  } finally {
    await client.end();
  }
}

async function collectEvidence(sourceRoot: string, targetRoot: string) {
  const source = assertSafeRoot(sourceRoot, "Evidence storage root");
  const files: BackupManifest["evidence"]["files"] = [];
  if (!existsSync(source)) return files;
  await cp(source, targetRoot, { recursive: true, force: false, errorOnExist: true });

  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Evidence contains a symbolic link: ${entry.name}`);
      if (entry.isDirectory()) await walk(fullPath);
      if (entry.isFile()) {
        const fileStat = await stat(fullPath);
        const relativePath = relative(targetRoot, fullPath).split(sep).join("/");
        files.push({ path: relativePath, bytes: fileStat.size, sha256: await hashFile(fullPath) });
      }
    }
  }

  await walk(targetRoot);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function encryptArchive(sourcePath: string, destinationPath: string, passphrase: string) {
  assertPassphrase(passphrase);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt, SCRYPT_OPTIONS);
  const header = Buffer.from(JSON.stringify({
    cipher: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    N: SCRYPT_OPTIONS.N,
    r: SCRYPT_OPTIONS.r,
    p: SCRYPT_OPTIONS.p,
  }), "utf8");
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(header.length);
  await writeFile(destinationPath, Buffer.concat([MAGIC, headerLength, header]));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  await pipeline(createReadStream(sourcePath), cipher, createWriteStream(destinationPath, { flags: "a" }));
  await appendFile(destinationPath, cipher.getAuthTag());
}

export async function decryptArchive(sourcePath: string, destinationPath: string, passphrase: string) {
  assertPassphrase(passphrase);
  const file = await open(sourcePath, "r");
  try {
    const fileStat = await file.stat();
    const prefix = Buffer.alloc(MAGIC.length + 4);
    await file.read(prefix, 0, prefix.length, 0);
    if (!prefix.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a Founders Finance encrypted backup.");
    const headerLength = prefix.readUInt32BE(MAGIC.length);
    if (headerLength < 2 || headerLength > 8192) throw new Error("Backup encryption header is invalid.");
    const headerBuffer = Buffer.alloc(headerLength);
    await file.read(headerBuffer, 0, headerLength, prefix.length);
    const header = JSON.parse(headerBuffer.toString("utf8")) as {
      cipher: string; kdf: string; salt: string; iv: string; N: number; r: number; p: number;
    };
    if (header.cipher !== "aes-256-gcm" || header.kdf !== "scrypt") throw new Error("Unsupported backup encryption format.");
    const cipherStart = prefix.length + headerLength;
    const cipherEnd = fileStat.size - AUTH_TAG_BYTES - 1;
    if (cipherEnd < cipherStart) throw new Error("Backup payload is incomplete.");
    const authTag = Buffer.alloc(AUTH_TAG_BYTES);
    await file.read(authTag, 0, AUTH_TAG_BYTES, fileStat.size - AUTH_TAG_BYTES);
    const key = await deriveKey(passphrase, Buffer.from(header.salt, "base64"), {
      N: header.N, r: header.r, p: header.p, maxmem: 64 * 1024 * 1024,
    });
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"));
    decipher.setAuthTag(authTag);
    try {
      await pipeline(createReadStream(sourcePath, { start: cipherStart, end: cipherEnd }), decipher, createWriteStream(destinationPath));
    } catch {
      await rm(destinationPath, { force: true });
      throw new Error("Backup could not be decrypted. Check the passphrase and file integrity.");
    }
  } finally {
    await file.close();
  }
}

function validateArchiveEntry(entry: string) {
  const normalized = entry.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized === ".") return;
  if (isAbsolute(normalized) || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`Unsafe path in backup archive: ${entry}`);
  }
}

async function extractEncryptedBackup(filePath: string, passphrase: string, workingRoot: string) {
  const tarPath = join(workingRoot, "backup.tar");
  const extractedRoot = join(workingRoot, "extracted");
  await mkdir(extractedRoot, { recursive: true });
  await decryptArchive(filePath, tarPath, passphrase);
  const listing = await runWithOutput("tar", ["-tf", tarPath]);
  listing.split(/\r?\n/).filter(Boolean).forEach(validateArchiveEntry);
  await run("tar", ["-xf", tarPath, "-C", extractedRoot]);
  return extractedRoot;
}

function parseManifest(raw: string): BackupManifest {
  const manifest = JSON.parse(raw) as BackupManifest;
  if (manifest.app !== "Founders Finance" || manifest.format_version !== 1 || !manifest.backup_id) {
    throw new Error("Backup manifest is invalid or unsupported.");
  }
  return manifest;
}

async function verifyExtracted(extractedRoot: string): Promise<BackupManifest> {
  const manifest = parseManifest(await readFile(join(extractedRoot, "manifest.json"), "utf8"));
  const dumpPath = join(extractedRoot, manifest.database.file);
  const dumpStat = await stat(dumpPath);
  if (dumpStat.size !== manifest.database.bytes || await hashFile(dumpPath) !== manifest.database.sha256) {
    throw new Error("Database dump integrity check failed.");
  }
  for (const expected of manifest.evidence.files) {
    validateArchiveEntry(expected.path);
    const evidencePath = resolve(extractedRoot, "evidence", ...expected.path.split("/"));
    const evidenceRoot = resolve(extractedRoot, "evidence");
    if (!evidencePath.startsWith(`${evidenceRoot}${sep}`)) throw new Error("Evidence path escaped the backup package.");
    const evidenceStat = await stat(evidencePath);
    if (evidenceStat.size !== expected.bytes || await hashFile(evidencePath) !== expected.sha256) {
      throw new Error(`Evidence integrity check failed: ${expected.path}`);
    }
  }
  return manifest;
}

function metadataPath(filePath: string) {
  return `${filePath}${META_SUFFIX}`;
}

async function writeMetadata(filePath: string, metadata: BackupMetadata) {
  await writeFile(metadataPath(filePath), `${JSON.stringify(metadata, null, 2)}\n`);
}

async function updateMetadata(filePath: string, update: Partial<BackupMetadata>) {
  const metadata = JSON.parse(await readFile(metadataPath(filePath), "utf8")) as BackupMetadata;
  const next = { ...metadata, ...update };
  await writeMetadata(filePath, next);
  return next;
}

export async function createBackup(config: BackupConfig): Promise<BackupMetadata> {
  assertPassphrase(config.passphrase);
  const backupRoot = assertSafeRoot(config.backupRoot, "Backup storage root");
  await mkdir(backupRoot, { recursive: true });
  const now = new Date();
  const id = `${now.toISOString().replace(/[:.]/g, "-")}-${randomBytes(4).toString("hex")}`;
  const fileName = `founders-finance-${id}.ffbackup`;
  const finalPath = safeBackupPath(backupRoot, fileName);
  const workingRoot = await mkdtemp(join(tmpdir(), "founders-finance-backup-"));
  const packageRoot = join(workingRoot, "package");
  const dumpPath = join(packageRoot, "database.dump");
  const tarPath = join(workingRoot, "backup.tar");
  const partialPath = `${finalPath}.partial`;
  await mkdir(packageRoot, { recursive: true });
  let metadata: BackupMetadata = {
    id,
    app: "Founders Finance",
    file_name: fileName,
    created_at: now.toISOString(),
    completed_at: null,
    bytes: 0,
    status: "failed",
    verification_status: "not_verified",
    last_verified_at: null,
    last_recovery_drill_at: null,
    recovery_drill_status: "not_verified",
    includes_evidence: false,
    evidence_file_count: 0,
    database_table_count: 0,
    destination: backupRoot,
    error: null,
  };
  try {
    await run(resolvePostgresTool("pg_dump", config.postgresBin), [
      "--format=custom", "--no-owner", "--no-privileges", "--file", dumpPath, config.databaseUrl,
    ]);
    const evidenceRoot = join(packageRoot, "evidence");
    const evidenceFiles = await collectEvidence(config.evidenceRoot, evidenceRoot);
    const dumpStat = await stat(dumpPath);
    const tableCounts = await getTableCounts(config.databaseUrl);
    const manifest: BackupManifest = {
      format_version: 1,
      app: "Founders Finance",
      backup_id: id,
      created_at: now.toISOString(),
      database: {
        file: "database.dump",
        bytes: dumpStat.size,
        sha256: await hashFile(dumpPath),
        table_counts: tableCounts,
      },
      evidence: {
        included: evidenceFiles.length > 0,
        files: evidenceFiles,
      },
    };
    await writeFile(join(packageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await run("tar", ["-cf", tarPath, "-C", packageRoot, "."]);
    await encryptArchive(tarPath, partialPath, config.passphrase);
    await rename(partialPath, finalPath);
    const finalStat = await stat(finalPath);
    metadata = {
      ...metadata,
      completed_at: new Date().toISOString(),
      bytes: finalStat.size,
      status: "complete",
      includes_evidence: manifest.evidence.included,
      evidence_file_count: evidenceFiles.length,
      database_table_count: Object.keys(tableCounts).length,
    };
    await writeMetadata(finalPath, metadata);
    return metadata;
  } catch (error) {
    metadata.error = errorMessage(error);
    await rm(partialPath, { force: true });
    await writeMetadata(finalPath, metadata).catch(() => undefined);
    throw error;
  } finally {
    await rm(workingRoot, { recursive: true, force: true });
  }
}

export async function listBackups(backupRoot: string): Promise<BackupMetadata[]> {
  const root = assertSafeRoot(backupRoot, "Backup storage root");
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const metadata: BackupMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(`.ffbackup${META_SUFFIX}`)) continue;
    try {
      const parsed = JSON.parse(await readFile(join(root, entry.name), "utf8")) as BackupMetadata;
      if (parsed.app === "Founders Finance" && safeBackupPath(root, parsed.file_name)) metadata.push(parsed);
    } catch {
      // A malformed sidecar is omitted; the encrypted package remains untouched.
    }
  }
  return metadata.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function findBackup(backupRoot: string, id: string): Promise<{ metadata: BackupMetadata; filePath: string }> {
  const backup = (await listBackups(backupRoot)).find((item) => item.id === id);
  if (!backup) throw new Error("Backup not found.");
  const filePath = safeBackupPath(backupRoot, backup.file_name);
  if (!existsSync(filePath)) throw new Error("Backup package is missing from storage.");
  return { metadata: backup, filePath };
}

async function inspectBackup(filePath: string, passphrase: string, postgresBin?: string) {
  const workingRoot = await mkdtemp(join(tmpdir(), "founders-finance-verify-"));
  try {
    const extractedRoot = await extractEncryptedBackup(filePath, passphrase, workingRoot);
    const manifest = await verifyExtracted(extractedRoot);
    await run(resolvePostgresTool("pg_restore", postgresBin), ["--list", join(extractedRoot, manifest.database.file)]);
    return { manifest, extractedRoot, workingRoot };
  } catch (error) {
    await rm(workingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyBackup(backupRoot: string, id: string, passphrase: string, postgresBin?: string): Promise<VerificationResult> {
  const { filePath } = await findBackup(backupRoot, id);
  try {
    const inspected = await inspectBackup(filePath, passphrase, postgresBin);
    const verifiedAt = new Date().toISOString();
    await rm(inspected.workingRoot, { recursive: true, force: true });
    await updateMetadata(filePath, { verification_status: "verified", last_verified_at: verifiedAt, error: null });
    return {
      valid: true,
      backup_id: inspected.manifest.backup_id,
      verified_at: verifiedAt,
      database_table_count: Object.keys(inspected.manifest.database.table_counts).length,
      evidence_file_count: inspected.manifest.evidence.files.length,
      manifest: inspected.manifest,
    };
  } catch (error) {
    await updateMetadata(filePath, { verification_status: "failed", last_verified_at: new Date().toISOString(), error: errorMessage(error) });
    throw error;
  }
}

function databaseNameFromUrl(databaseUrl: string): string {
  const name = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  if (!name) throw new Error("DATABASE_URL does not include a database name.");
  return name;
}

function maintenanceUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  url.pathname = "/postgres";
  return url.toString();
}

function countsMatch(expected: Record<string, number>, actual: Record<string, number>) {
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(actual).sort();
  return expectedKeys.length === actualKeys.length
    && expectedKeys.every((key, index) => key === actualKeys[index] && expected[key] === actual[key]);
}

export async function runRecoveryDrill(
  backupRoot: string,
  id: string,
  passphrase: string,
  databaseUrl: string,
  postgresBin?: string,
): Promise<RecoveryDrillResult> {
  const { filePath } = await findBackup(backupRoot, id);
  const inspected = await inspectBackup(filePath, passphrase, postgresBin);
  const drillDatabase = `founders_finance_verify_${randomBytes(6).toString("hex")}`;
  const maintenance = new Client({ connectionString: maintenanceUrl(databaseUrl) });
  const drillUrl = new URL(databaseUrl);
  drillUrl.pathname = `/${drillDatabase}`;
  let maintenanceConnected = false;
  try {
    await maintenance.connect();
    maintenanceConnected = true;
    await maintenance.query(`CREATE DATABASE "${drillDatabase}"`);
    await run(resolvePostgresTool("pg_restore", postgresBin), [
      "--no-owner", "--no-privileges", "--exit-on-error", "--dbname", drillUrl.toString(),
      join(inspected.extractedRoot, inspected.manifest.database.file),
    ]);
    const actualCounts = await getTableCounts(drillUrl.toString());
    if (!countsMatch(inspected.manifest.database.table_counts, actualCounts)) {
      throw new Error("Recovery drill restored data, but table row counts did not match the backup manifest.");
    }
    const verifiedAt = new Date().toISOString();
    await updateMetadata(filePath, {
      verification_status: "verified",
      last_verified_at: verifiedAt,
      recovery_drill_status: "verified",
      last_recovery_drill_at: verifiedAt,
      error: null,
    });
    return {
      valid: true,
      backup_id: inspected.manifest.backup_id,
      verified_at: verifiedAt,
      restored_database: drillDatabase,
      table_counts_match: true,
    };
  } catch (error) {
    await updateMetadata(filePath, {
      recovery_drill_status: "failed",
      last_recovery_drill_at: new Date().toISOString(),
      error: errorMessage(error),
    });
    throw error;
  } finally {
    if (maintenanceConnected) {
      await maintenance.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [drillDatabase]).catch(() => undefined);
      await maintenance.query(`DROP DATABASE IF EXISTS "${drillDatabase}"`).catch(() => undefined);
      await maintenance.end().catch(() => undefined);
    }
    await rm(inspected.workingRoot, { recursive: true, force: true });
  }
}

async function replaceEvidence(extractedRoot: string, evidenceRoot: string) {
  const target = assertSafeRoot(evidenceRoot, "Evidence storage root");
  const source = join(extractedRoot, "evidence");
  const rollback = `${target}.pre-restore-${Date.now()}`;
  await mkdir(dirname(target), { recursive: true });
  const hadTarget = existsSync(target);
  if (hadTarget) await rename(target, rollback);
  try {
    if (existsSync(source)) await cp(source, target, { recursive: true, force: false, errorOnExist: true });
    else await mkdir(target, { recursive: true });
    if (hadTarget) await rm(rollback, { recursive: true, force: true });
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    if (hadTarget) await rename(rollback, target);
    throw error;
  }
}

async function verifyRestoredEvidence(
  evidenceRoot: string,
  expectedFiles: BackupManifest["evidence"]["files"],
) {
  const root = assertSafeRoot(evidenceRoot, "Evidence storage root");
  const actualFiles: string[] = [];

  async function walk(directory: string) {
    if (!existsSync(directory)) return;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Restored evidence contains a symbolic link: ${entry.name}`);
      if (entry.isDirectory()) await walk(fullPath);
      if (entry.isFile()) actualFiles.push(relative(root, fullPath).split(sep).join("/"));
    }
  }

  await walk(root);
  if (actualFiles.length !== expectedFiles.length) {
    throw new Error("Restore completed, but the final evidence-file count did not match the backup manifest.");
  }
  for (const expected of expectedFiles) {
    const path = resolve(root, ...expected.path.split("/"));
    if (!path.startsWith(`${root}${sep}`)) throw new Error("Restored evidence path escaped the storage root.");
    const fileStat = await stat(path);
    if (fileStat.size !== expected.bytes || await hashFile(path) !== expected.sha256) {
      throw new Error(`Post-restore evidence integrity check failed: ${expected.path}`);
    }
  }
}

export async function restoreBackup(config: BackupConfig, id: string): Promise<{ restored: true; backup_id: string; pre_restore_backup_id: string }> {
  const selected = await findBackup(config.backupRoot, id);
  const inspected = await inspectBackup(selected.filePath, config.passphrase, config.postgresBin);
  let preRestore: BackupMetadata | null = null;
  try {
    preRestore = await createBackup(config);
    await run(resolvePostgresTool("pg_restore", config.postgresBin), [
      "--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error",
      "--dbname", config.databaseUrl, join(inspected.extractedRoot, inspected.manifest.database.file),
    ]);
    await replaceEvidence(inspected.extractedRoot, config.evidenceRoot);
    await verifyRestoredEvidence(config.evidenceRoot, inspected.manifest.evidence.files);
    const actualCounts = await getTableCounts(config.databaseUrl);
    if (!countsMatch(inspected.manifest.database.table_counts, actualCounts)) {
      throw new Error("Restore completed, but post-restore table row counts did not match the backup manifest.");
    }
    await updateMetadata(selected.filePath, {
      verification_status: "verified",
      last_verified_at: new Date().toISOString(),
      error: null,
    });
    return { restored: true, backup_id: id, pre_restore_backup_id: preRestore.id };
  } finally {
    await rm(inspected.workingRoot, { recursive: true, force: true });
  }
}

export async function copyBackupTo(filePath: string, destinationPath: string) {
  await copyFile(filePath, destinationPath);
}

export { databaseNameFromUrl };
