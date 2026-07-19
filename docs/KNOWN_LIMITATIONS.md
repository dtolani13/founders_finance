# Known Limitations

These are current product boundaries, not hidden completion claims.

## Single-Owner Access

The app has protected single-owner setup/unlock, persistent sessions, and brute-force lockout. It does not provide multi-user roles or per-user isolation. Keep deployment private.

## Statement Import

Statement headers and lines can be entered and reconciled manually. CSV preview/import, duplicate detection, and assisted amount/date matching are not implemented yet. No match should be treated as automatic approval.

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
