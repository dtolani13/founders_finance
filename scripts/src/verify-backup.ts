import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const backupDir = process.argv[2];
if (!backupDir) {
  throw new Error("Usage: pnpm run backup:verify -- <backup-folder>");
}

const root = resolve(backupDir);
const manifestPath = join(root, "manifest.json");
const dumpPath = join(root, "database.dump");

if (!existsSync(manifestPath)) throw new Error("Missing manifest.json.");
if (!existsSync(dumpPath)) throw new Error("Missing database.dump.");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.app !== "Founders Finance") {
  throw new Error("This is not a Founders Finance backup.");
}

console.log(`Backup verified: ${root}`);
