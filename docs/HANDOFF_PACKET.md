# Founders Finance Session Handoff

Updated: 2026-07-19

`docs/MASTER_TODO.md` is the canonical priority and acceptance record.

## Release Decision

Founders Finance is ready for the owner's controlled local use. The personal release has a supported production launcher, protected owner entry, atomic accounting, retention controls, secure evidence, statement reconciliation, monthly close, traceable exports, and encrypted backup recovery.

Customer hosting and multi-user commercialization remain a separate future release.

## Repository

- Branch: `main`
- Remote: `https://github.com/dtolani13/founders_finance.git`
- Workspace: `C:\AI_Projects\Founders-Finance\Founders-Finance`
- App: `http://127.0.0.1:5175`
- API: `http://127.0.0.1:8081`
- Project PostgreSQL: `127.0.0.1:55432` when `.local/pgdata` is used
- Migrations: seven applied, zero pending
- Schema fingerprint: `24ec6fc2f1c7c7d3846b6fe521b5c604cd85977dc15573bc0052bb395ea44b29`

## Supported Operations

```powershell
pnpm run app:doctor
pnpm run app:start
pnpm run app:status
pnpm run app:restart
pnpm run app:stop
```

The launcher loads the root `.env`, validates configuration and storage, starts the managed database when appropriate, checks migrations, builds production assets, starts API/web services, waits for health, and records owned process state under `.local/runtime/`.

## Release Verification

- 32 automated tests pass.
- TypeScript verification and both production builds pass.
- Two consecutive Drizzle generations report no schema changes.
- OpenAPI code generation is deterministic.
- Seven migrations are applied with none pending.
- Blank-database and current-copy migration acceptance converge without row loss.
- Disposable encrypted backup acceptance restores 24 tables and evidence into a clean database with matching counts.
- Isolated browser validation covers owner setup, two companies, category creation, balanced expense posting, intercompany settlement/reversal, statement CSV import, posted-only reconciliation, unmatch/rematch, evidence upload/preview, monthly close/reopen/reclose, encrypted backup creation/verification/recovery drill, responsive breakpoints, keyboard dialogs, and API outage messaging.
- Project content and tracked filenames contain no prohibited hosted-builder branding or legacy product name.

The Vite build still prints four non-blocking source-map location warnings from UI component modules. They do not affect runtime behavior or source output.

## Release Fixes From Final Browser Pass

- Added controlled posting from transaction detail and filtered statement matching to posted transactions.
- Added statement unmatch behavior and automatic reconciled/reconciling status refresh.
- Repaired the evidence form crash caused by field-only wrappers around a manual file input.
- Replaced Windows-fragile evidence `sendFile` handling with authenticated direct streaming.
- Corrected backup audit events so external backup IDs are stored in the audit payload instead of a UUID-only database field.
- Added supported local lifecycle commands and root environment loading for scripts, migrations, and schema generation.

## Owner Start

1. Run `pnpm run app:start`.
2. Open `http://127.0.0.1:5175` and unlock.
3. Confirm the real companies and accounts in Settings.
4. Create an encrypted backup and run **Test restore** before loading substantial real data.
5. Copy the `.ffbackup` package to a separate physical or cloud location.

## Future Queue

The local-use release has no open ship blocker. Future customer-release work is listed in `NEXT_BUILD_STEPS.md` and `KNOWN_LIMITATIONS.md`.

## Important Code Locations

- Local operations: `scripts/src/local-app.ts`
- Migrations: `lib/db/drizzle/`
- Accounting services and tests: `artifacts/api-server/src/services/`
- API routes: `artifacts/api-server/src/routes/`
- Frontend pages: `artifacts/founders-finance/src/pages/`
- Backup engine: `lib/backup/src/index.ts`
- API contract: `lib/api-spec/openapi.yaml`

Generated API client and schema files must not be edited manually. Update OpenAPI, regenerate, and verify a second generation produces no diff.

## End-Of-Session Definition

1. Run verification appropriate to the change.
2. Update `MASTER_TODO.md` and this handoff.
3. Perform the required final TODO/repository alignment pass.
4. Commit and push.
5. Confirm the worktree is clean and synchronized.
