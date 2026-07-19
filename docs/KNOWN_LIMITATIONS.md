# Known Limitations

These are explicit product boundaries for the personal local-use release.

## Single-Owner Access

The app provides protected owner setup/unlock, persistent sessions, and brute-force lockout. It does not provide multi-user roles or per-user isolation. Keep it on the owner's machine or a private network boundary.

## Statement Sources

Statement import accepts CSV files up to 2 MB and 5,000 data rows using ISO or US month/day/year dates. It supports a signed amount column or separate debit and credit columns. PDF extraction and direct bank connections are not implemented. Suggested matches always require owner confirmation.

## Currency And Tax

All amounts are USD. Tax reserve calculations are advisory estimates, not tax advice. Multi-currency, payroll, tax filing, and bank transfer execution are out of scope.

## Reference Dependencies

Accounts, categories, vendors, and allocation presets can be deactivated without losing historical display. The UI does not show exhaustive dependency counts before every reference-data deactivation.

## Frontend Regression Coverage

The backend has deterministic coverage for authentication, encryption, evidence, accounting, lifecycle, rollback, idempotency, reconciliation, period control, statements, exports, and backup recovery. Critical UI workflows have passed an isolated browser release pass, but a durable automated browser suite and formal accessibility certification remain future hardening.

## Backup Schedule

Backups, tax-reserve review, close reminders, and reconciliation are manually initiated. There are no background jobs or scheduled reminders. The owner must copy encrypted packages off the application disk.

## Large Exports

CSV files are assembled in the browser from authenticated JSON responses. Very large datasets may consume noticeable browser memory; use company and period filters.

## Commercial Deployment

The current release is production-ready for the owner's controlled local use. A customer-facing clone still needs multi-user authorization, hosted secrets and database operations, formal accessibility testing, deployment monitoring, customer onboarding, support procedures, and commercial compliance review.
