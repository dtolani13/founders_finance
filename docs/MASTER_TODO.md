# Founders Finance Master TODO

This is the canonical source of truth for repository priority, completion status, verification evidence, and session handoff.

Last repository alignment review: **2026-07-17**

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

- [x] **Authentication and protected application entry**
  - Professional first-run setup/unlock screen is implemented before the finance workspace.
  - Single-owner credentials use scrypt hashing; random session tokens are stored only as hashes and expire after 12 hours.
  - Secure, HTTP-only, same-site cookies protect every non-health, non-auth API route.
  - Persistent failed-attempt tracking locks access for 15 minutes after five failures; auth-sensitive request data is redacted from logs.
  - Verified: unauthenticated live API requests receive `401`; setup/login/logout/session-expiry/lockout tests pass; desktop and mobile browser checks report no console errors.

- [x] **Backup and restore control center**
  - In-app workspace shows destination, latest success, verification, clean-database recovery-drill status, contents, and history.
  - Database plus evidence packages use AES-256-GCM, scrypt-derived keys, authenticated headers, SHA-256 payload fingerprints, and archive-path validation.
  - New packages are automatically decrypted and verified; live restore requires an exact confirmation phrase, creates an encrypted pre-restore backup, and checks database rows plus final evidence fingerprints.
  - Verified: a real local package containing all 24 public tables plus a synthetic evidence fixture was created, verified, restored into an isolated clean database, compared successfully, and removed after the drill.

- [ ] **Versioned database migrations**
  - Replace production reliance on `drizzle-kit push` with committed, ordered migration files.
  - Add migration status and startup/deployment guidance.
  - Include current entity lifecycle columns in the migration baseline.
  - Acceptance: an empty database and a copy of the current database both reach the same schema through migrations without data loss.

- [ ] **Atomic accounting integrity and period enforcement**
  - Move multi-record finance operations into centralized service functions wrapped in database transactions.
  - Prevent general update, line-replacement, and allocation endpoints from changing posted or voided transactions.
  - Enforce closed-period guards on transaction creation, editing, posting, voiding, allocation, reconciliation, and settlement operations.
  - Validate account ownership, entity state, debit/credit shape, allocation totals, and idempotency before writes begin.
  - Add database constraints where they provide a reliable second line of defense without blocking valid accounting corrections.
  - Acceptance: forced failures leave no partial records; posted history is immutable; closed months reject unauthorized mutations; every generated journal remains balanced and traceable.

- [~] **Automated accounting and lifecycle test suite**
  - A root `pnpm test` command and initial authentication/security boundary suite now exist.
  - Add integration tests for expense creation, allocation totals, double-entry balancing, posting, voiding, closed-period guards, intercompany creation, company close/archive/reopen, and audit logging.
  - Add frontend workflow tests for critical forms and destructive confirmations.
  - Acceptance: tests run from one documented root command and fail on known integrity regressions.

- [ ] **Evidence file storage and retrieval**
  - Add secure upload, download, content-type handling, filename/path sanitization, size limits, and allowed-type validation.
  - Store evidence outside the public web root and include it in verified backups.
  - Add UI upload, attachment state, preview/download, replacement, and missing-file handling.
  - Acceptance: receipt and statement files survive backup/restore and cannot escape the configured evidence root.

- [x] **API contract and generated-client alignment**
  - Authentication, entity creation, and entity lifecycle operations are represented in the canonical OpenAPI contract.
  - Removed the overlapping manual entity client and regenerated React Query clients and Zod schemas.
  - Verified: consecutive code-generation runs produced identical hashes and frontend/server typechecks pass against regenerated artifacts.

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
  - Reconcile `README.md`, `FEATURE_STATUS.md`, `NEXT_BUILD_STEPS.md`, `KNOWN_LIMITATIONS.md`, `DATA_MODEL.md`, and backup docs with actual code. `HANDOFF_PACKET.md` is current as of the latest checkpoint.
  - Old database naming is removed from `.env.example`, quick-start, troubleshooting, and monthly-workflow documentation.
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
- [x] Shared encrypted backup engine, in-app control center, CLI verification, and clean-database recovery drill exist.
- [x] Persistent audit table and audit write helper exist.
- [x] Health endpoints respond at `/api/health` and `/api/healthz`.
- [x] Single-owner setup, unlock, logout, session expiry, persistent lockout, and protected API entry are implemented.
- [x] OpenAPI code generation is deterministic and no manual entity client overlaps generated operations.
- [x] Typecheck and production build passed during the 2026-06-18 alignment review.

## Current Alignment Findings

Verified against the repository on 2026-07-17:

- Authentication tests and a root test command exist; broad accounting, company lifecycle, and frontend workflow coverage is still absent.
- Only two test files exist, covering owner authentication and encrypted backup primitives; no ledger workflow or browser workflow tests exist.
- Authentication is implemented, owner access is configured locally, and live finance endpoints reject unauthenticated requests.
- No evidence multipart upload or file-serving endpoint is present.
- Database changes use schema push; committed migrations are absent.
- Multi-record expense, allocation, statement, and settlement writes do not use database transactions, so partial records are possible after a mid-operation failure.
- Posted transactions can still be changed through general transaction, line-replacement, and allocation endpoints; monthly close state is not enforced by ledger mutation routes.
- Core transaction and allocation tables lack several useful database-level integrity constraints, leaving important correctness rules entirely in route code.
- Encrypted database-plus-evidence backup, automatic verification, recovery drills, download, and guarded live restore are implemented in the app and CLI.
- Audit persistence exists, but there is no audit viewer route in the frontend navigation.
- Audit writing currently covers company/entity lifecycle operations, but not every material financial mutation.
- Company lifecycle code exists; dedicated automated coverage and closure warnings are absent.
- The API contract and generated clients are aligned; deterministic regeneration was verified after removing manual entity-client overlap.
- The frontend build succeeds with a main-chunk size warning.
- The frontend build reports sourcemap resolution warnings for `tooltip.tsx`, `select.tsx`, and `label.tsx`; these do not fail the build but require cleanup during the product-quality pass.
- Documentation contains stale implementation and entity-count claims.
- Legacy database naming has been removed from active configuration and operating docs.
- Project source, tracked filenames, generated output, and Git history contain no former hosted-builder platform branding. An unused icon library that carried unrelated vendor marks was removed from the manifest, lockfile, and installed package cache.

## Session Log

### 2026-06-18 - Master TODO and alignment protocol

- Completed: repository-wide implementation/documentation pass; created canonical priority list; added mandatory start/end double-pass protocol.
- Verification: inspected repository tree, git state, routes, schema, API/client structure, scripts, feature docs, auth evidence, test evidence, uploads, migrations, delete routes, and stale naming/claims; `pnpm run typecheck` and `pnpm run build` passed. Build warnings for the oversized main chunk and three UI sourcemaps remain recorded above.
- Unresolved: all open items above, beginning with authentication and protected application entry.
- Next action: implement P0 authentication and protected landing/unlock flow, including API protection and automated tests.

### 2026-07-18 - Production-readiness assessment

- Completed: performed required double-read/double-pass repository assessment after time away; verified current P0/P1/P2 statuses against source, routes, schema, OpenAPI, docs, generated client structure, and repo hygiene.
- Verification: direct TypeScript checks passed for shared libraries, API server, frontend, and scripts; API production build passed; frontend production build passed with the known oversized main chunk and UI sourcemap warnings. Standard `pnpm run typecheck` is blocked in the Codex runtime by a dependency-status install prompt, so direct tool binaries were used after restoring `node_modules`.
- Unresolved: P0 production blockers remain authentication, backup/restore UI with encrypted evidence-aware packaging, migrations, automated tests, real evidence upload/storage, API/client codegen cleanup, and deletion/retention hardening.
- Next action: implement P0 authentication and protected landing/unlock flow, including API protection and automated tests.

### 2026-07-18 - Protected owner access and canonical API client

- Completed: implemented scrypt-backed single-owner setup/login, hashed database sessions, 12-hour expiry, HTTP-only same-site cookies, persistent brute-force lockout, logout/lock control, protected API middleware, and a responsive branded setup/unlock screen. Added authentication tables to the local database without creating an owner passphrase. Added auth and entity-create operations to OpenAPI, removed the manual entity client, fixed Windows-safe code generation, and regenerated all clients/schemas.
- Verification: three authentication boundary tests pass; unauthenticated live `/api/entities` returns `401` while health and auth status remain available; all library/API/frontend/script TypeScript checks pass; API and frontend production builds pass; consecutive code-generation hashes match; Playwright desktop and 390x844 mobile checks show no console errors, clipping, or overlap.
- Remaining notices: the known frontend main-chunk warning and three UI sourcemap warnings remain. Broad accounting/lifecycle tests, migrations, backups, and evidence storage remain open P0 work.
- Next action: implement the P0 backup and restore control center with encrypted, evidence-aware packaging and integrity verification.

### 2026-07-18 - Encrypted backup and recovery control center

- Completed: added a shared backup engine, authenticated and audited backup API, canonical OpenAPI operations, generated clients, professional Backup & Restore workspace, automatic integrity verification, encrypted downloads, isolated recovery drills, and guarded live restore with an automatic pre-restore recovery point.
- Security: packages use AES-256-GCM and scrypt; database and evidence payloads carry SHA-256 fingerprints; archive entries are validated before extraction; staging data is removed after success and failure; passphrases are never persisted.
- Verification: six auth/encryption tests pass; shared-library, API, frontend, and script TypeScript checks pass; API and frontend production builds pass; code generation is deterministic; a real backup of 24 local database tables verified and restored into a clean temporary database with matching counts. The temporary acceptance package and test database were removed.
- Browser note: the public owner-unlock boundary was verified after the API restart. The browser security boundary prevented a temporary local test-session handoff, so authenticated screenshot verification remains pending until the owner unlocks the in-app browser; no owner credential was changed.
- Remaining notices: the known frontend main-chunk warning and three UI sourcemap warnings remain. The next P0 action is committed, ordered database migrations with upgrade and rollback drills.
- Next action: implement versioned PostgreSQL migrations and replace production reliance on schema push.

### 2026-07-17 - Full remaining-work and repository-hygiene audit

- Completed: performed the required TODO read, repository pass, TODO reread, and second implementation pass; removed an unused icon dependency and its stale installed cache; verified project content, filenames, generated output, and Git history are clear of former hosted-builder platform branding.
- Verification: six authentication/backup tests pass; all library, API, frontend, and script TypeScript checks pass; API and frontend production builds pass. The frontend still emits the known 630.45 kB main-chunk warning and three UI sourcemap warnings.
- Newly recorded P0 risk: multi-record finance writes are not atomic, posted records remain mutable through general endpoints, closed periods are not enforced across ledger mutations, and several accounting invariants lack database constraints.
- Unresolved: complete the P0 migration, accounting-integrity, accounting-test, evidence-storage, and retention-policy work before treating real financial data as production-safe. The installed dependency tree contains one required upstream environment detector with an unrelated vendor string; it is ignored by Git and cannot be removed without breaking Tailwind, Vite, and API generation.
- Next action: implement versioned migrations together with the accounting-integrity service and deterministic ledger fixtures.

### 2026-07-17 - End-of-day checkpoint and next-session handoff

- Completed: repeated the required TODO/repository double-pass; replaced the stale handoff packet with a current product snapshot, verified baseline, exact startup sequence, first implementation work package, code-location map, and end-of-session definition.
- Alignment: confirmed the next checkpoint must combine ordered migrations, centralized atomic accounting services, posted-record protection, closed-period enforcement, validation constraints, transactional audit writing, and deterministic integration fixtures.
- Verification: six authentication/backup tests passed; all TypeScript targets passed; API and frontend production builds passed. Final whitespace, product-naming, repository-hygiene, TODO, and handoff checks are included in the checkpoint procedure.
- Next action: begin with versioned migration generation and disposable empty/current-database migration drills, then implement the accounting service and integrity fixtures against that baseline.
