# Founders Finance Session Handoff

Updated: 2026-07-17

This is the short operational handoff for the next development session. The canonical priority and acceptance list remains `docs/MASTER_TODO.md`.

## Product Purpose

Founders Finance is a private, single-owner financial operations workspace for keeping company and personal records separated and explainable. It tracks entities, expenses, allocations, intercompany balances, contributions, reimbursements, tax reserves, evidence, statements, monthly close, exports, and encrypted backups.

The intended deployment is local-first with PostgreSQL. It is record-keeping software, not tax filing, payroll, invoicing, or legal advice.

## Current Checkpoint

- Branch: `main`
- Remote: `https://github.com/dtolani13/founders_finance.git`
- Checkpoint commit: the commit containing this handoff; confirm with `git log -1 --oneline`
- Workspace root: `C:\AI_Projects\Founders-Finance\Founders-Finance`
- Frontend: React 19, Vite, TypeScript, Tailwind CSS, React Query, wouter
- API: Express, TypeScript, Zod, pino
- Database: PostgreSQL through Drizzle ORM
- API contract: OpenAPI with generated React Query clients and Zod schemas
- Expected local ports: web `5175`, API `8081`, PostgreSQL `55432`

Do not enter irreplaceable financial data yet. Authentication and encrypted backups are implemented, but the accounting write path still needs atomicity, immutability, period enforcement, and broad regression tests.

## Completed And Verified

- Founders Finance naming, brand treatment, logo assets, and repository identity.
- Polymathic Systems LLC seed data and UI support for creating, editing, closing, archiving, and reopening companies.
- Professional owner setup/unlock screen and protected application entry.
- Scrypt-hashed owner credentials, hashed sessions, 12-hour expiry, secure cookies, persistent lockout, and logout/lock behavior.
- Auth protection on every finance API route except health and authentication endpoints.
- Canonical OpenAPI contract and generated-client alignment for authentication, companies, lifecycle operations, and backups.
- Persistent audit storage and audit-writing helper, with partial mutation coverage.
- Encrypted backup and restore control center covering the database and evidence directory.
- AES-256-GCM packages, scrypt-derived keys, payload fingerprints, automatic verification, clean-database recovery drill, guarded live restore, and pre-restore recovery points.
- Project files, tracked filenames, generated output, and Git history are clear of former hosted-builder platform artifacts.

Verification baseline on 2026-07-17:

- 6 of 6 authentication and backup tests passed.
- Library, API, frontend, and script TypeScript checks passed.
- API production build passed.
- Frontend production build passed.
- `git diff --check` reported no whitespace errors.
- Legacy product-name scan reported zero matches outside dependencies.

Known build notices:

- Main frontend JavaScript chunk is 630.45 kB before gzip and needs route-level splitting.
- Vite reports sourcemap-location warnings for `tooltip.tsx`, `select.tsx`, and `label.tsx`.

## Start Here Tomorrow

Follow this order before editing:

1. Read `docs/MASTER_TODO.md` completely.
2. Run `git status --short --branch` and `git log -3 --oneline`.
3. Verify the checkpoint commit and confirm the worktree is clean.
4. Read this handoff completely.
5. Recheck the database schema, transaction routes, expense routes, monthly-close routes, and existing tests against the P0 list.
6. Begin the migration and accounting-integrity work package below.

## First Work Package

The next checkpoint must combine migrations, accounting integrity, and deterministic tests. Do not build more surface features before this foundation is trustworthy.

### 1. Versioned migrations

- Generate and commit an ordered baseline from the current Drizzle schema.
- Include authentication and company lifecycle fields already present in the running database.
- Add root commands for migration generation, application, and status.
- Add startup guidance that uses migrations instead of `drizzle-kit push`.
- Prove both paths: empty database to current schema, and copied current database to current schema without data loss.

### 2. Central accounting service

- Move multi-record expense, allocation, posting, voiding, reconciliation, reimbursement, and intercompany writes out of route handlers into service functions.
- Wrap each operation in a Drizzle database transaction.
- Ensure a forced mid-operation failure leaves no transaction header, lines, allocations, links, or audit fragments behind.
- Write an audit event inside the same database transaction as each material finance mutation.

### 3. Ledger state protection

- Reject general edits, line replacement, and allocation replacement for posted or voided transactions.
- Require explicit correction or reversal workflows for posted history.
- Reject mutation of closed periods unless an explicit reopen/correction process has occurred.
- Apply the same period policy to transaction creation, editing, posting, voiding, allocation, reconciliation, reimbursement, and intercompany settlement.

### 4. Financial validation

- Validate that accounts belong to the specified entity and are active for new entries.
- Validate company lifecycle state before new transactions are accepted.
- Require valid debit/credit line shape and exact balancing before posting.
- Require allocation totals to equal the transaction total.
- Add idempotency protections to actions that can create settlement or reimbursement transactions.
- Add database constraints where they provide a dependable second line of defense.

### 5. Deterministic integration fixtures

At minimum, tests must cover:

- Successful manual expense creation.
- Allocation-total rejection.
- Balanced and unbalanced posting.
- Posted-entry immutability.
- Voiding and repeated-void rejection.
- Closed-period rejection and reopen behavior.
- Cross-company allocation and intercompany balance creation.
- Forced rollback after a simulated failure.
- Company close, archive, and reopen behavior.
- Audit entry creation for every tested material mutation.

## Remaining Production Queue

After the first work package:

1. Secure evidence upload, download, preview, replacement, path validation, type limits, and backup/restore survival.
2. Financial-record retention policy for statements, evidence, accounts, vendors, categories, and presets.
3. Intercompany settlement transactions with duplicate prevention and reversal history.
4. Reimbursement waive and convert-to-contribution actions.
5. Owner draw entry and accounting.
6. Statement CSV import, preview, mapping, duplicate detection, and assisted matching.
7. Complete audit viewer and mutation coverage.
8. Transaction detail and controlled correction workflow.
9. Reference-data management and dependency-aware deactivation.
10. Accountant-grade exports, archived-company reports, and deterministic export fixtures.
11. Responsive navigation, accessibility, error recovery, route splitting, packaging, and final documentation reconciliation.

## Important Code Locations

- Database client and schema: `lib/db/src/`
- Current schema-push configuration: `lib/db/drizzle.config.ts`
- Transaction routes: `artifacts/api-server/src/routes/transactions.ts`
- Manual expense and allocation routes: `artifacts/api-server/src/routes/expenses.ts`
- Monthly-close routes: `artifacts/api-server/src/routes/monthly_close.ts`
- Statement and reconciliation routes: `artifacts/api-server/src/routes/statements.ts`
- Company lifecycle routes: `artifacts/api-server/src/routes/entities.ts`
- Audit helper: `artifacts/api-server/src/lib/audit.ts`
- Existing tests: `artifacts/api-server/src/lib/auth.test.ts` and `lib/backup/src/index.test.ts`
- API contract: `lib/api-spec/openapi.yaml`
- Frontend routes: `artifacts/founders-finance/src/App.tsx`
- Canonical work list: `docs/MASTER_TODO.md`

Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` must not be edited manually. Change OpenAPI first, regenerate, and verify deterministic output.

## Verification Commands

Normal repository commands:

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build
```

In the Codex Windows runtime, pnpm may pause for a dependency-status reinstall prompt. When that happens, set `CI=true` for installation and run the underlying local binaries directly for verification rather than waiting on the wrapper.

After schema work, also run migration acceptance against a disposable empty database and a disposable copy of the current database. Never use the live database for destructive migration experiments.

## End-Of-Session Definition

Before stopping the next session:

1. Run all relevant tests, typechecks, builds, migration drills, and repository-hygiene scans.
2. Update `docs/MASTER_TODO.md` statuses and findings.
3. Update this handoff with the next exact starting point.
4. Reread the TODO and perform the required final repository pass.
5. Commit the aligned checkpoint and confirm the worktree is clean.
