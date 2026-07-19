import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const repositoryRoot = resolve(import.meta.dirname, "../..");

export function loadRepositoryEnvironment(): void {
  const envPath = resolve(repositoryRoot, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

loadRepositoryEnvironment();
