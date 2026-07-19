import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createBackup, restoreBackup, verifyBackup } from "@workspace/backup";
import * as schema from "@workspace/db/schema";
import { migrateDatabase } from "@workspace/db/migrations";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import pg from "pg";

if (!process.env.DATABASE_URL) process.loadEnvFile(".env");
const sourceDatabaseUrl = process.env.DATABASE_URL;
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL is required for evidence integration tests.");

const { Client, Pool } = pg;

function urlForDatabase(source: string, databaseName: string): string {
  const url = new URL(source);
  url.pathname = `/${databaseName}`;
  return url.toString();
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

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

test("evidence storage is bounded, atomic, versioned, auditable, and recoverable", async (t) => {
  const databaseName = `ff_evidence_test_${randomBytes(5).toString("hex")}`;
  const adminUrl = urlForDatabase(sourceDatabaseUrl, "postgres");
  const testUrl = urlForDatabase(sourceDatabaseUrl, databaseName);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "founders-finance-evidence-test-"));
  const evidenceRoot = join(temporaryRoot, "evidence");
  const stagingRoot = join(temporaryRoot, "staging");
  const backupRoot = join(temporaryRoot, "backups");
  await Promise.all([
    mkdir(evidenceRoot, { recursive: true }),
    mkdir(stagingRoot, { recursive: true }),
    mkdir(backupRoot, { recursive: true }),
  ]);
  await createDatabase(adminUrl, databaseName);
  const migrationPool = new Pool({ connectionString: testUrl });
  await migrateDatabase(drizzle(migrationPool, { schema }));
  await migrationPool.end();

  process.env.DATABASE_URL = testUrl;
  process.env.EVIDENCE_STORAGE_ROOT = evidenceRoot;
  const evidence = await import("./evidence-storage");
  const database = await import("@workspace/db");
  const { audit_log, db, documents } = database;

  const pdfOne = Buffer.from("%PDF-1.7\nFounders Finance receipt fixture one.\n%%EOF\n", "utf8");
  const pdfTwo = Buffer.from("%PDF-1.7\nFounders Finance receipt fixture two.\n%%EOF\n", "utf8");

  async function stage(name: string, bytes: Buffer, mimetype = "application/pdf") {
    const path = join(stagingRoot, `${randomBytes(6).toString("hex")}.upload`);
    await writeFile(path, bytes);
    return { path, originalname: name, mimetype, size: bytes.length };
  }

  try {
    let documentId = "";

    await t.test("upload sanitizes the display name and stores verified server-controlled metadata", async () => {
      const created = await evidence.createEvidenceWithFile(
        { document_type: "receipt", period_month: "2026-07-01", description: "Primary receipt fixture" },
        await stage("../../quarterly-receipt.pdf", pdfOne),
      );
      documentId = created.id;
      assert.equal(created.file_name, "quarterly-receipt.pdf");
      assert.equal(created.mime_type, "application/pdf");
      assert.equal(created.file_size_bytes, pdfOne.length);
      assert.equal(created.evidence_status, "attached");
      assert.match(created.file_sha256 ?? "", /^[a-f0-9]{64}$/);
      assert.match(created.file_path ?? "", /^files\/\d{4}\/\d{2}\/[a-f0-9-]+\.pdf$/);
      assert.equal(Object.hasOwn(evidence.toPublicDocument(created), "file_path"), false);

      const content = await evidence.getEvidenceContent(created.id);
      assert.deepEqual(await readFile(content.path), pdfOne);
      const audits = await db.select().from(audit_log).where(eq(audit_log.record_id, created.id));
      assert.equal(audits.some((audit) => audit.action === "upload"), true);
    });

    await t.test("spoofed types and forced failures leave no metadata or orphan files", async () => {
      const filesBefore = await listFiles(evidenceRoot);
      const rowsBefore = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(documents);
      await assert.rejects(
        evidence.createEvidenceWithFile(
          { document_type: "receipt" },
          await stage("malware.pdf", Buffer.from("MZ executable bytes"), "application/pdf"),
        ),
        (error: unknown) => error instanceof evidence.EvidenceStorageError && error.code === "EVIDENCE_TYPE_NOT_ALLOWED",
      );
      await assert.rejects(
        evidence.createEvidenceWithFile(
          { document_type: "receipt" },
          await stage("rollback.pdf", pdfOne),
          { afterFileStored: () => { throw new Error("simulated evidence failure"); } },
        ),
        /simulated evidence failure/,
      );
      const rowsAfter = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(documents);
      assert.equal(rowsAfter[0].count, rowsBefore[0].count);
      assert.deepEqual(await listFiles(evidenceRoot), filesBefore);
      assert.deepEqual(await listFiles(stagingRoot), []);
    });

    await t.test("replacement preserves a version and replacement failure restores the prior file", async () => {
      const replaced = await evidence.replaceEvidenceFile(documentId, await stage("quarterly-receipt-corrected.pdf", pdfTwo));
      assert.equal(replaced.file_name, "quarterly-receipt-corrected.pdf");
      const current = await evidence.getEvidenceContent(documentId);
      assert.deepEqual(await readFile(current.path), pdfTwo);
      const versions = (await listFiles(evidenceRoot)).filter((path) => path.includes(`${join("versions", documentId)}`));
      assert.equal(versions.length, 1);
      assert.deepEqual(await readFile(versions[0]), pdfOne);

      const hashBefore = replaced.file_sha256;
      await assert.rejects(
        evidence.replaceEvidenceFile(
          documentId,
          await stage("failed-replacement.pdf", pdfOne),
          { afterFilesMoved: () => { throw new Error("simulated replacement failure"); } },
        ),
        /simulated replacement failure/,
      );
      const [unchanged] = await db.select().from(documents).where(eq(documents.id, documentId));
      assert.equal(unchanged.file_sha256, hashBefore);
      assert.deepEqual(await readFile((await evidence.getEvidenceContent(documentId)).path), pdfTwo);
    });

    await t.test("HTTP upload is auth-gated, bounded, type-safe, and downloadable", async () => {
      const { default: app } = await import("../app");
      const server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const { port } = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${port}`;
      try {
        const deniedForm = new FormData();
        deniedForm.append("document_type", "receipt");
        deniedForm.append("file", new Blob([pdfOne], { type: "application/pdf" }), "denied.pdf");
        const denied = await fetch(`${baseUrl}/api/documents/upload`, { method: "POST", body: deniedForm });
        assert.equal(denied.status, 401);

        const setup = await fetch(`${baseUrl}/api/auth/setup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "evidence route integration passphrase" }),
        });
        assert.equal(setup.status, 201);
        const rawCookie = setup.headers.get("set-cookie");
        assert.ok(rawCookie);
        const cookie = rawCookie.split(";", 1)[0];

        const invalidForm = new FormData();
        invalidForm.append("document_type", "receipt");
        invalidForm.append("file", new Blob(["not evidence"], { type: "application/octet-stream" }), "payload.exe");
        const invalid = await fetch(`${baseUrl}/api/documents/upload`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: invalidForm,
        });
        assert.equal(invalid.status, 415);

        const stagingBefore = await listFiles(evidence.getEvidenceStagingRoot());
        const oversizedForm = new FormData();
        oversizedForm.append("document_type", "receipt");
        oversizedForm.append(
          "file",
          new Blob([Buffer.alloc(evidence.EVIDENCE_MAX_BYTES + 1, 0x20)], { type: "application/pdf" }),
          "oversized.pdf",
        );
        const oversized = await fetch(`${baseUrl}/api/documents/upload`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: oversizedForm,
        });
        assert.equal(oversized.status, 413);
        assert.deepEqual(await listFiles(evidence.getEvidenceStagingRoot()), stagingBefore);

        const uploadForm = new FormData();
        uploadForm.append("document_type", "bank_statement");
        uploadForm.append("period_month", "2026-07-01");
        uploadForm.append("description", "HTTP statement fixture");
        uploadForm.append("file", new Blob([pdfOne], { type: "application/pdf" }), "statement.pdf");
        const uploadedResponse = await fetch(`${baseUrl}/api/documents/upload`, {
          method: "POST",
          headers: { Cookie: cookie },
          body: uploadForm,
        });
        assert.equal(uploadedResponse.status, 201);
        const uploaded = await uploadedResponse.json() as { id: string; has_file: boolean; file_name: string };
        assert.equal(uploaded.has_file, true);
        assert.equal(uploaded.file_name, "statement.pdf");

        const deniedContent = await fetch(`${baseUrl}/api/documents/${uploaded.id}/content`);
        assert.equal(deniedContent.status, 401);
        const content = await fetch(`${baseUrl}/api/documents/${uploaded.id}/content`, { headers: { Cookie: cookie } });
        assert.equal(content.status, 200);
        assert.equal(content.headers.get("content-type"), "application/pdf");
        assert.deepEqual(Buffer.from(await content.arrayBuffer()), pdfOne);
      } finally {
        server.close();
        await once(server, "close");
      }
    });

    await t.test("archive retains bytes and encrypted backup/restore recovers exact evidence", async () => {
      const archived = await evidence.archiveEvidence(documentId);
      assert.equal(archived.evidence_status, "archived");
      assert.ok(archived.archived_at);
      assert.deepEqual(await readFile((await evidence.getEvidenceContent(documentId)).path), pdfTwo);

      const passphrase = randomBytes(32).toString("base64url");
      const backup = await createBackup({
        databaseUrl: testUrl,
        backupRoot,
        evidenceRoot,
        passphrase,
        postgresBin: process.env.POSTGRES_BIN,
      });
      const verification = await verifyBackup(backupRoot, backup.id, passphrase, process.env.POSTGRES_BIN);
      assert.equal(verification.valid, true);
      assert.equal(verification.evidence_file_count, (await listFiles(evidenceRoot)).length);

      const contentBeforeRestore = await evidence.getEvidenceContent(documentId);
      await rm(contentBeforeRestore.path, { force: true });
      await assert.rejects(
        evidence.getEvidenceContent(documentId),
        (error: unknown) => error instanceof evidence.EvidenceStorageError && error.code === "EVIDENCE_FILE_MISSING",
      );
      const restored = await restoreBackup({
        databaseUrl: testUrl,
        backupRoot,
        evidenceRoot,
        passphrase,
        postgresBin: process.env.POSTGRES_BIN,
      }, backup.id);
      assert.equal(restored.restored, true);
      assert.deepEqual(await readFile((await evidence.getEvidenceContent(documentId)).path), pdfTwo);
    });

    await t.test("checksum tampering is detected and recorded for review", async () => {
      const content = await evidence.getEvidenceContent(documentId);
      const tampered = Buffer.from(pdfTwo);
      tampered[tampered.length - 2] ^= 1;
      await writeFile(content.path, tampered);
      await assert.rejects(
        evidence.getEvidenceContent(documentId),
        (error: unknown) => error instanceof evidence.EvidenceStorageError && error.code === "EVIDENCE_INTEGRITY_FAILURE",
      );
      const [flagged] = await db.select().from(documents).where(eq(documents.id, documentId));
      assert.equal(flagged.evidence_status, "needs_review");
      const audits = await db.select().from(audit_log).where(eq(audit_log.record_id, documentId));
      assert.equal(audits.some((audit) => audit.action === "integrity_failure"), true);
    });
  } finally {
    await database.pool.end();
    await dropDatabase(adminUrl, databaseName);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
