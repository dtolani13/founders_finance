import { spawnSync } from "node:child_process";

const targetUrl = process.env.RESTORE_DATABASE_URL;
const dumpPath = process.argv[2];

if (!targetUrl || !dumpPath) {
  throw new Error("Usage: RESTORE_DATABASE_URL=postgres://... pnpm run verify-restore -- <database.dump>");
}

const result = spawnSync("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", targetUrl, dumpPath], {
  stdio: "inherit",
});

if (result.status !== 0) {
  throw new Error("Restore verification failed.");
}

console.log("Restore verification completed.");
