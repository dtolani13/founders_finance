# Site survey — RCL edition and reviewed statement ingestion

Date: 2026-10-22. Owner: Dilip Tolani. Implementer: Codex.
Authorization: the owner's 2026-10-22 instruction authorizes this fork, correct RCL branding, ingestion setup and front/back verification. No new publication or change to the installed owner's database is part of this work.

## Scope and decisions

Preserve `88b28402ab1185e439b431b1f00423931908715a` as `original-blue-2026-10-22`. Work on `brand/rcl-2026-10-22`. Retain the single-owner, local-first architecture. Use the approved existing RCL emblem without redrawing or recoloring it. Verify with synthetic data in a separate PostgreSQL cluster.

The questions below cover the changed surfaces and existing boundaries they depend on. Existing controls are to be verified, not assumed from the July checklist. A database cannot validate browser presentation or original CSV syntax after parsing; those checks belong at the client/parser/HTTP boundary, with persisted financial constraints retained underneath.

| Questions | Decision and reason | Enforcement layer | Proof / scope |
|---|---|---|---|
| A1–A2 actors/authentication | One owner using existing scrypt credentials; API uses the configured database identity. No new external actor. | Auth middleware, hashed sessions in database | Auth suite and anonymous API rejection |
| A3 session termination | Preserve logout, 12-hour expiry and session-version checks. No new password-reset flow. | Auth service/database | Existing auth tests; logout/reload check |
| A4 failure limits | Preserve five failures/15-minute block. | Persistent login attempts | Auth suite |
| A5 impersonation | No impersonation or support identities. | Single-owner model | Auth routes review |
| B6–B8 permissions/default/scope | All finance and import routes require owner session; health/status/setup/login retain their documented public purpose. Default deny for data. | Auth middleware before router | Anonymous import and data requests fail |
| B9 irreversible operations | Imports add unmatched statement lines only. No auto-posting, money movement, silent deletion or automatic matching. | Existing financial service transactions | Ledger count unchanged by import; rollback tests |
| B10 role changes | N/A: no roles added, one owner. | Single-owner model | Auth review |
| C11–C15 isolation/missing scope/reporting | The owner spans companies; every import targets a valid active account's statement. Missing/invalid IDs fail. Reports may span owned companies, never public actors. | Handlers plus transactional service and FK constraints | Invalid/archived/inactive/closed-period tests |
| D16–D20 data lifecycle/location | Existing statement date, description and decimal amounts are financial data. File is parsed in memory; reviewed statement lines remain in local PostgreSQL and encrypted backups. No raw source retention or external ingestion. Highest-impact leak is financial detail. Archive retains history. | Bounded upload/parser, DB retention, backup engine | Payload limits, no raw file writes, archive/readback |
| E21 database identity | Isolated test cluster uses its dedicated test user. Production DB role hardening is deferred until external hosting is proposed; no production connection is used here. | Test configuration / localhost listener | Runtime connection metadata, test fixtures |
| E22 invariants | Preserve decimal DB money and existing financial constraints; reject malformed/overprecision CSV values before writes. | Parser plus SQL numeric fields and accounting services | Exact-cent and rejected-input fixtures |
| E23 audit | Imported records and required audit must commit together. Owner DB administrators can alter storage; tamper-proof external logging is not claimed. | One DB transaction | Forced audit failure leaves no new lines |
| E24 bounded work | CSV ≤2 MiB, ≤5,000 rows, bounded columns/record length. Serialize imports for each account to prevent concurrent duplicate races. | Multipart/parser limits and DB row lock | Oversize and concurrent replay tests |
| E25 migrations | Keep committed migration chain. No new schema needed for this change. | Migration tooling | Disposable empty DB reaches current schema |
| F26 boundaries | Browser→API: session and local host/origin checks. API→DB: parameterized queries. File→parser: strict inert CSV. No third-party call or AI execution. | HTTP middleware, parser, Drizzle | Host/origin and malformed CSV tests |
| F27 validation | Explicit mapping/date/sign conventions, USD-only scope displayed, strict decimal grammar, calendar dates, bounded values, preview fingerprint. | Parser and API; client gives feedback | Changed-file/mapping rejection; bad-row preview |
| F28 unsolicited input | No webhook or background source; owner uploads the selected CSV. Upload contents are data, never instructions. | Authenticated upload route | Anonymous upload refused |
| F29 replay | Import re-parses source; preview digest binds source/mapping/statement. Duplicate checks occur under account lock and look across its statements; ambiguous identical rows require owner review. | Service transaction/row lock plus fingerprint | Repeat and concurrent import, overlap fixtures |
| F30 limits | Keep 2 MiB upload and 5,000 rows; reject field overflow. No new automatic job. Global authenticated request throttling is deferred for local single-owner use; trigger is network/multi-user exposure. | Multer/parser; loopback binding | Limit checks; listener inspection |
| G31–G34 secrets | Existing DB/session secrets remain environment-only, never copied from owner's installation. Test secrets are disposable. Rotation remains documented owner operation; no new external credential. | Environment/configuration and logger redaction | Secret scan; no credentials in evidence |
| H35 dependency failure | Failed API/DB/import reports failure; no optimistic success. | UI boundary, DB transaction and error handlers | API outage and invalid import checks |
| H36–H38 blast radius/mistakes/insiders | One local owner can see all companies; no tenant isolation claim. App compromise reaches configured DB. Avoid new exposure with loopback and host/origin checks. Wrong imports remain unmatched; archive/correction retains evidence. | Network binding/auth/transaction/retention | Access tests and no auto-posting proof |
| H39 fail-open | No fallback to unsigned/unauthenticated finance operations. Setup is first-owner initialization on loopback, protected against hostile browser origins. | Host/origin middleware and atomic setup | Host/origin refusal; auth tests |
| I40–I43 money/concurrency/precision | Never silently round source money, flip signed debit columns, infer FX or post ledger entries. USD with exactly ≤2 decimals; integer cents during validation/totals, SQL decimal storage. Lock before duplicate lookup. | Parser/service/DB | Decimal, totals, negative-debit, duplicate race, ledger invariance |
| J44–J46 forensics | Record import count, source-row numbers and opaque fingerprint; avoid filename/account information in new audit notes. Existing statement descriptions are necessary financial records. Per-record read auditing is deferred until external access is proposed. | Transactional audit/logger | Audit assertions; no filename/CSV in import audit |
| K47–K49 recovery | Existing encrypted backup includes DB/evidence; rerun clean restore with synthetic records. Code rollback is original tag. No schema change. In-app errors/logs alert the local owner; unattended paging is deferred until unattended operation is requested. | Backup tooling/Git/UI | Backup restore acceptance, original tag hash, outage UI |

## Pre-mortem

1. Malformed `1,2.345` is rounded into a different financial value → E22/I43, reject before writes.
2. Two import clicks both insert the same row → E24/F29, account lock plus repeat/concurrency proof.
3. An old preview commits a different file/sign convention → F27/F29, bind preview fingerprint and clear stale UI results.
4. A remote browser claims an unconfigured local app → F26/H39, local binding and hostile Host/Origin refusal.
5. A similarly named logo replaces the approved artwork → preserved source hashes and rendered visual comparison.

## Acceptance before implementation

1. An anonymous data/import request is refused; a hostile host/origin is refused.
2. The RCL login/sidebar/favicon use the approved copper/silver emblem; original blue assets and tag remain recoverable.
3. A synthetic CSV previews exact debit, credit and net totals; confirmed import adds unmatched statement lines and leaves posted ledger entries unchanged.
4. Overprecision, malformed grouping, conflicting signs and invalid dates are reported without persisted rows.
5. Changed-preview input, a replay, concurrent duplicate requests and overlap with another statement do not silently duplicate data.
6. Reload/restart preserves imported rows; backup restores the same database/evidence in a disposable database.
7. Desktop/mobile core pages, navigation, mapping controls and error states remain usable; typecheck, build and relevant tests pass.

## Deferrals and unanswered items

Deferred 2026-10-22: PDF/OCR/bank connectivity, multi-user hosting, FX/mixed currency, tenant/RLS design, credential-rotation drills on the owner's installation, unattended alerting, and exhaustive accessibility certification. Trigger: a request to add those capabilities or expose the app beyond controlled local owner use. These are not activated by this fork.

No unanswered item blocks the authorized local fork. Cloud/commercial release remains outside this scope.
