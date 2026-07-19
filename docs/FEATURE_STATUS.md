# Founders Finance Feature Status

Last reviewed: 2026-07-18. `MASTER_TODO.md` is authoritative for priority and acceptance criteria.

## Production Foundations

| Feature | Status | Notes |
|---|---|---|
| Owner authentication | Complete | First-run setup, scrypt credentials, hashed 12-hour sessions, lockout, protected API |
| PostgreSQL migrations | Complete | Seven ordered migrations; empty/current-copy acceptance |
| Atomic accounting | Complete | Transactional services, balance checks, period guards, immutable posted history |
| Encrypted backup/restore | Complete | AES-256-GCM packages, verification, clean recovery drill, guarded live restore |
| Evidence storage | Complete | Secure upload, preview/download, replacement, archive, checksums, backup recovery |
| Retention policy | Complete | Transactions void; statements/evidence archive; companies archive; reference data deactivates |
| Automated backend tests | Substantial | 25 auth, backup, evidence, accounting, lifecycle, and period-control tests |
| Frontend workflow tests | Not started | Critical forms and destructive confirmations need browser automation |

## Daily Financial Workflows

| Feature | Status | Notes |
|---|---|---|
| Company management | Complete | Create, edit, close, archive, retention metadata, reopen, closure warnings |
| Expense entry and allocation | Complete | Entity/account/category/vendor selection, presets, intercompany generation |
| Transaction list/detail | Complete | Filters, lines, allocations, evidence, audit history, balance/posting state, void |
| Intercompany settlement | Partial | Balanced linked payment exists; reversal and account selection remain |
| Owner contributions | Complete | Capital and loan contribution journals |
| Owner draws | Complete | Balanced posted journals, history, totals, export |
| Reimbursements | Complete | Pay, waive, and convert-to-contribution outcomes |
| Tax reserve | Complete advisory flow | Rules and transfer suggestions; no automatic bank transfer |
| Evidence workspace | Complete | Upload, inspect, download, replace, archive, missing/tamper state |
| Statements | Complete | Create, manual lines, bounded mapped CSV import, duplicate controls, suggested/manual reconciliation, archive |
| Monthly close | Complete | Checklist, close, correction-memo reopen, closed-period enforcement |
| Audit viewer | Complete | Read-only filters and before/after inspection |
| Exports | Substantial | Ledger, entity/category, equity, reimbursement, intercompany, evidence, close, reconciliation, owner draw, retention |
| Reference data | Substantial | Account/category/vendor/preset create, edit, deactivate, reactivate; broader dependency warnings remain |

## Product Quality

| Feature | Status | Notes |
|---|---|---|
| Founders Finance branding | Complete | Current product name, logo family, navy/electric-blue system |
| Responsive navigation | Complete | Desktop sidebar plus mobile sheet navigation |
| Route splitting | Complete | Main chunk reduced from 630.45 kB to about 361.5 kB |
| Accessibility verification | Not started | Automated scan and manual keyboard pass required |
| Operational packaging | Not started | Supported production start/readiness procedure required |
| Error/offline recovery UX | Partial | Page handling exists, but API-down and retry behavior is not fully standardized |

## Immediate Build Order

1. Intercompany reversal and settlement-account selection.
2. Export fixtures and critical frontend workflow tests.
3. Accessibility, packaging, error recovery, and final authenticated responsive verification.
