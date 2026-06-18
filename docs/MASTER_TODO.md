# Founders Finance Master TODO

This is the canonical source of truth for repository priority, completion status, verification evidence, and session handoff.

Last repository alignment review: **2026-06-18**

## Status Key

- `[x]` Complete and verified
- `[~]` Partially implemented or incompletely verified
- `[ ]` Not started or materially incomplete
- `[!]` Blocked by an external dependency or user decision

## Required Session Protocol

At the beginning of every session:

1. Read this file completely.
2. Perform a repository pass.
3. Read this file again.
4. Perform a second codebase pass to verify implementation and documentation align with this list.
5. Work from the highest-priority unblocked item unless the user explicitly changes direction.

At the end of every session:

1. Run verification appropriate to the work.
2. Update statuses and findings here.
3. Add a session-log entry.
4. Read this file again.
5. Perform a final repository pass and resolve or record any drift.

Full operating rules are in `AGENTS.md`.

## P0 - Data Protection And Production Readiness

- [ ] **Authentication and protected application entry**
  - Add a professional landing/unlock page before the finance workspace.
  - Add single-owner credential setup, secure password hashing, login, logout, and session expiry.
  - Use secure, HTTP-only, same-site cookies and protect every non-health API route.
  - Add brute-force protection and redact authentication data from logs.
  - Acceptance: unauthenticated browser and API requests cannot access financial data; login/logout/session-expiry tests pass.

- [ ] **Backup and restore control center**
  - Existing CLI backup and verification scripts are useful but have no in-app workflow.
  - Add visible backup status, last successful backup, destination, verification result, and restore workflow.
  - Add encrypted backup packaging for database plus evidence files.
  - Add restore confirmation, pre-restore backup, and post-restore integrity report.
  - Acceptance: a backup can be created, verified, restored into a clean database, and compared by table/file counts.

- [ ] **Versioned database migrations**
  - Replace production reliance on `drizzle-kit push` with committed, ordered migration files.
  - Add migration status and startup/deployment guidance.
  - Include current entity lifecycle columns in the migration baseline.
  - Acceptance: an empty database and a copy of the current database both reach the same schema through migrations without data loss.

- [ ] **Automated accounting and lifecycle test suite**
  - Add integration tests for expense creation, allocation totals, double-entry balancing, posting, voiding, closed-period guards, intercompany creation, company close/archive/reopen, and audit logging.
  - Add frontend workflow tests for critical forms and destructive confirmations.
  - Acceptance: tests run from one documented root command and fail on known integrity regressions.

- [ ] **Evidence file storage and retrieval**
  - Add secure upload, download, content-type handling, filename/path sanitization, size limits, and allowed-type validation.
  - Store evidence outside the public web root and include it in verified backups.
  - Add UI upload, attachment state, preview/download, replacement, and missing-file handling.
  - Acceptance: receipt and statement files survive backup/restore and cannot escape the configured evidence root.

- [~] **API contract and generated-client alignment**
  - OpenAPI, server routes, generated clients, generated Zod schemas, and manual extensions currently overlap.
  - Entity creation and lifecycle operations must be represented in OpenAPI.
  - Remove manual generated-file edits and regenerate clients from the canonical contract.
  - Acceptance: code generation completes cleanly and leaves a clean git diff; frontend and server typecheck against regenerated artifacts.

- [~] **Financial-data deletion policy**
  - Transactions use void/soft-delete behavior and companies use close/archive lifecycle behavior.
  - Audit every remaining DELETE route and document whether it is guarded, soft, or intentionally hard.
  - Add explicit retention behavior for statements, evidence metadata, accounts, vendors, categories, and presets.
  - Acceptance: no user-facing action can silently destroy posted financial history or linked evidence.

## P1 - Core Workflow Completion

- [~] **Company lifecycle management**
  - Add, edit, close, archive, retention date/reason, and reopen are implemented.
  - Add automated tests, account-balance closure warnings, open-obligation warnings, and archived-company export/reporting.
  - Decide whether archived account reactivation should restore all accounts or only accounts active before closure.
  - Acceptance: lifecycle tests cover open balances, statements, evidence, tax rules, and account-state restoration.

- [~] **Persistent audit trail and audit viewer**
  - Audit table, writer helper, and API route exist.
  - Add a read-only UI with entity/table/action/date filters and before/after inspection.
  - Ensure every material mutation writes an audit event.
  - Acceptance: mutation coverage audit identifies no critical unlogged financial operation.

- [ ] **Intercompany settlement accounting**
  - Marking an intercompany balance paid should create and link a balanced settlement transaction.
  - Prevent duplicate settlement and preserve reversal history.
  - Acceptance: both entities' ledger impact and the intercompany link reconcile to zero.

- [ ] **Reimbursement completion actions**
  - Add waive and convert-to-contribution flows with confirmation, transaction linkage, and audit entries.
  - Acceptance: paid, waived, and converted states produce traceable accounting outcomes.

- [ ] **Owner draw workflow**
  - Add owner draw entry, validation, transaction generation, display, and export support.
  - Acceptance: draw appears in ledger, entity cash, owner equity reporting, and exports.

- [ ] **Statement import and assisted reconciliation**
  - Add CSV import with preview, column mapping, duplicate detection, and rollback on invalid rows.
  - Add amount/date candidate matching requiring user confirmation.
  - Acceptance: imported lines reconcile without silent auto-approval or duplicate insertion.

- [~] **Export correctness and accountant handoff**
  - Verify every export type with deterministic fixtures.
  - Confirm entity, period, status, source IDs, and audit-relevant fields are present.
  - Add archived-company and retention reports.
  - Acceptance: export fixture tests validate columns, row counts, filters, and totals.

- [ ] **Account, category, vendor, and preset management**
  - Add create/edit/deactivate/archive flows with dependency warnings.
  - Prevent deactivation from breaking historical display or reconciliation.
  - Acceptance: inactive reference data remains resolvable on historical records.

- [ ] **Transaction detail and correction workflow**
  - Add a complete transaction detail view with lines, allocations, evidence, audit history, posting state, balance state, and permitted corrections.
  - Acceptance: users can explain every posted transaction from one screen without exposing unsafe direct edits.

## P2 - Professional Product Quality

- [~] **Responsive shell and visual polish**
  - Brand palette and emblem are implemented, but narrow viewport behavior and all pages need systematic browser verification.
  - Add responsive navigation rather than relying on a fixed 326px sidebar.
  - Verify no clipping, overflow, overlap, inaccessible contrast, or inconsistent action hierarchy.
  - Acceptance: screenshot checks pass at representative desktop, laptop, tablet, and mobile widths.

- [ ] **Accessibility and keyboard operation**
  - Audit headings, labels, focus order, dialogs, tables, color-only status, and keyboard navigation.
  - Acceptance: automated accessibility scan plus manual keyboard pass on critical workflows.

- [ ] **Performance and bundle splitting**
  - Current production build warns that the main JavaScript chunk exceeds 500 kB.
  - Add route-level lazy loading and verify loading/error states.
  - Acceptance: no unexplained oversized main chunk and no regression in startup behavior.

- [ ] **Operational packaging and startup reliability**
  - Add a supported local production run method, environment validation, database readiness check, and clear service lifecycle commands.
  - Consider Docker Compose only if it improves backup and operational reliability.
  - Acceptance: a clean machine can start the app using documented steps without hidden local state.

- [~] **Documentation reconciliation**
  - README and several docs contain stale three-entity, no-audit, no-backup-script, no-company-create, and deferred-auth claims.
  - Reconcile `README.md`, `FEATURE_STATUS.md`, `NEXT_BUILD_STEPS.md`, `KNOWN_LIMITATIONS.md`, `DATA_MODEL.md`, `HANDOFF_PACKET.md`, and backup docs with actual code.
  - Remove stale platform-specific language and old database naming from `.env.example`.
  - Acceptance: documentation search finds no claims contradicted by source or schema.

- [ ] **Error handling and recovery UX**
  - Add consistent page-level loading, retry, actionable error details, offline/API-down states, and safe mutation retry behavior.
  - Acceptance: API/database outage tests do not leave ambiguous or falsely successful UI states.

## P3 - Future Enhancements

- [ ] Receipt OCR with mandatory user review.
- [ ] Optional bank import adapters after manual statement import is stable.
- [ ] Scheduled backup and close reminders.
- [ ] Accountant read-only package or controlled export bundle.
- [ ] Optional local encryption-at-rest design after backup, auth, and key-recovery requirements are defined.

## Verified Complete Foundations

- [x] Founders Finance naming and GitHub repository established.
- [x] React/Vite frontend, Express API, PostgreSQL, Drizzle, OpenAPI, and pnpm workspace build successfully.
- [x] Core dashboard, transactions, expense entry, allocations, intercompany visibility, contributions, reimbursements, tax reserve, evidence metadata, statements, monthly close, exports, and settings pages exist.
- [x] Polymathic Systems LLC is included in seed data.
- [x] Company creation creates default checking and tax reserve accounts.
- [x] Company close/archive/reopen preserves company records and deactivates/reactivates accounts.
- [x] Backup, backup verification, and restore verification CLI scripts exist.
- [x] Persistent audit table and audit write helper exist.
- [x] Health endpoints respond at `/api/health` and `/api/healthz`.
- [x] Typecheck and production build passed during the 2026-06-18 alignment review.

## Current Alignment Findings

Verified against the repository on 2026-06-18:

- No automated test files or test runner command are present.
- No login page, authentication routes, password verification, protected-route middleware, or session implementation is present.
- No evidence multipart upload or file-serving endpoint is present.
- Database changes use schema push; committed migrations are absent.
- Backup and verification scripts exist, but there is no in-app backup/restore UI.
- Audit persistence exists, but there is no audit viewer route in the frontend navigation.
- Company lifecycle code exists; dedicated automated coverage and closure warnings are absent.
- The API contract and generated clients are not fully canonical because manual extensions and direct generated schema edits exist.
- The frontend build succeeds with a main-chunk size warning.
- The frontend build reports sourcemap resolution warnings for `tooltip.tsx`, `select.tsx`, and `label.tsx`; these do not fail the build but require cleanup during the product-quality pass.
- Documentation contains stale implementation and entity-count claims.

## Session Log

### 2026-06-18 - Master TODO and alignment protocol

- Completed: repository-wide implementation/documentation pass; created canonical priority list; added mandatory start/end double-pass protocol.
- Verification: inspected repository tree, git state, routes, schema, API/client structure, scripts, feature docs, auth evidence, test evidence, uploads, migrations, delete routes, and stale naming/claims; `pnpm run typecheck` and `pnpm run build` passed. Build warnings for the oversized main chunk and three UI sourcemaps remain recorded above.
- Unresolved: all open items above, beginning with authentication and protected application entry.
- Next action: implement P0 authentication and protected landing/unlock flow, including API protection and automated tests.
