import "./load-env";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pg from "pg";
import { repositoryRoot } from "./load-env";
import { getMigrationStatus } from "@workspace/db/migrations";

const { Client, Pool } = pg;
const command = process.argv[2] ?? "status";
const runtimeRoot = resolve(repositoryRoot, ".local", "runtime");
const statePath = join(runtimeRoot, "founders-finance.json");
const apiLogPath = join(runtimeRoot, "api.log");
const webLogPath = join(runtimeRoot, "web.log");
const databaseLogPath = resolve(repositoryRoot, ".local", "postgres.log");
const apiPort = Number(process.env.API_PORT ?? 8081);
const webPort = Number(process.env.WEB_PORT ?? 5175);

type RuntimeState = {
  version: 1;
  started_at: string;
  api_pid: number;
  web_pid: number;
  database_started_by_launcher: boolean;
  postgres_ctl: string | null;
  database_data_directory: string | null;
  api_url: string;
  web_url: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function requiredEnvironment(): { databaseUrl: string; sessionSecret: string } {
  const databaseUrl = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!databaseUrl) fail("DATABASE_URL is missing. Add it to the repository .env file.");
  if (!sessionSecret || sessionSecret.length < 32) {
    fail("SESSION_SECRET must contain at least 32 characters in the repository .env file.");
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (!parsed.protocol.startsWith("postgres")) fail("DATABASE_URL must use postgresql:// or postgres://.");
  if (!Number.isInteger(apiPort) || apiPort <= 0 || !Number.isInteger(webPort) || webPort <= 0 || apiPort === webPort) {
    fail("API_PORT and WEB_PORT must be distinct positive integers.");
  }
  return { databaseUrl, sessionSecret };
}

function readState(): RuntimeState | null {
  if (!existsSync(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as RuntimeState;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function endpointIsReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function databaseIsReady(databaseUrl: string): Promise<boolean> {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function postgresControlCandidates(preferredVersion?: string): string[] {
  const override = process.env.POSTGRES_BIN;
  const executable = process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl";
  const candidates = override ? [join(override, executable)] : [];
  if (process.platform === "win32") {
    const root = "C:\\Program Files\\PostgreSQL";
    if (existsSync(root)) {
      const versions = readdirSync(root).sort((a, b) => Number(b) - Number(a));
      if (preferredVersion && versions.includes(preferredVersion)) {
        versions.splice(versions.indexOf(preferredVersion), 1);
        versions.unshift(preferredVersion);
      }
      for (const version of versions) {
        candidates.push(join(root, version, "bin", executable));
      }
    }
  } else {
    candidates.push(executable);
  }
  return candidates;
}

function findPostgresControl(preferredVersion?: string): string | null {
  return postgresControlCandidates(preferredVersion).find((candidate) => candidate === "pg_ctl" || existsSync(candidate)) ?? null;
}

function runChecked(executable: string, args: string[], environment = process.env): void {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) fail(`${executable} exited with code ${result.status ?? "unknown"}.`);
}

function startManagedDatabase(databaseUrl: string): { started: boolean; pgCtl: string | null; dataDirectory: string | null } {
  const url = new URL(databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
    return { started: false, pgCtl: null, dataDirectory: null };
  }
  const dataDirectory = resolve(repositoryRoot, ".local", "pgdata");
  if (!existsSync(join(dataDirectory, "PG_VERSION"))) {
    return { started: false, pgCtl: null, dataDirectory: null };
  }
  const postgresVersion = readFileSync(join(dataDirectory, "PG_VERSION"), "utf8").trim();
  const pgCtl = findPostgresControl(postgresVersion);
  if (!pgCtl) fail("PostgreSQL is offline and pg_ctl could not be found. Set POSTGRES_BIN in .env.");
  const port = url.port || "5432";
  mkdirSync(resolve(repositoryRoot, ".local"), { recursive: true });
  runChecked(pgCtl, ["start", "-D", dataDirectory, "-o", `-p ${port}`, "-l", databaseLogPath, "-w", "-t", "20"]);
  return { started: true, pgCtl, dataDirectory };
}

async function ensureDatabase(databaseUrl: string) {
  if (await databaseIsReady(databaseUrl)) return { started: false, pgCtl: null, dataDirectory: null };
  const managed = startManagedDatabase(databaseUrl);
  if (!(await databaseIsReady(databaseUrl))) {
    fail("PostgreSQL is not reachable. Start it or configure DATABASE_URL before launching Founders Finance.");
  }
  return managed;
}

async function verifyMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const status = await getMigrationStatus(pool);
    if (status.pending > 0) {
      fail(`${status.pending} database migration(s) are pending. Run pnpm run db:migrate after creating a verified backup.`);
    }
    console.log(`Database ready: ${status.applied}/${status.total} migrations applied.`);
  } finally {
    await pool.end();
  }
}

function runPnpm(args: string[], environment: NodeJS.ProcessEnv): void {
  const invokingCli = process.env.npm_execpath;
  if (invokingCli?.toLowerCase().includes("pnpm") && existsSync(invokingCli)) {
    runChecked(process.execPath, [invokingCli, ...args], environment);
    return;
  }
  const windowsCli = process.env.APPDATA
    ? resolve(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")
    : "";
  if (process.platform === "win32" && existsSync(windowsCli)) {
    runChecked(process.execPath, [windowsCli, ...args], environment);
    return;
  }
  runChecked("pnpm", args, environment);
}

function startNodeProcess(entry: string, args: string[], cwd: string, logPath: string, env: NodeJS.ProcessEnv): ChildProcess {
  const output = openSync(logPath, "a");
  const child = spawn(process.execPath, [entry, ...args], {
    cwd,
    env,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", output, output],
  });
  child.unref();
  closeSync(output);
  return child;
}

async function waitForReady(url: string, label: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await endpointIsReady(url)) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  fail(`${label} did not become ready. Review logs under ${runtimeRoot}.`);
}

async function terminateProcess(pid: number): Promise<void> {
  if (!processIsAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && processIsAlive(pid)) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  if (processIsAlive(pid) && process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  }
}

async function stopManagedDatabase(state: RuntimeState): Promise<void> {
  if (!state.database_started_by_launcher || !state.postgres_ctl || !state.database_data_directory) return;
  if (!existsSync(state.database_data_directory)) return;
  const result = spawnSync(state.postgres_ctl, ["stop", "-D", state.database_data_directory, "-m", "fast", "-w", "-t", "20"], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0) console.warn("PostgreSQL did not stop cleanly; review the database log.");
}

async function start(): Promise<void> {
  const { databaseUrl } = requiredEnvironment();
  const existing = readState();
  if (existing && (processIsAlive(existing.api_pid) || processIsAlive(existing.web_pid))) {
    fail(`Founders Finance is already running at ${existing.web_url}.`);
  }
  await mkdir(runtimeRoot, { recursive: true });
  await rm(statePath, { force: true });
  const database = await ensureDatabase(databaseUrl);
  let api: ChildProcess | null = null;
  let web: ChildProcess | null = null;
  try {
    await verifyMigrations(databaseUrl);
    console.log("Building verified production assets...");
    runPnpm(["run", "build"], { ...process.env, NODE_ENV: "production", APP_ENV: "production" });

    const apiEntry = resolve(repositoryRoot, "artifacts", "api-server", "dist", "index.mjs");
    const viteEntry = resolve(repositoryRoot, "artifacts", "founders-finance", "node_modules", "vite", "bin", "vite.js");
    if (!existsSync(apiEntry) || !existsSync(viteEntry)) fail("Production build output is incomplete.");
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const webUrl = `http://127.0.0.1:${webPort}`;
    const commonEnv = { ...process.env, NODE_ENV: "production", APP_ENV: "production" };
    api = startNodeProcess(apiEntry, [], resolve(repositoryRoot, "artifacts", "api-server"), apiLogPath, {
      ...commonEnv,
      PORT: String(apiPort),
    });
    web = startNodeProcess(
      viteEntry,
      ["preview", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"],
      resolve(repositoryRoot, "artifacts", "founders-finance"),
      webLogPath,
      { ...commonEnv, PORT: String(webPort), API_URL: apiUrl },
    );
    if (!api.pid || !web.pid) fail("A service process did not return a process ID.");
    const state: RuntimeState = {
      version: 1,
      started_at: new Date().toISOString(),
      api_pid: api.pid,
      web_pid: web.pid,
      database_started_by_launcher: database.started,
      postgres_ctl: database.pgCtl,
      database_data_directory: database.dataDirectory,
      api_url: apiUrl,
      web_url: webUrl,
    };
    await writeFile(statePath, JSON.stringify(state, null, 2));
    await waitForReady(`${apiUrl}/api/healthz`, "API");
    await waitForReady(webUrl, "Web application");
    console.log(`Founders Finance is ready: ${webUrl}`);
    console.log(`Status: pnpm run app:status | Stop: pnpm run app:stop`);
  } catch (error) {
    const state = readState();
    if (state) {
      await terminateProcess(state.web_pid);
      await terminateProcess(state.api_pid);
      await rm(statePath, { force: true });
    } else {
      if (web?.pid) await terminateProcess(web.pid);
      if (api?.pid) await terminateProcess(api.pid);
    }
    if (database.started && database.pgCtl && database.dataDirectory) {
      await stopManagedDatabase({
        version: 1,
        started_at: new Date().toISOString(),
        api_pid: 0,
        web_pid: 0,
        database_started_by_launcher: true,
        postgres_ctl: database.pgCtl,
        database_data_directory: database.dataDirectory,
        api_url: "",
        web_url: "",
      });
    }
    throw error;
  }
}

async function stop(): Promise<void> {
  const state = readState();
  if (!state) {
    console.log("Founders Finance is already stopped.");
    return;
  }
  await terminateProcess(state.web_pid);
  await terminateProcess(state.api_pid);
  await stopManagedDatabase(state);
  await rm(statePath, { force: true });
  console.log("Founders Finance stopped cleanly.");
}

async function status(): Promise<void> {
  const { databaseUrl } = requiredEnvironment();
  const state = readState();
  const databaseReady = await databaseIsReady(databaseUrl);
  const apiReady = state ? await endpointIsReady(`${state.api_url}/api/healthz`) : false;
  const webReady = state ? await endpointIsReady(state.web_url) : false;
  const result = {
    status: apiReady && webReady && databaseReady ? "ready" : "stopped",
    web_url: state?.web_url ?? `http://127.0.0.1:${webPort}`,
    database: databaseReady ? "ready" : "stopped",
    api: apiReady ? "ready" : "stopped",
    web: webReady ? "ready" : "stopped",
    started_at: state?.started_at ?? null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ready") process.exitCode = 1;
}

async function doctor(): Promise<void> {
  const { databaseUrl } = requiredEnvironment();
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) fail(`Node.js 20 or newer is required; found ${process.version}.`);
  for (const path of [
    resolve(repositoryRoot, process.env.EVIDENCE_STORAGE_ROOT ?? "evidence"),
    resolve(repositoryRoot, process.env.BACKUP_STORAGE_ROOT ?? process.env.BACKUP_ROOT ?? "backups"),
    runtimeRoot,
  ]) {
    mkdirSync(path, { recursive: true });
    const probe = join(path, `.write-test-${process.pid}`);
    writeFileSync(probe, "ok");
    rmSync(probe, { force: true });
  }
  const database = await ensureDatabase(databaseUrl);
  try {
    await verifyMigrations(databaseUrl);
    console.log("Operational readiness check passed.");
  } finally {
    if (database.started && database.pgCtl && database.dataDirectory) {
      await stopManagedDatabase({
        version: 1,
        started_at: new Date().toISOString(),
        api_pid: 0,
        web_pid: 0,
        database_started_by_launcher: true,
        postgres_ctl: database.pgCtl,
        database_data_directory: database.dataDirectory,
        api_url: "",
        web_url: "",
      });
    }
  }
}

try {
  if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "restart") {
    await stop();
    await start();
  } else if (command === "status") await status();
  else if (command === "doctor") await doctor();
  else fail(`Unknown command "${command}". Use start, stop, restart, status, or doctor.`);
} catch (error) {
  console.error(`Founders Finance: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
