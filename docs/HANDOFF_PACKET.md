# Founders Finance Session Handoff

Updated: 2026-07-18

This is the operational handoff for the next development session. `docs/MASTER_TODO.md` remains the canonical priority and acceptance list.

## Product Purpose

Founders Finance is a private, single-owner financial operations workspace for keeping company and personal records separated and explainable. It tracks companies, expenses, allocations, intercompany balances, contributions, reimbursements, tax reserves, evidence metadata, statements, monthly close, exports, and encrypted backups.

The intended deployment is local-first with PostgreSQL. It is record-keeping software, not tax filing, payroll, invoicing, or legal advice.

## Current Checkpoint

- Branch: `main`
- Remote: `https://github.com/dtolani13/founders_finance.git`
- Workspace: `C:\AI_Projects\Founders-Finance\Founders-Finance`
- Expected local ports: web `5175`, API `8081`, PostgreSQL `55432`
- Database migration state: four applied, zero pending
- Migration schema fingerprint: `f9862f02354ae4723b504dc2601b986e57cf6e919498725c9cb43695bb5d31a4`

Do not enter irreplaceable receipt or statement files yet. Authentication, atomic ledger writes, migrations, and encrypted backup packaging are implemented, but the product still lacks a secure evidence upload/retrieval workflow and a completed retention policy.

## Completed This Checkpoint

- Added committed ordered Drizzle migrations under `lib/db/drizzle/`.
- Added migration generation, status, application, guarded baseline adoption, and disposable acceptance commands.
- Proved blank and copied-current databases converge without row loss; acceptance fingerprints columns, constraints, and indexes.
- Added database integrity constraints for lifecycle state, statuses, positive amounts, one-sided lines, allocation percentages, close periods, statement uniqueness, and reconciliation uniqueness.
- Added the missing monthly-close `correction_memo` field as a migration.
- Fixed backup/recovery PostgreSQL tool selection so a PostgreSQL 16 database does not accidentally use incompatible PostgreSQL 18 dump/restore binaries.
- Centralized transaction, expense, allocation, post, void, company lifecycle, owner contribution, settlement, reimbursement payment, reconciliation, and monthly-close mutations in transactional services.
- Blocked posted/voided edits and closed-period mutations across the centralized write paths.
- Added balanced linked journals for owner contributions, intercompany settlements, and reimbursement payments.
- Added duplicate-processing protection and in-transaction audit events.
- Added company lifecycle, rollback, reconciliation, settlement, close/reopen, and closed-period integration fixtures.
- Updated OpenAPI and generated clients for settlement payment dates; consecutive generation is deterministic.
- Replaced production schema-push instructions with migration procedures.

## Verification Baseline

- 18 of 18 authentication, backup, accounting, lifecycle, and period-control tests passed.
- Shared libraries, API, frontend, and scripts pass TypeScript verification.
- API production build passed.
- Frontend production build passed.
- Empty/copy migration acceptance passed with row counts preserved.
- The local database reports four applied migrations and zero pending.

Known build notices:

- Main frontend JavaScript chunk is 630.45 kB before gzip and needs route-level splitting.
- Vite reports sourcemap-location warnings for `tooltip.tsx`, `select.tsx`, and `label.tsx`.

## Start Here Next Session

Follow the required session protocol before editing:

1. Read `docs/MASTER_TODO.md` completely.
2. Run `git status --short --branch` and `git log -3 --oneline`.
3. Read this handoff completely.
4. Inspect the evidence schema, evidence API route, Evidence page, backup evidence packaging, and path-handling tests.
5. Reread the master TODO and verify that secure evidence storage remains the highest unblocked P0 item.
6. Begin the evidence work package below.

## Next Work Package: Secure Evidence Files

### Backend storage boundary

- Configure one evidence root outside the public web directory.
- Add multipart upload without loading unbounded files into memory.
- Allow only documented receipt/statement types and enforce a conservative size limit.
- Generate server-side storage names; never trust a client path or filename.
- Canonicalize every path and prove it remains inside the evidence root.
- Add authenticated download/preview with safe content type and disposition headers.
- Add atomic replacement and explicit missing-file responses.

### Data and retention behavior

- Keep evidence metadata and file writes consistent on failure.
- Prevent evidence linked to posted or closed-period records from silent deletion.
- Record upload, replacement, download-sensitive metadata changes, and retention actions in the audit trail.
- Document hard-delete versus archive behavior.

### Frontend workflow

- Add upload, attachment status, preview/download, replace, and missing-file recovery states to the Evidence workspace.
- Add clear progress, validation, failure, and retry behavior.
- Add confirmation for destructive replacement/removal actions.

### Acceptance fixtures

- Reject traversal filenames, disallowed types, oversized files, and unauthenticated requests.
- Prove a forced metadata/file failure leaves no orphan on either side.
- Upload representative receipt and statement fixtures, create an encrypted backup, restore to a clean database/evidence root, and compare bytes and metadata.
- Add browser workflow tests for upload, preview, replacement, and failure recovery.

## Remaining Queue After Evidence

1. Financial-data retention and dependency-aware deletion/deactivation policy.
2. Intercompany reversal and explicit settlement-account selection.
3. Reimbursement waive and convert-to-contribution flows.
4. Owner draw workflow.
5. Statement CSV import, preview, duplicate detection, and assisted matching.
6. Audit viewer and full mutation-coverage audit.
7. Transaction detail and controlled correction/reversal workflow.
8. Reference-data management with dependency warnings.
9. Accountant-grade export fixtures and archived-company reports.
10. Responsive navigation, accessibility, error recovery, route splitting, packaging, and final documentation reconciliation.

## Important Code Locations

- Migration SQL and snapshots: `lib/db/drizzle/`
- Migration tooling: `lib/db/src/migrations.ts`
- Accounting services: `artifacts/api-server/src/services/`
- Accounting integration tests: `artifacts/api-server/src/services/accounting.test.ts`
- Evidence schema: `lib/db/src/schema/documents.ts`
- Evidence route: `artifacts/api-server/src/routes/documents.ts`
- Evidence page: `artifacts/founders-finance/src/pages/Evidence.tsx`
- Backup engine: `lib/backup/src/index.ts`
- Migration procedure: `docs/DATABASE_MIGRATIONS.md`
- API contract: `lib/api-spec/openapi.yaml`

Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` must not be edited manually. Change OpenAPI first, regenerate, and verify deterministic output.

## Verification Commands

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build
pnpm run db:migrate:status
pnpm run db:migrate:acceptance
```

In the Codex Windows runtime, pnpm may pause for a dependency-status reinstall prompt. Set `CI=true` for installation and use local workspace binaries for verification if the wrapper still prompts.

## End-Of-Session Definition

1. Run relevant tests, typechecks, builds, acceptance drills, and repository-hygiene scans.
2. Update `docs/MASTER_TODO.md` statuses and add a session-log entry.
3. Update this handoff with the next exact starting point.
4. Reread the TODO and perform the required final repository pass.
5. Commit and push the aligned checkpoint; confirm the worktree is clean and synchronized.
