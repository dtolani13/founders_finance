import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const repositoryEnvironment = resolve(process.cwd(), "../../.env");
if (!process.env.DATABASE_URL && existsSync(repositoryEnvironment)) {
  process.loadEnvFile(repositoryEnvironment);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
