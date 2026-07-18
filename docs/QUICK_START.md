# Quick Start — Founders Finance

> Get the app running from scratch in under 10 minutes.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | Check: `node --version` |
| pnpm | 9+ | Check: `pnpm --version`. Install: `npm i -g pnpm` |
| PostgreSQL | 15+ | Must be running and accessible via connection string |

---

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://username:password@localhost:5432/founders_finance

# Express session secret — generate a random string, keep it private
SESSION_SECRET=your-random-secret-here-minimum-32-characters

# set manually for local dev; set manually for local dev
PORT=3001
```

**For local dev:** `DATABASE_URL` and `SESSION_SECRET` are already provisioned as local environment variables. `PORT` is set automatically per-workflow. You do not need to create a `.env` file.

**For local development:** Create `.env` manually. Use `openssl rand -hex 32` to generate a secure `SESSION_SECRET`.

---

## Database Setup

### Create the database (local only — skip For local dev)

```bash
createdb founders_finance
```

Or using psql:

```sql
CREATE DATABASE founders_finance;
```

### Apply the schema

This applies the committed migration chain. Run it on first setup and whenever the repository adds a migration:

```bash
pnpm run db:migrate:status
pnpm run db:migrate
```

Do not use `drizzle-kit push` against a database containing financial data. See [Database Migrations](DATABASE_MIGRATIONS.md) for baseline adoption and the disposable-database acceptance drill.

---

## Install Dependencies

```bash
pnpm install
```

---

## Run the Backend (API Server)

```bash
pnpm --filter @workspace/api-server run dev
```

The API server starts on the port defined by `PORT` (default: set this manually for local dev).

Confirm it is running:

```bash
curl http://localhost:$PORT/api/healthz
# Expected: {"status":"ok"}
```

For local dev, use the shared proxy:

```bash
curl http://localhost:80/api/healthz
```

---

## Run the Frontend

```bash
pnpm --filter @workspace/founders-finance run dev
```

The frontend Vite dev server starts on a separate port (also assigned by `PORT` for that workflow).

For local dev, the preview pane will open automatically when both workflows are running.

---

## Regenerate API Client (after spec changes)

If `lib/api-spec/openapi.yaml` is changed, regenerate the TypeScript client and Zod schemas:

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Typecheck

```bash
pnpm run typecheck
```

This runs TypeScript verification across all workspace packages. Any error must be resolved before deploying.

---

## Production Build (frontend)

```bash
pnpm --filter @workspace/founders-finance run build
```

Output is in `artifacts/founders-finance/dist/`. The API server handles production serving if configured.

---

## For local dev — Workflows

Both services are managed by the local development scripts described above.

To restart manually:

| Service | Workflow name |
|---|---|
| API Server | `artifacts/api-server: API Server` |
| Frontend | `artifacts/founders-finance: web` |

---

## If the App Does Not Start

### API server fails immediately

Check that `DATABASE_URL` is set and the PostgreSQL instance is running:

```bash
echo $DATABASE_URL
pnpm --filter @workspace/api-server run dev 2>&1 | head -30
```

Common causes:
- `DATABASE_URL` not set → set it in `.env` or local environment variables
- PostgreSQL not running → start postgres service
- Database does not exist → run `createdb founders_finance`
- Migrations pending → run `pnpm run db:migrate:status`, then `pnpm run db:migrate`

### Frontend cannot reach the API

For local dev, the shared proxy routes `/api` to the API server and `/` to the frontend. If the API server is not running, all `/api` calls will return 502 or 503.

Check: Is the API server workflow running? Is `/api/healthz` responding?

```bash
curl http://localhost:80/api/healthz
```

If not: restart the API Server workflow.

### Frontend build fails

Run typecheck first to identify the actual error:

```bash
pnpm run typecheck
```

If generated files are out of date:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

### Database migration fails

If `pnpm run db:migrate` fails, preserve the first database error and run `pnpm run db:migrate:status`. Migrations are transactional, so a failed migration remains pending.

1. For a disposable development database, recreate it and run `pnpm run db:migrate`.
2. For financial data, do not drop or patch the database manually. Verify the pre-migration backup, correct the migration in source, and run `pnpm run db:migrate:acceptance` before retrying.

### Port already in use

On local development, if another process is using the same port:

```bash
lsof -i :3001
kill -9 <PID>
```

Then restart the server.
