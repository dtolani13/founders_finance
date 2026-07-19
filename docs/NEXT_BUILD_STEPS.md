# Founders Finance Next Build Steps

Updated: 2026-07-18. Use `MASTER_TODO.md` for authoritative status and acceptance criteria.

## Immediate Work Package

Complete intercompany settlement controls:

1. Add explicit owing and receiving cash-account selectors.
2. Add a dedicated balanced reversal journal without editing the original posted settlement.
3. Reopen the obligation atomically after a successful reversal.
4. Test account ownership, multiple-account behavior, duplicate reversal, closed periods, balance, rollback, and audit history.

## Queue After Import

1. Deterministic fixtures for every export and accountant-handoff validation.
2. Critical frontend form/dialog workflow tests.
3. Automated accessibility and manual keyboard checks.
4. Supported local production launcher with environment/database readiness checks.
5. Standardized API-down, offline, retry, and mutation recovery UX.
6. Final audit-mutation and reference-dependency coverage.
7. Authenticated responsive screenshot pass at desktop, tablet, and mobile widths.

## Keep Out Of Scope

- Payroll, tax filing, automatic tax advice, and invoicing.
- Public multi-tenant SaaS behavior.
- Bank sync until CSV statement import is proven in regular use.
- OCR without mandatory owner review.
- Multi-currency until a real requirement exists.

## Verification

After each checkpoint run tests, all typechecks, both production builds, migration status/acceptance where applicable, deterministic OpenAPI generation, and the repository hygiene scans documented in `MASTER_TODO.md`.
