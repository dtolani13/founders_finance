# Founders Finance Master TODO

This is the canonical source of truth for repository priority, completion status, verification evidence, and session handoff.

Last repository alignment review: **2026-07-19**

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

- [x] **Versioned database migrations**
  - Replace production reliance on `drizzle-kit push` with committed, ordered migration files.
  - Add migration status and startup/deployment guidance.
  - Include current entity lifecycle columns in the migration baseline.
  - Acceptance: an empty database and a copy of the current database both reach the same schema through migrations without data loss.

- [x] **Atomic accounting integrity and period enforcement**
  - Move multi-record finance operations into centralized service functions wrapped in database transactions.
  - Prevent general update, line-replacement, and allocation endpoints from changing posted or voided transactions.
  - Enforce closed-period guards on transaction creation, editing, posting, voiding, allocation, reconciliation, and settlement operations.
  - Validate account ownership, entity state, debit/credit shape, allocation totals, and idempotency before writes begin.
  - Add database constraints where they provide a reliable second line of defense without blocking valid accounting corrections.
  - Acceptance: forced failures leave no partial records; posted history is immutable; closed months reject unauthorized mutations; every generated journal remains balanced and traceable.

- [~] **Automated accounting and lifecycle test suite**
  - A root `pnpm test` command covers 32 authentication, encrypted backup, secure evidence, statement CSV, export, audited-mutation, accounting, lifecycle, rollback, idempotency, and period-control cases.
  - An isolated browser pass covers first-run setup, company/default-account creation, reference category creation, balanced expense entry, transaction detail/audit history, and cancelable company-close and transaction-void confirmations.
  - Complete the remaining statement, evidence, monthly-close, backup, and intercompany browser interactions.
  - Acceptance: tests run from one documented root command and fail on known integrity regressions.

- [x] **Evidence file storage and retrieval**
  - Secure streaming upload, authenticated preview/download, signature-based type validation, server-generated paths, a 20 MB limit, checksum verification, atomic replacement, archive retention, and missing-file handling are implemented.
  - Evidence is stored outside the public web root and is included in encrypted, verified backups.
  - Acceptance tests cover unauthenticated access, oversize and spoof rejection, rollback cleanup, versioned replacement, backup/restore byte equality, and tamper detection.

- [x] **API contract and generated-client alignment**
  - Authentication, entity creation, and entity lifecycle operations are represented in the canonical OpenAPI contract.
  - Removed the overlapping manual entity client and regenerated React Query clients and Zod schemas.
  - Verified: consecutive code-generation runs produced identical hashes and frontend/server typechecks pass against regenerated artifacts.

- [x] **Financial-data deletion policy**
  - Transactions void, statements and evidence archive, companies close/archive, and reference records deactivate. Posted history and linked evidence are retained.
  - Remaining user-facing lifecycle actions are explicit and audited; historical joins continue to resolve inactive reference data.
  - Acceptance: no user-facing action can silently destroy posted financial history or linked evidence.

## P1 - Core Workflow Completion

- [~] **Company lifecycle management**
  - Add, edit, close, archive, retention date/reason, and reopen are implemented.
  - Automated lifecycle, personal-record protection, account-state, audit, and rollback tests are implemented.
  - Account-balance, open-obligation, unreconciled-statement, and evidence warnings plus archived-company retention export are implemented.
  - Decide whether archived account reactivation should restore all accounts or only accounts active before closure.
  - Acceptance: lifecycle tests cover open balances, statements, evidence, tax rules, and account-state restoration.

- [x] **Persistent audit trail and audit viewer**
  - Read-only table/action/record/date filtering and before/after inspection are implemented.
  - The mutation inventory found and closed direct-write gaps in manual statement operations and tax-reserve rule replacement; both are now transactional, period-aware where applicable, and covered by isolated-database tests.
  - Acceptance: mutation coverage audit identifies no critical unlogged financial operation.

- [x] **Intercompany settlement accounting**
  - Settlement requires explicit owing/receiving checking-account selection, validates company ownership, and creates a balanced linked journal.
  - Reversal creates a new balanced posted journal linked to the original, preserves posted history, reopens the obligation atomically, and blocks duplicate or closed-period reversal.
  - Acceptance: both entities' ledger impact and the intercompany link reconcile to zero.

- [x] **Reimbursement completion actions**
  - Paid, waived, and converted-to-contribution outcomes create balanced, linked, audited accounting records and reject duplicate processing.
  - Acceptance: paid, waived, and converted states produce traceable accounting outcomes.

- [x] **Owner draw workflow**
  - Owner draw entry, validation, balanced posted journal generation, history, totals, audit, and export support are implemented.
  - Acceptance: draw appears in ledger, entity cash, owner equity reporting, and exports.

- [x] **Statement import and assisted reconciliation**
  - Bounded CSV upload, header inspection, explicit column mapping, full-file preview, strict row validation, in-file/existing duplicate detection, skip-duplicate control, and atomic insertion are implemented.
  - Exact account-amount and nearby-date candidates are ranked, but matching still requires explicit owner confirmation.
  - Acceptance: imported lines reconcile without silent auto-approval or duplicate insertion.

- [x] **Export correctness and accountant handoff**
  - All 13 export types have deterministic isolated-database fixtures.
  - Entity, period, status, source IDs, transaction linkage, required columns, filters, row counts, reconciliation counts, and financial totals are verified.
  - Acceptance: export fixture tests validate columns, row counts, filters, and totals.

- [~] **Account, category, vendor, and preset management**
  - Create, edit, deactivate, and reactivate flows are implemented for all four reference-data types.
  - Historical records continue to resolve inactive reference data; dependency warnings still need broader coverage.
  - Acceptance: inactive reference data remains resolvable on historical records.

- [x] **Transaction detail and correction workflow**
  - The detail view includes lines, allocations, evidence, audit history, posting/balance state, and a controlled void action.
  - Acceptance: users can explain every posted transaction from one screen without exposing unsafe direct edits.

## P2 - Professional Product Quality

- [~] **Responsive shell and visual polish**
  - Responsive desktop/sidebar and mobile-sheet navigation are implemented; the public owner boundary passes a 390x844 geometry check with no horizontal overflow.
  - Authenticated pages still need systematic screenshot verification at desktop, tablet, and mobile widths.
  - Verify no clipping, overflow, overlap, inaccessible contrast, or inconsistent action hierarchy.
  - Acceptance: screenshot checks pass at representative desktop, laptop, tablet, and mobile widths.

- [ ] **Accessibility and keyboard operation**
  - Audit headings, labels, focus order, dialogs, tables, color-only status, and keyboard navigation.
  - Acceptance: automated accessibility scan plus manual keyboard pass on critical workflows.

- [x] **Performance and bundle splitting**
  - Route-level lazy loading and stable suspense states are implemented; the main production chunk fell from 630.45 kB to approximately 361.5 kB with no oversized-chunk warning.
  - Acceptance: no unexplained oversized main chunk and no regression in startup behavior.

- [ ] **Operational packaging and startup reliability**
  - Add a supported local production run method, environment validation, database readiness check, and clear service lifecycle commands.
  - Consider Docker Compose only if it improves backup and operational reliability.
  - Acceptance: a clean machine can start the app using documented steps without hidden local state.

- [~] **Documentation reconciliation**
  - Core product, status, limitation, model, and handoff documents are aligned with the current implementation in this checkpoint.
  - The longer operator/build guides still require a final consistency sweep before production release.
  - Old database naming is removed from `.env.example`, quick-start, troubleshooting, and monthly-workflow documentation.
  - Acceptance: documentation search finds no claims contradicted by source or schema.

- [ ] **Error handling and recovery UX**
  - Add consistent page-level loading, retry, actionable error details, offline/API-down states, and safe mutation retry behavior.
  - Acceptance: API/database outage tests do not leave ambiguous or falsely successful UI states.

## P3 - Future Enhancements

- [ ] Receipt OCR with mandatory user review.
- [ ] Optional bank import adapters after CSV import is proven in regular use.
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

Repository alignment verified on 2026-07-19; runtime verification evidence below is from the 2026-07-18 release checkpoint unless noted:

- Seven committed migrations cover the baseline, integrity constraints, monthly-close correction memo, reconciliation uniqueness, secure evidence metadata, financial retention, and owner draws. The local database has zero pending migrations.
- Disposable empty-database and copied-current-database migration paths converge without row loss; the fingerprint includes columns, constraints, and indexes.
- Expense graphs, transaction updates, line/allocation replacement, posting, voiding, company lifecycle, owner contributions, settlements, reimbursement payment, reconciliation, and monthly close now use transactional services with in-transaction audit writes.
- Posted and voided transaction mutation is blocked. Closed periods reject create/edit/post/void/allocation/reconciliation/settlement/contribution work until an audited correction-memo reopen occurs.
- Database constraints enforce positive amounts, one-sided journal lines, lifecycle/status ranges, allocation ranges, unique close periods, unique statements, and one reconciliation match per statement line.
- Thirty-two deterministic authentication, backup, evidence, CSV parsing/import, export, audited-mutation, accounting, lifecycle, rollback, idempotency, closed-period, reconciliation, settlement/reversal, and close/reopen tests pass.
- Automated frontend tests are still absent. An isolated browser pass has verified setup, company/category creation, expense entry, transaction detail/audit history, route loading, and cancelable destructive confirmations; the remaining critical interactions are listed in the frozen release work below.
- Secure evidence upload, preview/download, replacement, archive, integrity checking, and encrypted backup/restore are implemented and tested.
- Statements and evidence archive; accounts, categories, vendors, and allocation presets deactivate while remaining visible in historical records.
- Reimbursement paid/waived/converted outcomes, owner draws, and intercompany settlement/reversal are balanced, linked, audited, and tested. Intercompany settlement requires explicit company-owned checking-account selection.
- Company lifecycle warnings cover balances, obligations, reconciliation, and evidence. The prior account-active-state restoration decision remains open.
- The audit viewer and final mutation-coverage audit are complete; manual statement mutations and tax-rule replacement are transactional, period-aware where applicable, and tested.
- Statement CSV import supports amount and debit/credit layouts, blocks invalid or duplicate files before writes, imports atomically, and provides confirmation-only account-aware match suggestions.
- OpenAPI generation is deterministic and TypeScript verification passes across libraries, API, frontend, and scripts.
- API and frontend production builds pass. Route splitting removed the oversized main-chunk warning; four generated UI sourcemap warnings remain.
- Project content, tracked filenames, generated output, and Git history remain clear of prohibited hosted-builder branding and legacy product naming.

## Session Log

### 2026-07-19 - Morning release-status alignment

- Completed: performed the required TODO read, repository pass, TODO reread, and second codebase alignment pass; corrected stale alignment notes that incorrectly listed completed intercompany and mutation-audit work as open.
- Verification: `main` began clean and synchronized at `37be762`; repository hygiene scan is clean; source confirms no supported production launcher or automated frontend suite yet. The full test command passes after temporarily starting the project PostgreSQL instance. Migration status does not load the repository `.env` automatically, confirming an environment-handling requirement for the operational launcher. PostgreSQL was stopped again; local services on ports 5175, 8081, and 55432 are currently stopped.
- Remaining frozen release work: finish the remaining critical browser interactions; add supported local startup/readiness/shutdown/recovery commands; run the final build, codegen, migration, encrypted backup/restore, hygiene, live-health, commit, and push gate.
- Next action: resume the isolated browser pass at statement creation/import and evidence upload.

### 2026-07-18 - Frozen release gates checkpoint

- Completed: intercompany account selection and immutable audited reversal; traceable fields and deterministic fixtures for all 13 exports; transactional audit coverage and period guards for statement/manual-line and tax-rule mutations.
- Verification: 32 tests and the full TypeScript pass succeed. An isolated browser/database run verified setup, company/default accounts, category creation, balanced expense entry, transaction detail/audit history, company-close confirmation, transaction-void confirmation, and route loading through statements, evidence, monthly close, exports, backups, and audit.
- Cleanup: the isolated browser session, temporary services on ports 8181/5275, temporary database, and smoke logs were removed; the real ledger and live 5175/8081 services were not changed by the browser run.
- Remaining frozen release work: finish the remaining critical browser interactions; add supported local startup/readiness/shutdown/recovery commands; run the final build, codegen, migration, backup/restore, hygiene, live-health, commit, and push gate.
- Next action: resume release gate three at statement creation/import and evidence upload, then complete monthly-close, backup, and intercompany UI interactions before operational packaging.

### 2026-07-18 - Secure evidence and daily-use workflow push

- Completed: secure evidence storage and recovery; statement/evidence archival and reference-data deactivation; owner draws; reimbursement waive/conversion; audit viewer; transaction detail; lifecycle warnings; reference-data management; owner-draw and retention exports; responsive navigation; and route-level bundle splitting.
- Verification: 30 tests passed after the final code and documentation pass; all TypeScript targets and both production builds passed; consecutive OpenAPI generations produced identical hashes; seven migrations report applied with none pending; empty/current migration acceptance converged at fingerprint `24ec6fc2f1c7c7d3846b6fe521b5c604cd85977dc15573bc0052bb395ea44b29`; live API and web health checks passed.
- Remaining: intercompany reversal/account selection; deterministic export fixtures; frontend workflow/accessibility testing; operational packaging; broader error recovery; final audit/reference dependency coverage.
- Next action: implement explicit intercompany settlement-account selection and a balanced, audited reversal workflow.

### 2026-07-18 - Statement CSV import and assisted matching

- Completed: added a proven zero-dependency CSV parser; bounded multipart inspection; guided header mapping; amount and debit/credit layouts; strict US/ISO date and money parsing; full-file validation; duplicate detection; transactional import; source-row audit detail; and account-aware date/amount match suggestions requiring owner confirmation.
- Verification: four parser fixtures and the database import/duplicate/closed-period fixtures raise the full suite to 30 passing tests; all TypeScript targets and both production builds pass; the split main frontend chunk remains 362.37 kB.
- Remaining: intercompany reversal/account selection, deterministic export fixtures, frontend/accessibility testing, operational packaging, error recovery, and final audit/dependency-warning coverage.
- Next action: implement explicit intercompany settlement-account selection and a balanced, audited reversal workflow.

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

### 2026-07-18 - Versioned migrations and accounting-integrity checkpoint

- Completed: added a committed four-step migration chain, guarded baseline adoption, migration status/application commands, disposable migration acceptance, and columns/constraints/indexes schema fingerprinting. Fixed PostgreSQL client/server major-version selection in backup and recovery tooling.
- Completed: centralized expense, transaction, allocation, posting, voiding, company lifecycle, owner contribution, intercompany settlement, reimbursement payment, reconciliation, and monthly-close writes in atomic services with in-transaction audit events, period enforcement, idempotency, state protection, and validation.
- Data-model hardening: added transaction/line/allocation/lifecycle/status/amount constraints, unique company-month close and account-month statement indexes, unique statement-line reconciliation, and the previously missing monthly-close correction memo column.
- Verification: 18 tests passed; all TypeScript targets passed; API and frontend production builds passed; OpenAPI generation was deterministic; empty/copy migration acceptance preserved row counts and produced fingerprint `f9862f02354ae4723b504dc2601b986e57cf6e919498725c9cb43695bb5d31a4`; the local database reports four applied and zero pending migrations.
- Remaining notices: frontend browser workflow tests are absent; the 630.45 kB main chunk and three UI sourcemap warnings remain.
- Next action: implement secure evidence upload/download/preview/replacement with path/type/size validation and prove evidence survives encrypted backup and clean restore.
