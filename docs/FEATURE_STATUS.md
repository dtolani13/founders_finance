# Feature Status — Founders Finance

> Current state of every feature. Use this before building anything new to understand what exists, what works, and what is partial.

Last reviewed: May 2026

---

## Status Key

| Status | Meaning |
|---|---|
| **complete** | Fully implemented, working, verified |
| **partial** | Core logic works; some edge cases, UI flows, or validations missing |
| **placeholder** | Route or schema exists but logic is minimal/stub |
| **not started** | Not implemented; no route or UI |
| **needs verification** | Implemented but not tested end-to-end recently |

---

## Feature Matrix

### Core Data

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Entities | complete | `routes/entities.ts`, `schema/entities.ts`, `pages/Settings.tsx` | Three entities seeded. Update only (no create/delete in UI). | Low | None |
| Accounts | complete | `routes/accounts.ts`, `schema/accounts.ts` | Pre-seeded per entity. No UI to create new accounts. | Low | Add account creation UI if needed |
| Categories | complete | `routes/categories.ts`, `schema/categories.ts` | Seeded list. Read-only in current UI. | Low | Add category management UI |
| Vendors | complete | `routes/vendors.ts`, `schema/vendors.ts` | Create and list vendors. No edit/delete UI. | Low | Add edit/delete vendor in Settings |

---

### Transactions

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Transaction list | complete | `routes/transactions.ts`, `pages/Transactions.tsx` | Filter by entity, type, status, date range. Paginated. | Low | None |
| Transaction detail | complete | `routes/transactions.ts` | GET single transaction with lines. | Low | Add detail view page |
| Manual expense entry | complete | `routes/expenses.ts`, `pages/NewExpense.tsx` | Full form: date, amount, vendor, category, purpose, entity, account. | Medium | Verify after schema changes |
| Transaction soft-delete | complete | `routes/transactions.ts`, `schema/transactions.ts` | `deleted_at` field. List queries filter deleted. | Low | None |
| Transaction lines (double-entry) | partial | `routes/transactions.ts`, `schema/transaction_lines.ts` | DB structure exists. Balance check endpoint exists. UI does not expose manual line editing. | Medium | Add manual line editor if needed |
| Post transaction | complete | `routes/transactions.ts` — `/post` endpoint | Validates balance before posting. | Medium | None |
| Balance check | complete | `routes/transactions.ts` — `/balance-check` endpoint | Returns `is_balanced` flag. | Low | None |

---

### Allocations

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Expense allocations | complete | `routes/expenses.ts`, `pages/NewExpense.tsx` | Percentage and dollar split. Validates 100% total. | High | Test after any expense route change |
| Intercompany balance creation | complete | `routes/expenses.ts` | Auto-created on cross-entity allocation. `creates_intercompany_balance` flag per line. | High | Verify canonical test after changes |
| Allocation presets | complete | `routes/allocation_presets.ts`, `schema/allocation_presets.ts` | Save and retrieve presets. Applied in NewExpense UI. | Low | Add preset edit/delete UI |
| Personal / non-deductible split | complete | `pages/NewExpense.tsx` | Amber warning shown when Personal entity is allocated. No intercompany entry created. | Medium | None |
| Unallocated expense list | complete | `routes/expenses.ts` — `/expenses/unallocated` | Returns expenses with no allocation rows. | Low | Surface in Allocations page |

---

### Intercompany

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Intercompany balance list | complete | `routes/intercompany.ts`, `pages/Intercompany.tsx` | Shows pending and paid balances between entities. | Low | None |
| Mark intercompany paid | complete | `routes/intercompany.ts` — `/mark-paid` | Updates status. Does not auto-create the settlement transaction. | Medium | Add settlement transaction creation |
| Intercompany settlement transaction | not started | — | No automatic `intercompany_reimbursement` transaction created when marking paid. | Medium | Build in next iteration |

---

### Owner Equity

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Owner contributions list | complete | `routes/owner_contributions.ts`, `pages/OwnerContributions.tsx` | Lists all contributions and draws. | Low | None |
| Create owner contribution | complete | `routes/owner_contributions.ts`, `pages/OwnerContributions.tsx` | Capital contribution and owner loan types. | Low | None |
| Owner draws | partial | `schema/owner_equity.ts` | DB column `contribution_type` includes `owner_draw`. No dedicated draw entry UI. | Medium | Add draw entry form |
| Owner reimbursements | partial | `routes/reimbursements.ts`, `pages/Reimbursements.tsx` | Create and mark paid. Waive and convert-to-contribution not fully implemented in UI. | Medium | Add waive/convert actions |

---

### Tax Reserve

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Tax reserve summary | complete | `routes/tax_reserve.ts`, `pages/TaxReserve.tsx` | Shows operating vs reserve balances per entity. | Low | None |
| Tax reserve rules | complete | `routes/tax_reserve.ts` — `/rules` | Create percentage-based set-aside rules. | Low | Add edit/delete rule |
| Suggest transfer | complete | `routes/tax_reserve.ts` — `/suggest-transfer` | Returns estimated transfer amount based on rules. Advisory only. | Low | None |
| Automatic transfer recording | not started | — | Suggestion must be manually recorded as a transaction. | Low | Could add one-click record from suggestion |

---

### Evidence Vault

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Evidence metadata records | complete | `routes/documents.ts`, `pages/Evidence.tsx` | Create, list, update. All types supported. | Low | None |
| File path metadata | complete | `schema/documents.ts` | `file_path` is a text field. No upload/serving. | Low | None |
| Actual file upload | not started | — | No multipart endpoint. No file serving route. | High | Add `/api/documents/:id/upload` and `/file` endpoints |
| Evidence linked to transaction | complete | `schema/documents.ts` — `transaction_id` FK | Link exists in DB and form. | Low | None |
| Missing evidence flag | complete | `routes/dashboard.ts` | Dashboard summary includes `missing_evidence_count` per entity. | Low | None |

---

### Statements & Reconciliation

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Statement creation | complete | `routes/statements.ts`, `pages/Statements.tsx` | Header record per account per period. | Low | None |
| Statement line entry | complete | `routes/statements.ts`, `pages/Statements.tsx` | Add lines manually. | Low | None |
| Delete statement | complete | `routes/statements.ts` — DELETE with 409 guard | Blocked if any lines are matched. | Low | None |
| Manual line matching | complete | `routes/statements.ts` — `/match`, `pages/Statements.tsx` | Link line to transaction. | Low | None |
| Auto-matching | not started | — | No fuzzy date/amount auto-match. All matching is manual. | Medium | Add auto-match by amount + date ± 2 days |
| Ignore / needs_review status | complete | `routes/statements.ts` — `updateStatementLine`, `pages/Statements.tsx` | Line status can be updated. | Low | None |

---

### Monthly Close

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Close period | complete | `routes/monthly_close.ts`, `pages/MonthlyClose.tsx` | Creates close period record. Status transitions. | Low | None |
| Closed period edit guard | complete | `routes/transactions.ts`, `routes/monthly_close.ts` | 409 returned if transaction date is in a closed period. | Low | None |
| Correction memo | complete | `schema/monthly_close.ts`, `pages/MonthlyClose.tsx` | Field on close record. Required when re-editing closed period. | Low | None |
| Entity-level close checklist | complete | `pages/MonthlyClose.tsx` | Visual checklist per entity. Not enforced — honor system. | Low | Could make checklist enforcement stricter |

---

### Exports

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Export all transactions | complete | `routes/exports.ts`, `pages/Exports.tsx` | Client-side CSV from `/api/exports/transactions`. | Low | None |
| Expenses by entity | complete | `routes/exports.ts`, `pages/Exports.tsx` | Filtered export. | Low | None |
| Expenses by category | needs verification | `routes/exports.ts` | Route exists; verify category grouping is correct. | Medium | Manual test |
| Owner contributions | complete | `routes/exports.ts` | Contributions and loan records. | Low | None |
| Reimbursements | complete | `routes/exports.ts` | All reimbursement records and status. | Low | None |
| Intercompany balances | complete | `routes/exports.ts` | All payable/receivable records. | Low | None |
| Tax reserve activity | needs verification | `routes/exports.ts` | Route exists; verify tax reserve transactions are captured. | Medium | Manual test |
| Document index | complete | `routes/exports.ts` | All evidence metadata records. | Low | None |
| Personal / non-deductible log | needs verification | `routes/exports.ts` | Route exists; verify Personal allocations are captured. | Medium | Manual test |
| Monthly close summary | complete | `routes/exports.ts` | Closed periods with correction memos. | Low | None |
| Statement reconciliation summary | needs verification | `routes/exports.ts` | Route exists; verify matched/unmatched lines appear. | Medium | Manual test |

---

### Dashboard

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Entity financial summary cards | complete | `routes/dashboard.ts`, `pages/Dashboard.tsx` | True available cash, operating vs reserve, intercompany summary. | Low | None |
| Pending reimbursements total | complete | `routes/dashboard.ts` | Shown in header. | Low | None |
| Open intercompany total | complete | `routes/dashboard.ts` | Shown in header. | Low | None |
| Missing evidence count | complete | `routes/dashboard.ts` | Per entity count on card. | Low | None |
| Unreconciled transaction count | complete | `routes/dashboard.ts` | Per entity count on card. | Low | None |
| Monthly close status | complete | `routes/dashboard.ts`, `pages/Dashboard.tsx` | Status badge per entity. | Low | None |

---

### Infrastructure & Reliability

| Feature | Status | Implemented In | Notes | Risk | Next Action |
|---|---|---|---|---|---|
| Entity theming (colors) | complete | `schema/entities.ts`, `pages/Dashboard.tsx`, `pages/MonthlyClose.tsx` | `primary_color` hex on entity drives card styling. | Low | None |
| Security / data safety | complete | Multiple routes | Soft-delete, 409 guards, UUID validation, Zod validation, file path sanitization. | Low | None |
| Audit log (DB table) | partial | `schema/audit_log.ts`, `lib/audit.ts` | Persistent log exists; coverage is not yet complete for every financial mutation. | Medium | Expand audit coverage and add viewer UI |
| Backup / restore control center | complete | `lib/backup`, `routes/backups.ts`, `pages/Backups.tsx` | AES-256-GCM database + evidence packages, automatic verification, clean-database drill, guarded restore. | Low | Add scheduled reminders later |
| Automated tests | partial | `auth.test.ts`, `lib/backup/src/index.test.ts` | Auth boundaries and encryption failure paths covered; broad accounting workflows remain. | High | Add integration tests for expense + allocation flow |
| Health check endpoint | complete | `routes/health.ts` — `GET /api/healthz` | Returns `{"status":"ok"}`. | Low | None |
