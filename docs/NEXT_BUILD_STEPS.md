# Founders Finance Next Build Steps

Updated: 2026-07-19. The personal local-use release is complete. Use `MASTER_TODO.md` for authoritative status and acceptance evidence.

## Owner Rollout

1. Open **Founders Finance** from the installed Desktop, Start Menu, or pinned taskbar shortcut.
2. Confirm or create each company and review its default checking and tax-reserve accounts.
3. Enter a small real transaction and attach its evidence.
4. Create an encrypted backup, run the recovery drill, and copy the package off the application disk.
5. Begin normal use with the monthly checklist in `MONTHLY_WORKFLOW.md`.

## Post-Release Hardening

These items are not blockers for the owner's local use:

1. Add durable browser automation for critical UI workflows.
2. Run a formal automated accessibility scan and exhaustive keyboard audit.
3. Add broader dependency counts before reference-data deactivation.
4. Add scheduled backup and monthly-close reminders.
5. Design multi-user, hosted, and customer onboarding controls only when preparing a commercial clone.

## Keep Out Of Scope

- Payroll, tax filing, automatic tax advice, and invoicing
- Public multi-tenant deployment in the personal release
- Bank sync until CSV import is proven in regular use
- OCR without mandatory owner review
- Multi-currency without a real requirement

## Verification Gate

After material changes run:

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm run db:migrate:status
pnpm run db:migrate:acceptance
pnpm run backup:acceptance
pnpm --filter @workspace/api-spec run codegen
git diff --check
```
