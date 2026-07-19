import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "./schema";

const { Pool } = pg;

const repositoryEnv = resolve(import.meta.dirname, "../../../.env");
if (!process.env.DATABASE_URL && existsSync(repositoryEnv)) process.loadEnvFile(repositoryEnv);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
