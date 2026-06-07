# Known Limitations

This document describes intentional design constraints, missing features, and areas that require manual care. It is not a bug list — these are accepted trade-offs for a solo-founder single-user tool.

---

## Authentication & Access Control

**No multi-user auth.** The app uses a single Express session with `SESSION_SECRET`. There is no login screen, role-based access, or per-user data isolation.

**Mitigation:** Keep the developer tools repl private. Do not share the deployed URL. This is by design for a single-user ledger.

---

## No Automated Testing

There are no automated unit or integration tests. All verification is manual or via typecheck (`pnpm run typecheck`).

**Risk:** Regressions may go undetected. Run the typecheck before every deploy.

---

## No Audit Log Table

Corrections and voids are logged to the API server console (pino logger) but there is no persistent `audit_log` database table. Server logs are ephemeral in developer tools's free tier.

**Mitigation:** Use the monthly close `correction_memo` field to document changes. Export snapshots before making corrections.

---

## Evidence Files Are Not Managed by the App

`file_path` in the `documents` table is a string metadata field — the app does not upload, store, or serve files. You are responsible for placing evidence files in the `evidence/` directory and ensuring `file_path` values match.

**Mitigation:** See `docs/BACKUP_AND_RESTORE.md` for evidence directory backup instructions.

---

## No Double-Entry Enforcement by Default

Transaction lines support double-entry (debit/credit) but the app does not require balanced entries for `draft` transactions. Imbalanced drafts will show an `is_balanced: false` flag. Posting a transaction (`POST /transactions/:id/post`) requires balance.

**Mitigation:** Use the balance-check button or the Post action to enforce balance before closing a period.

---

## No Currency Conversion

All amounts are stored and displayed in USD. Multi-currency support is not implemented.

---

## Tax Reserve is Advisory Only

Tax reserve calculations (`/api/tax-reserve/suggest-transfer`) are estimates based on configurable percentages. They are **not tax advice**. Always verify with your accountant before transferring funds.

---

## Export CSV Generation is Client-Side

The Exports page generates CSV in the browser from JSON API responses. There is no server-side streaming for large datasets. Exports with thousands of records may be slow or cause browser memory pressure.

**Mitigation:** Filter by `period_month` or `entity_id` to limit export size.

---

## Statement Reconciliation is Manual Only

There is no auto-matching of statement lines to transactions. All matches are manual via the Statements UI. Partial matching and fuzzy date/amount matching are not implemented.

---

## No Soft-Delete for Statements

Statements cannot be soft-deleted. A statement with no matched lines can be hard-deleted (with its unmatched lines). Statements with matched lines are protected by a 409 guard. There is no "archive" or "void" state for statements.

---

## Intercompany Links Are One-Way

`intercompany_links` records the owing/owed relationship from one direction. The UI shows pending and paid status but does not automatically create offsetting journal entries on the other entity's books.

---

## No Scheduled Jobs

There are no cron jobs, background workers, or scheduled tasks. Tax reserve suggestions, closing reminders, and backup triggers are all manual.

---

## `all_transactions` Export Has No Entity Column

The `all_transactions` export does not include per-line entity attribution because transactions can span multiple entities via `transaction_lines`. Use `expenses_by_entity` for entity-level expense breakdown.
