# Quick Start - Founders Finance

This is the supported local-use startup procedure.

## Prerequisites

- Windows with Node.js 20 or newer
- pnpm 9 or newer
- PostgreSQL 15 or newer, including `pg_dump` and `pg_restore`
- The repository at `C:\AI_Projects\Founders-Finance\Founders-Finance`

The launcher can start the project-managed PostgreSQL data directory under `.local/pgdata` when it already exists. Otherwise, configure a reachable PostgreSQL database in `.env`.

## First-Time Setup

From the repository root:

```powershell
pnpm install
Copy-Item .env.example .env
```

Set at least these values in `.env`:

```dotenv
DATABASE_URL=postgresql://username:password@127.0.0.1:55432/founders_finance
SESSION_SECRET=replace-with-a-random-secret-at-least-32-characters
EVIDENCE_STORAGE_ROOT=./evidence
BACKUP_STORAGE_ROOT=./backups
```

Do not commit `.env`. The API and web ports are managed by the launcher and default to `8081` and `5175`.

Apply the committed migrations:

```powershell
pnpm run db:migrate
pnpm run db:migrate:status
```

Expected migration status: `pending` is `0`.

## Start Founders Finance

```powershell
pnpm run app:doctor
pnpm run app:start
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175).

On a new database, the first screen creates the owner passphrase. Keep that passphrase in a password manager. Existing databases show the unlock screen.

The launcher performs all of these checks before reporting ready:

1. Loads and validates the root `.env`.
2. Validates storage directories and port configuration.
3. Starts the project PostgreSQL instance when it owns `.local/pgdata` and the configured database is offline.
4. Confirms all committed migrations are applied.
5. Runs the production typecheck and build.
6. Starts the API and Vite production preview.
7. Waits for API and web health checks.

## Daily Commands

```powershell
pnpm run app:status
pnpm run app:restart
pnpm run app:stop
```

Runtime state and logs are under `.local/runtime/` and are excluded from Git.

## Backup Before Real Data

1. Open **Backup & Restore**.
2. Enter a unique backup passphrase of at least 12 characters.
3. Create a backup and run **Test restore**.
4. Download the `.ffbackup` package.
5. Copy it to a separate drive or a cloud folder.
6. Store the passphrase separately in a password manager.

The command-line acceptance drill is also available:

```powershell
pnpm run backup:acceptance
```

It creates a disposable encrypted package, verifies it, restores it into a clean temporary database, compares all table counts, and removes the temporary data.

## Safe Database Changes

```powershell
pnpm run db:migrate:status
pnpm run db:migrate:acceptance
pnpm run db:migrate
```

Never use `drizzle-kit push` against financial data. Never drop a database to resolve a production migration problem. Verify a backup, correct the migration in source, run disposable acceptance, and then retry.

## Development Commands

For source development only:

```powershell
pnpm run typecheck
pnpm test
pnpm run build
pnpm --filter @workspace/api-spec run codegen
pnpm run db:generate
```

Use the supported `app:*` commands for normal owner operation.

## If Startup Fails

```powershell
pnpm run app:doctor
pnpm run app:status
Get-Content .local/runtime/api.log -Tail 80
Get-Content .local/runtime/web.log -Tail 80
```

Common fixes:

- Correct `DATABASE_URL` or `SESSION_SECRET` in `.env`.
- Run `pnpm run db:migrate` if migrations are pending.
- Stop a conflicting process on ports `5175` or `8081`.
- Confirm the matching PostgreSQL client tools are installed.
- Run `pnpm run app:restart` after correcting the issue.

See [Troubleshooting](TROUBLESHOOTING.md) for detailed recovery procedures.
