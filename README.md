# Founders Finance

A private internal tool for tracking finances across founder-controlled companies and the Personal / Founder record, built for a solo founder managing multiple entities.

## Project Work Protocol

Before starting repository work, read [Master TODO](docs/MASTER_TODO.md) and follow the mandatory double-read/double-pass session protocol in [AGENTS.md](AGENTS.md). The master TODO is the canonical source for priority and completion status.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| UI Components | shadcn/ui + Radix UI primitives |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| API Contract | OpenAPI 3.0 + Orval codegen (React Query hooks + Zod schemas) |
| Monorepo | pnpm workspaces |

## Monorepo Structure

```
artifacts/
  api-server/       — Express REST API, binds to $PORT
  founders-finance/   — React + Vite SPA, binds to $PORT
lib/
  db/               — Drizzle ORM schema, migration via drizzle-kit push
  api-spec/         — OpenAPI 3.0 spec + Orval codegen config
  api-client-react/ — Generated React Query hooks (do not edit manually)
  api-zod/          — Generated Zod validation schemas (do not edit manually)
scripts/            — Shared utility scripts
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+ (Use a local PostgreSQL database and set `DATABASE_URL`)

## First-Time Setup

```bash
# Install all workspace dependencies
pnpm install

# Push the full schema to the database (creates all tables)
pnpm --filter @workspace/db run push
```

## Running Locally (developer tools)

Both services are managed by local dev scripts and start automatically. To restart manually:

- **API Server**: restart the `artifacts/api-server: API Server` workflow
- **Frontend**: restart the `artifacts/founders-finance: web` workflow

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session signing secret |
| `PORT` | Set by developer tools | HTTP port each service binds to (unique per artifact) |

## Key Commands

```bash
# Typecheck all packages
pnpm run typecheck

# Regenerate API client from the OpenAPI spec (run after editing openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Push schema changes to the database (no migration files — uses drizzle-kit push)
pnpm --filter @workspace/db run push
```

## Entities

| Entity | Short Code | Color |
|---|---|---|
| Studio Maestro LLC | SM | `#7C3AED` (violet) |
| Recursive Chaos Labs LLC | RCL | `#111827` (near-black) |
| Personal / Founder | PERSONAL | `#6B7280` (gray) |

## Notes

- **Personal allocations are non-deductible.** The UI warns when any expense allocation targets the PERSONAL entity.
- **Closed periods require a correction memo to reopen.** This creates an audit trail.
- **API client is fully generated.** Never edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/` by hand — run `codegen` instead.
- **Drizzle `inArray` rule.** Always use `inArray(col, array)` from `drizzle-orm`, never `sql\`col = ANY(...)\``.

## Security & Data Safety

This is a private single-user financial tool. The following controls are in place:

| Area | Control |
|---|---|
| Secrets | `SESSION_SECRET` and `DATABASE_URL` loaded from environment only — never hardcoded |
| Git hygiene | `.env`, `evidence/`, `db-dumps/`, `*.dump` are all excluded via `.gitignore` |
| Transaction deletes | Soft-delete only — `DELETE /transactions/:id` voids the record (`status="voided"`), never destroys data |
| Posted transactions | Cannot be voided without an explicit `/void` call; 409 returned on attempt |
| Statement deletes | Blocked with 409 if any matched lines exist — reconciliation work is protected |
| Closed period edits | Require a `correction_memo` — API returns 409 without one |
| File path inputs | Sanitized on write — `../` path traversal sequences are stripped from `file_path` fields |
| Personal expenses | UI warns on every PERSONAL entity allocation (non-deductible flag) |

For backup procedures, see [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md).  
For a monthly safety checklist, see [docs/DATA_SAFETY_CHECKLIST.md](docs/DATA_SAFETY_CHECKLIST.md).  
For known limitations, see [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

## Documentation

| Document | Purpose |
|---|---|
| [Operator Manual](docs/OPERATOR_MANUAL.md) | Complete operating reference — what everything is, how it works, normal use flow, and the canonical verification test |
| [Handoff Packet](docs/HANDOFF_PACKET.md) | Technical overview for a developer or agent picking this up — architecture, folder structure, design decisions, and verification checklist |
| [Quick Start](docs/QUICK_START.md) | Exact commands to install, configure, and run the app from scratch |
| [Monthly Workflow](docs/MONTHLY_WORKFLOW.md) | Step-by-step monthly operating checklist — from gathering receipts to closing the period and exporting |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems, likely causes, and safe fixes |
| [Feature Status](docs/FEATURE_STATUS.md) | Full feature matrix — what is complete, partial, or not started; risk levels and next actions |
| [Next Build Steps](docs/NEXT_BUILD_STEPS.md) | Recommended development sequence and the suggested next prompt for continuing work |
| [Master TODO](docs/MASTER_TODO.md) | Canonical prioritized work list, verification evidence, and session handoff log |

## Further Reading

- [Build Framework](docs/BUILD_FRAMEWORK.md) — architectural decisions, layers, and conventions
- [Data Model](docs/DATA_MODEL.md) — all database tables and their purpose
- [Backup and Restore](docs/BACKUP_AND_RESTORE.md) — pg_dump, evidence backups, restore procedures
- [Data Safety Checklist](docs/DATA_SAFETY_CHECKLIST.md) — monthly close checklist, integrity rules
- [Known Limitations](docs/KNOWN_LIMITATIONS.md) — accepted trade-offs and missing features
