# Founders Finance

Founders Finance is a private, local-first financial operations workspace for a single owner managing multiple companies and personal records. It keeps each company separate while tracking expenses, allocations, intercompany balances, owner contributions and draws, reimbursements, tax reserves, evidence, statements, monthly close, audit history, exports, and encrypted recovery packages.

## Release Status

The current build is approved for controlled personal use on the owner's local machine. Public hosting, multi-user access, and commercial SaaS deployment are intentionally outside this release.

Before repository work, follow the session protocol in [Master TODO](docs/MASTER_TODO.md) and [AGENTS.md](AGENTS.md).

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |
| UI | shadcn/ui and Radix UI |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL and Drizzle ORM |
| API contract | OpenAPI 3.0 with generated React Query and Zod clients |
| Workspace | pnpm monorepo |

## Quick Start

### Daily use on this machine

Open **Founders Finance** from the Desktop or Start Menu shortcut. The native launcher starts the local database, API, and verified production web application when needed, then opens Founders Finance in its own Microsoft Edge app window.

The launcher executable is `release/Founders Finance.exe`. The Start Menu shortcut can be right-clicked and pinned to the taskbar.

### Repository setup

Prerequisites are Node.js 20+, pnpm 9+, and PostgreSQL 15+ or an existing project-managed PostgreSQL data directory.

```powershell
pnpm install
Copy-Item .env.example .env
# Configure DATABASE_URL and SESSION_SECRET in .env
pnpm run db:migrate
pnpm run app:doctor
pnpm run app:start
```

Open [http://127.0.0.1:5175](http://127.0.0.1:5175).

```powershell
pnpm run app:status
pnpm run app:restart
pnpm run app:stop
```

`app:start` validates the environment, starts the project PostgreSQL instance when needed, checks migrations, builds verified production assets, starts the API and web app, and waits for both health checks.

See [Quick Start](docs/QUICK_START.md) for first-run and recovery details.

## Key Commands

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm run db:generate
pnpm run db:migrate:status
pnpm run db:migrate:acceptance
pnpm run backup:acceptance
pnpm --filter @workspace/api-spec run codegen
```

Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` must not be edited manually.

## Data Safety

- Every application route is protected by single-owner setup/unlock and a server-side session.
- Posted financial history is immutable; corrections use void, reversal, archive, deactivate, or audited reopen actions.
- Closed periods block ledger mutations until reopened with a correction memo.
- Evidence uses authenticated streaming, server-controlled paths, signature and size validation, SHA-256 integrity checks, retained replacements, and archive-only removal.
- Backups combine the database and evidence into AES-256-GCM encrypted `.ffbackup` packages with integrity verification and clean-database recovery drills.
- Backup packages must also be copied to a separate drive or cloud location. A copy on the same disk is not disaster recovery.

See [Backup and Restore](docs/BACKUP_AND_RESTORE.md) and [Data Safety Checklist](docs/DATA_SAFETY_CHECKLIST.md).

## Workspace Structure

```text
artifacts/
  api-server/          Express API
  founders-finance/    React application
lib/
  db/                  Schema and committed migrations
  backup/              Encrypted backup and recovery engine
  api-spec/            OpenAPI contract and code generation
  api-client-react/    Generated React Query client
  api-zod/             Generated validation schemas
scripts/               Local operations and acceptance tools
desktop/               Native Windows launcher source
release/               Loadable Founders Finance executable
docs/                  Owner, operator, and engineering guides
```

Companies are created and managed in Settings. New companies receive a default checking account and tax-reserve account. Polymathic Systems LLC can be created there if it is not already present in a particular database.

## Documentation

- [Owner Guide](docs/OWNER_GUIDE.md)
- [Printable Owner Guide](release/Founders%20Finance%20Owner%20Guide.pdf)
- [Operator Manual](docs/OPERATOR_MANUAL.md)
- [Quick Start](docs/QUICK_START.md)
- [Monthly Workflow](docs/MONTHLY_WORKFLOW.md)
- [Backup and Restore](docs/BACKUP_AND_RESTORE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Feature Status](docs/FEATURE_STATUS.md)
- [Known Limitations](docs/KNOWN_LIMITATIONS.md)
- [Session Handoff](docs/HANDOFF_PACKET.md)
- [Master TODO](docs/MASTER_TODO.md)
