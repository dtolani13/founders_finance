import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decryptArchive, encryptArchive } from "./index";

test("encrypted backup payload round-trips without exposing plaintext", async () => {
  const root = await mkdtemp(join(tmpdir(), "founders-finance-encryption-test-"));
  const source = join(root, "source.tar");
  const encrypted = join(root, "backup.ffbackup");
  const restored = join(root, "restored.tar");
  const payload = randomBytes(32 * 1024);
  const passphrase = "correct-horse-battery-staple";

  try {
    await writeFile(source, payload);
    await encryptArchive(source, encrypted, passphrase);
    const encryptedBytes = await readFile(encrypted);

    assert.equal(encryptedBytes.subarray(0, 8).toString("ascii"), "FFBAK01\n");
    assert.equal(encryptedBytes.includes(payload.subarray(0, 64)), false);

    await decryptArchive(encrypted, restored, passphrase);
    assert.deepEqual(await readFile(restored), payload);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wrong backup passphrase fails closed and removes partial plaintext", async () => {
  const root = await mkdtemp(join(tmpdir(), "founders-finance-encryption-test-"));
  const source = join(root, "source.tar");
  const encrypted = join(root, "backup.ffbackup");
  const restored = join(root, "restored.tar");

  try {
    await writeFile(source, "sensitive financial payload");
    await encryptArchive(source, encrypted, "correct-horse-battery-staple");
    await assert.rejects(
      decryptArchive(encrypted, restored, "this-is-the-wrong-passphrase"),
      /could not be decrypted/i,
    );
    await assert.rejects(readFile(restored), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("backup passphrases shorter than twelve characters are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "founders-finance-encryption-test-"));
  try {
    await assert.rejects(
      encryptArchive(join(root, "missing"), join(root, "backup.ffbackup"), "too-short"),
      /between 12 and 128/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
