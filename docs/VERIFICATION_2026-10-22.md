# RCL fork verification - 2026-10-22

Result: the RCL source edition passes the scoped local acceptance criteria. Verification used a separate synthetic PostgreSQL workspace, the compiled API, and the production frontend build. No owner ledger, credential, installed launcher, or production website was changed.

## Source and branding

GitHub main and canonical local main were both `88b28402ab1185e439b431b1f00423931908715a`. The local AGENTS.md verification update is preserved. The blue edition remains at `original-blue-2026-10-22`; work is on `brand/rcl-2026-10-22`. Original `index.css` and product artwork remain intact. See [RCL edition](RCL_EDITION.md) for exact approved emblem hashes and palette.

The actual copper/silver emblem from the corrected FoundersVaultOS edition appears in login, desktop navigation, phone header/drawer, and favicon. No substitute artwork was generated. Original EXE and owner-guide binaries are historical blue-edition releases, not new RCL installers.

## Fresh acceptance evidence

| Check | Observed result |
|---|---|
| Locked dependencies | Offline frozen-lockfile installation succeeded, 478 packages; lockfile unchanged |
| TypeScript | Root `pnpm run typecheck` passed for libraries, API, frontend and scripts |
| Production build | Root `pnpm run build` passed; main frontend chunk 359.37 kB, 116.52 kB gzip |
| Automated suite | Root `pnpm test`: **39 passed, 0 failed, 0 skipped** |
| API contract | OpenAPI updated first; React Query/types and Zod regenerated with Orval 8.15.0 |
| Auth and local boundaries | Anonymous data/import rejected; hostile Host, unapproved Origin and cross-site browser requests rejected; logout invalidates session |
| CSV correctness | Strict cents, grouping, sign, date/calendar, mapping and size/row bounds; complete multipart mapping accepted; invalid input adds no rows |
| Review binding | Changed file, mapping or destination rejected with 409; browser mapping changes clear the old preview and import action |
| Duplicate protection | Replays, concurrent requests, overlapping statements on one account, and in-file duplicates covered; exactly one concurrent import commits |
| Atomicity and provenance | Forced audit failure rolls back import; audit records source fingerprint/row numbers, without source filename or raw CSV |
| Ledger protection | Import adds unmatched statement rows; it does not create or post ledger transactions. Incorrect signed account amount cannot be matched |
| Live browser import | Northstar sample CSV: 2 rows reviewed, imported, manually matched to their exact posted transactions; status becomes Reconciled |
| Restart persistence | After service restart, Northstar still has 2 reconciled lines; posted ledger remains 7 transactions; cash amounts remain correct |
| Cash calculation | Opening balance plus posted journal movement; drafts/voids excluded, liability signs handled. Dashboard excludes loan/card balances from operating cash |
| Tax summary | Latest posted revenue is scoped to each entity; test distinguishes 100 from another entity's 700 and ignores a 900 draft |
| Migrations | Empty database and copy of synthetic current database passed; row counts preserved; seven migrations applied |
| Encrypted recovery | 70,291-byte encrypted package, 24 database tables, 1 synthetic evidence file; clean-database recovery drill passed |
| Frontend route smoke | All 17 navigation destinations loaded, including forms, reports, reference data, audit and recovery; no console warnings/errors during final pass starting 20:17:22 UTC |
| Responsive behavior | Desktop 1440 x 1000; phone target 390 x 844. Login, dashboard, drawer and statement summary inspected; no document-wide horizontal overflow (phone CSS width/scroll width both 391 due display rounding) |
| Marketing assets | Seven actual browser captures: five desktop and two phone; sample companies/data, empty login fields, exact approved emblem; captions/alt text and hashes included |

Migration schema fingerprint: `b7e7380fd389b7eca495909e671ed3c1d0e1a5cc550a8ab694c9781e6c5d4351`.

## Defects corrected during this review

- Source money was silently rounded and malformed comma grouping or negative debit magnitudes could be accepted. Parsing now rejects ambiguity before persistence.
- Duplicate checks were scoped to one statement and were not serialized. The service now locks the account and checks all of its statements, including archived ones.
- A stale preview could be followed by a different input. Preview binding and client reset now require review of the current file and mapping.
- The stored account balance was not maintained by posting workflows. Read paths now calculate balances from posted journals in PostgreSQL.
- Tax summaries could select another company's revenue or a draft. The query is now entity-specific and posted-only.
- The original local services listened on all interfaces and allowed unrestricted browser origins. This edition binds to loopback and validates Host/Origin.
- Narrow statement summaries crowded the account title. They now wrap balances below the account details.

## Reproduction and scope

Use Node.js, pnpm, PostgreSQL and isolated storage as described in [RCL edition](RCL_EDITION.md). Set a disposable test `DATABASE_URL`, `SESSION_SECRET`, `EVIDENCE_STORAGE_ROOT`, `BACKUP_STORAGE_ROOT` and compatible `POSTGRES_BIN` before these commands:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm test
pnpm run build
pnpm run db:migrate:acceptance
pnpm run backup:acceptance
```

The tests and acceptance scripts create disposable databases. Do not substitute an owner database for the isolated review setup. The guarded screenshot fixture is never run on normal startup.

Four existing UI sourcemap notices remain in the frontend build (label, select, sheet, tooltip); compilation and runtime checks pass. During development, replacing compiled assets while an old page was open caused transient stale-chunk requests; a fresh page after the final build was used for the final navigation pass. This is not evidence of an ongoing route failure.

Limits: controlled single-owner local use only; no claim of a new native installer, public hosting, multi-user isolation, exhaustive accessibility certification, bank connectivity, PDF/OCR ingestion, or mixed-currency/FX processing. Existing books need opening-balance reconciliation before adopting the new derived balance reads. Duplicate fingerprints are heuristics and can flag legitimate identical rows; see [Statement ingestion](STATEMENT_INGESTION.md).

Skills applied: Site Survey, No-Proof-No-Run (repository v2 rules), Design Master, engineering Code Review, Pressure Test, Computer Use, and Verification Before Completion. The repository's minimum-sufficient-proof protocol controls acceptance; no duplicate owner test is required for these technical checks.
