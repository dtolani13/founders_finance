# Founders Finance Session Handoff

Updated: 2026-07-18

`docs/MASTER_TODO.md` is the canonical priority and acceptance list. This packet records the current operational checkpoint.

## Product Purpose

Founders Finance is a private, local-first, single-owner financial operations workspace. It keeps company and personal records separated while providing traceable expenses, allocations, intercompany balances, owner equity, reimbursements, tax reserves, evidence, statement reconciliation, monthly close, exports, and encrypted recovery packages.

It is record-keeping software, not tax filing, payroll, invoicing, or legal advice.

## Current Checkpoint

- Branch: `main`
- Remote: `https://github.com/dtolani13/founders_finance.git`
- Workspace: `C:\AI_Projects\Founders-Finance\Founders-Finance`
- Local ports: web `5175`, API `8081`, PostgreSQL `55432`
- Database migrations: seven applied, zero pending
- Migration fingerprint: `24ec6fc2f1c7c7d3846b6fe521b5c604cd85977dc15573bc0052bb395ea44b29`

The app is suitable for controlled local use after the owner unlocks it and confirms a verified backup destination. Statement lines can be entered manually. Bulk statement CSV import is the largest remaining daily-use gap.

## Completed In This Checkpoint

- Secure evidence upload, authenticated preview/download, signature/type/size checks, checksums, atomic replacement, archive retention, integrity verification, and encrypted backup/restore coverage.
- Statement archival and inactive reference-data retention without destroying historical records.
- Owner draw entry with balanced posted cash/equity journals, history, audit, and export.
- Reimbursement paid, waived, and converted-to-contribution accounting outcomes.
- Read-only audit viewer with table, action, record, and date filters plus before/after inspection.
- Transaction detail with journal lines, allocations, evidence, audit history, balance/posting state, and controlled voiding.
- Company closure assessment for balances, obligations, unreconciled statements, and evidence issues.
- Account, category, vendor, and allocation-preset create/edit/deactivate/reactivate management.
- Owner-draw and company-retention exports.
- Responsive desktop/mobile navigation and route-level bundle splitting.

## Verification Baseline

- 25 authentication, backup, evidence, accounting, lifecycle, and period-control tests pass.
- Shared libraries, API, frontend, and scripts pass TypeScript verification.
- API and frontend production builds pass.
- Empty/current-copy migration acceptance converges without row loss.
- Seven migrations are applied locally and none are pending.
- The main frontend chunk is 362.30 kB; the prior oversized-chunk warning is gone.

Vite still reports four non-blocking sourcemap-location warnings from generated UI components.

## Start Here Next Session

1. Follow the required double-read/double-pass protocol in `docs/MASTER_TODO.md`.
2. Confirm `git status --short --branch`, `git log -3 --oneline`, migration status, and the test baseline.
3. Inspect `routes/statements.ts`, `pages/Statements.tsx`, and the statement schemas.
4. Implement statement CSV import as the next work package.

## Next Work Package: Statement CSV Import

- Add a proven CSV parser dependency without changing the workspace virtual-store layout.
- Upload CSV to a bounded authenticated endpoint and parse quoted fields correctly.
- Provide preview and explicit column mapping for date, description, amount/debit/credit, and optional running balance.
- Detect duplicates against the statement and within the uploaded file.
- Validate every row before a transactional insert; invalid input must not partially import.
- Suggest amount/date transaction candidates but require owner confirmation before matching.
- Add API, accounting, and UI workflow tests for mapping, duplicates, rollback, and confirmation.

## Remaining Queue

1. Intercompany reversal and settlement-account selection.
2. Deterministic export fixtures and accountant-handoff validation.
3. Frontend tests for critical forms and destructive confirmations.
4. Automated accessibility scan and manual keyboard pass.
5. Supported local production startup/package procedure with readiness checks.
6. Consistent API-down/offline/retry UX.
7. Final mutation audit and reference-data dependency warnings.
8. Authenticated desktop/tablet/mobile screenshot pass after the owner unlocks the browser.

## Important Code Locations

- Migrations: `lib/db/drizzle/`
- Accounting services and tests: `artifacts/api-server/src/services/`
- Evidence storage: `artifacts/api-server/src/services/evidence-storage.ts`
- API routes: `artifacts/api-server/src/routes/`
- Frontend pages: `artifacts/founders-finance/src/pages/`
- Backup engine: `lib/backup/src/index.ts`
- API contract: `lib/api-spec/openapi.yaml`

Generated files under `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` must not be edited manually. Update OpenAPI, regenerate, and verify the second generation produces no diff.

## Verification Commands

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm run db:migrate:status
pnpm run db:migrate:acceptance
pnpm --filter @workspace/api-spec run codegen
git diff --check
```

## End-Of-Session Definition

1. Run the relevant tests, typechecks, builds, migration drills, and repository-hygiene scans.
2. Update the master TODO and this handoff.
3. Perform the required final TODO/repository alignment pass.
4. Commit and push the aligned checkpoint.
5. Confirm the worktree is clean and synchronized.
