# Founders Finance Next Build Steps

Updated: 2026-07-18. Use `MASTER_TODO.md` for authoritative status and acceptance criteria.

## Immediate Work Package

Finish the frozen local-v1 release gates:

1. Resume the isolated browser pass at statement creation/import and evidence upload.
2. Complete monthly-close, backup, and intercompany settlement/reversal UI interactions.
3. Add supported local startup, readiness, shutdown, and recovery commands.
4. Run the final production build, deterministic codegen, migration, encrypted backup/restore, repository-hygiene, and live-health gate.

## Queue After Import

1. Broader accessibility and responsive verification after local-v1 release.
2. Standardized noncritical offline/retry polish after local-v1 release.
3. Broader reference-data dependency warnings.

## Keep Out Of Scope

- Payroll, tax filing, automatic tax advice, and invoicing.
- Public multi-tenant SaaS behavior.
- Bank sync until CSV statement import is proven in regular use.
- OCR without mandatory owner review.
- Multi-currency until a real requirement exists.

## Verification

After each checkpoint run tests, all typechecks, both production builds, migration status/acceptance where applicable, deterministic OpenAPI generation, and the repository hygiene scans documented in `MASTER_TODO.md`.
