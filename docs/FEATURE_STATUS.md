# Founders Finance Feature Status

Last reviewed: 2026-07-19. `MASTER_TODO.md` is authoritative for priority and acceptance evidence.

## Local-Use Release

| Feature | Status | Verification |
|---|---|---|
| Owner authentication | Complete | First-run setup, scrypt credentials, hashed 12-hour sessions, persistent lockout, protected API |
| Supported startup | Complete | Doctor, start, status, restart, stop, environment validation, migration readiness, health waits |
| PostgreSQL migrations | Complete | Seven ordered migrations; empty and current-copy acceptance; zero pending |
| Atomic accounting | Complete | Balanced transactional services, period guards, immutable posted history |
| Company lifecycle | Complete | Create, edit, close, archive, retention metadata, reopen, warnings, account state controls |
| Intercompany | Complete | Explicit cash accounts, settlement, linked reversal, duplicate and closed-period guards |
| Statements | Complete | Manual lines, mapped CSV import, duplicate controls, posted-only matching, unmatch, reconciliation status, archive |
| Evidence | Complete | Upload, authenticated preview/download, replacement, archive, integrity states, backup recovery |
| Monthly close | Complete | Seven-item checklist, close, memo-required reopen, reclose, mutation enforcement |
| Encrypted backup/restore | Complete | AES-256-GCM packages, auto-verification, clean recovery drill, guarded live restore |
| Audit, exports, and printing | Complete | Read-only audit inspection; 13 traceable export types with deterministic fixtures; CSV download and full-report print/PDF output |
| Automated backend tests | Complete for local v1 | 32 tests cover auth, accounting, lifecycle, evidence, statements, exports, audit, backup, and recovery |
| Critical browser workflows | Complete for local v1 | Isolated pass across setup, companies, expenses, intercompany, statements, evidence, close, backup, responsive, keyboard, and API outage |

## Product Quality

| Feature | Status | Notes |
|---|---|---|
| Founders Finance branding | Complete | Navy, gunmetal, white, and electric-blue product system |
| Responsive application shell | Complete for local v1 | Mobile 390x844, tablet 1024x768, and desktop 1440x900 show no document overflow |
| Keyboard dialogs | Complete for critical local v1 paths | Dialog focus, Escape dismissal, and memo/passphrase interactions verified |
| Route splitting | Complete | Main production chunk is approximately 362 kB with no oversized warning |
| API outage state | Complete for owner entry | The application shows an actionable secure-service-unavailable alert and no false success |
| Broad accessibility certification | Future hardening | Automated WCAG scan and exhaustive page-by-page keyboard audit remain for a customer release |
| Automated frontend suite | Future hardening | Critical workflows are manually verified in isolation; durable browser automation remains useful for commercialization |

## Intentional Boundaries

- Private single-owner local deployment
- USD only
- CSV statements, no bank connection
- Advisory tax reserve estimates, no filing or transfer execution
- No payroll, invoicing, OCR auto-posting, or multi-tenant SaaS behavior
- Manual backup schedule, with encrypted off-device copies required
