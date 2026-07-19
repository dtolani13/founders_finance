# Founders Finance Next Build Steps

Updated: 2026-07-18. Use `MASTER_TODO.md` for authoritative status and acceptance criteria.

## Immediate Work Package

Build statement CSV import and assisted reconciliation:

1. Add a proven CSV parser.
2. Accept a bounded authenticated upload.
3. Preview rows and map date, description, amount/debit/credit, and optional balance columns.
4. Detect duplicates within the file and against existing statement lines.
5. Validate all rows before a transactional insert so failures never partially import.
6. Suggest amount/date transaction candidates, requiring explicit owner confirmation before matching.
7. Test quoted fields, alternate date formats, debit/credit layouts, duplicates, rollback, and confirmation.

## Queue After Import

1. Intercompany reversal and settlement-account selector.
2. Deterministic fixtures for every export and accountant-handoff validation.
3. Critical frontend form/dialog workflow tests.
4. Automated accessibility and manual keyboard checks.
5. Supported local production launcher with environment/database readiness checks.
6. Standardized API-down, offline, retry, and mutation recovery UX.
7. Final audit-mutation and reference-dependency coverage.
8. Authenticated responsive screenshot pass at desktop, tablet, and mobile widths.

## Keep Out Of Scope

- Payroll, tax filing, automatic tax advice, and invoicing.
- Public multi-tenant SaaS behavior.
- Bank sync until manual statement import is stable.
- OCR without mandatory owner review.
- Multi-currency until a real requirement exists.

## Verification

After each checkpoint run tests, all typechecks, both production builds, migration status/acceptance where applicable, deterministic OpenAPI generation, and the repository hygiene scans documented in `MASTER_TODO.md`.
