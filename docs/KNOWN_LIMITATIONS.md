# Known Limitations

These are current product boundaries, not hidden completion claims.

## Single-Owner Access

The app has protected single-owner setup/unlock, persistent sessions, and brute-force lockout. It does not provide multi-user roles or per-user isolation. Keep deployment private.

## Statement File Formats

Statement import accepts CSV files up to 2 MB and 5,000 data rows using ISO or US month/day/year dates. It supports a single signed amount column or separate debit/credit columns. PDF statement extraction and direct bank connections are not implemented. Suggested matches always require owner confirmation.

## Intercompany Reversals

Settlement creates a balanced, linked, audited journal. It currently chooses the default checking accounts and does not provide a dedicated reversal workflow or account selector.

## Reference Dependencies

Accounts, categories, vendors, and allocation presets can be deactivated without losing historical display. The UI does not yet provide exhaustive dependency counts before every deactivation.

## Testing Boundary

Backend coverage includes authentication, encryption, evidence, accounting, lifecycle, rollback, idempotency, reconciliation, and period control. Critical frontend forms, dialogs, accessibility, and authenticated multi-viewport workflows still need automated coverage.

## Local Operations

The repository has documented development startup and verified backups, but does not yet provide a single supported production launcher with database readiness and service lifecycle handling.

## Currency And Tax

All amounts are USD. Tax reserve calculations are advisory estimates, not tax advice. Multi-currency, payroll, tax filing, and bank transfer execution are out of scope.

## Scheduled Work

Backups, tax-reserve review, close reminders, and reconciliation are manually initiated. There are no background jobs or scheduled reminders.

## Large Exports

CSV files are assembled in the browser from authenticated JSON responses. Very large datasets may consume noticeable browser memory; use entity and period filters.
