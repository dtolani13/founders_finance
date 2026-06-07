# Handoff Packet — Founders Finance

> This document gives an agent, developer, or accountant everything needed to understand, verify, and continue the app without losing context.

---

## 1. Project Snapshot

| Field | Value |
|---|---|
| Purpose | Private single-founder ledger for three entities: SM, RCL, Personal |
| Runtime | developer tools (private deployment) or any Node.js + PostgreSQL host |
| Users | One — the founder. No login screen. No multi-user. |
| Data | Live PostgreSQL — real financial data, no mock data |
| Frontend | Vite dev server, served from `artifacts/founders-finance` |
| Backend | Express REST API, served from `artifacts/api-server` |
| Proxy | local reverse proxy routes `/api` → API server, `/` → frontend |

### Current entities

| Display Name | Short Code | Type | Primary Color |
|---|---|---|---|
| Studio Maestro LLC | SM | LLC | Purple/violet |
| Recursive Chaos Labs LLC | RCL | LLC | Teal/emerald |
| Personal / Founder | PERSONAL | Individual | Gray |

### Core modules

Entities → Accounts → Transactions → Allocations → Intercompany → Reimbursements → Tax Reserve → Evidence → Statements → Monthly Close → Exports

---

## 2. Architecture Overview

```
Browser
  └── React SPA (Vite)
        └── React Query hooks (auto-generated from OpenAPI)
              └── /api/* → local reverse proxy
                    └── Express REST API (Node.js + TypeScript)
                          └── Drizzle ORM
                                └── PostgreSQL
```

### Frontend (`artifacts/founders-finance`)

- React 19 + Vite + TypeScript + Tailwind CSS v4
- shadcn/ui + Radix UI for component primitives
- React Query for all data fetching (auto-generated hooks from OpenAPI spec)
- Zod schemas for runtime validation (auto-generated from OpenAPI spec)
- wouter for client-side routing

### Backend (`artifacts/api-server`)

- Node.js + Express + TypeScript
- Drizzle ORM for database access (type-safe, schema-first)
- Zod for request validation on all POST/PUT routes
- pino logger (`req.log` in route handlers, `logger` singleton elsewhere)
- Structured error responses with HTTP status codes

### Database

- PostgreSQL (locally provisioned, accessed via `DATABASE_URL`)
- Schema managed by Drizzle ORM in `lib/db/src/schema/`
- Schema pushes via `pnpm --filter @workspace/db run push` (no migration files)

### API contract

- OpenAPI 3.0 spec at `lib/api-spec/openapi.yaml`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
- Generates React Query hooks → `lib/api-client-react/src/generated/`
- Generates Zod schemas → `lib/api-zod/src/generated/`
- **Do not edit generated files manually**

### Evidence path model

- `documents.file_path` is a string metadata field (e.g., `evidence/rcl/2026-05/openai.png`)
- The app does not upload, store, or serve files
- Actual files live on the host filesystem in an `evidence/` directory
- The app's Evidence Vault is a metadata index, not a file server

### Exports

- All CSV exports are generated client-side in the browser
- The API returns JSON; the frontend converts to CSV using a utility function
- No server-side streaming or bulk export endpoint

---

## 3. Folder Structure

```
workspace/
├── artifacts/
│   ├── api-server/                 — Express REST API
│   │   ├── src/
│   │   │   ├── app.ts              — Express app setup, middleware, route mounting
│   │   │   ├── index.ts            — Server entrypoint, binds to $PORT
│   │   │   ├── lib/
│   │   │   │   └── logger.ts       — Pino logger singleton
│   │   │   └── routes/
│   │   │       ├── index.ts        — Route registration
│   │   │       ├── accounts.ts
│   │   │       ├── allocation_presets.ts
│   │   │       ├── categories.ts
│   │   │       ├── dashboard.ts
│   │   │       ├── documents.ts
│   │   │       ├── entities.ts
│   │   │       ├── expenses.ts
│   │   │       ├── exports.ts
│   │   │       ├── health.ts
│   │   │       ├── intercompany.ts
│   │   │       ├── monthly_close.ts
│   │   │       ├── owner_contributions.ts
│   │   │       ├── reimbursements.ts
│   │   │       ├── statements.ts
│   │   │       ├── tax_reserve.ts
│   │   │       ├── transactions.ts
│   │   │       └── vendors.ts
│   │   └── package.json
│   │
│   └── founders-finance/             — React frontend
│       ├── src/
│       │   ├── App.tsx             — Route definitions (wouter)
│       │   ├── main.tsx            — React entrypoint
│       │   ├── index.css           — Tailwind + CSS custom properties
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   │   └── AppLayout.tsx   — Sidebar + main layout shell
│       │   │   └── ui/             — shadcn/ui component library
│       │   ├── pages/
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Transactions.tsx
│       │   │   ├── NewExpense.tsx
│       │   │   ├── Allocations.tsx
│       │   │   ├── Intercompany.tsx
│       │   │   ├── OwnerContributions.tsx
│       │   │   ├── Reimbursements.tsx
│       │   │   ├── TaxReserve.tsx
│       │   │   ├── Evidence.tsx
│       │   │   ├── Statements.tsx
│       │   │   ├── MonthlyClose.tsx
│       │   │   ├── Exports.tsx
│       │   │   └── Settings.tsx
│       │   └── lib/
│       │       └── utils.ts        — formatCurrency, formatDate, cn()
│       └── package.json
│
├── lib/
│   ├── db/                         — Drizzle schema and DB client
│   │   └── src/
│   │       ├── index.ts            — DB connection export
│   │       └── schema/             — One file per table
│   ├── api-spec/                   — OpenAPI spec + Orval codegen config
│   │   └── openapi.yaml
│   ├── api-client-react/           — Generated React Query hooks (do not edit)
│   └── api-zod/                    — Generated Zod schemas (do not edit)
│
├── scripts/                        — Shared utility scripts
├── docs/                           — This documentation
├── evidence/                       — Evidence files (not tracked by git)
├── .env.example                    — Environment variable template
├── .gitignore
├── README.md
├── pnpm-workspace.yaml
└── package.json
```

---

## 4. Backend Overview

### Express app structure

`app.ts` sets up middleware (JSON body parsing, pino-http logging, CORS for developer tools proxy) and mounts all route modules under `/api`.

`index.ts` reads `$PORT` and starts the HTTP server.

### Route pattern

Every route module exports an Express `Router`. Routes follow REST conventions:

```
GET    /api/transactions           → list
POST   /api/transactions           → create
GET    /api/transactions/:id       → get one
PUT    /api/transactions/:id       → update
POST   /api/transactions/:id/post  → action
```

### Validation pattern

All POST and PUT handlers validate the request body against a Zod schema imported from `@workspace/api-zod`. Invalid requests return 400 with a structured error body.

UUID path parameters are validated before database queries — invalid UUIDs return 404 rather than a 500 database error.

### Error handling pattern

- 400 — validation failure
- 404 — record not found
- 409 — conflict (e.g., deleting a statement with matched lines, editing a closed period)
- 500 — unexpected server error (logged via pino, not exposed to client)

### Soft delete pattern

Transactions use soft delete (`deleted_at` timestamp). All list queries filter `deleted_at IS NULL`. Hard delete is not used for transactions.

### Logging

Use `req.log` inside route handlers. Use the `logger` singleton from `src/lib/logger.ts` in non-request code. Never use `console.log` in server code.

---

## 5. Frontend Overview

### Page routing

`App.tsx` uses wouter for client-side routing. Each route maps to a page component in `src/pages/`.

### Data fetching

All data fetching uses auto-generated React Query hooks from `@workspace/api-client-react`. These hooks wrap `fetch` calls to `/api/*` and handle loading/error/caching states. Do not write manual `fetch` calls in page components.

### API client pattern

```typescript
import { useListTransactions, getListTransactionsQueryKey } from "@workspace/api-client-react";

const { data, isLoading, error } = useListTransactions({
  query: { queryKey: getListTransactionsQueryKey() }
});
```

### Form pattern

Forms use `react-hook-form` with Zod resolver, submitting via mutation hooks from the API client.

### Entity theming

Entities have a `primary_color` hex value in the database. The dashboard entity cards use `borderTopColor` inline style with this color. The MonthlyClose entity badge uses `entityBadgeStyle()` to derive background and text colors from the primary color.

### Component library

`src/components/ui/` contains shadcn/ui components (Button, Card, Input, Select, Badge, Dialog, etc.). These components use CSS custom properties from `index.css` for theming. Do not edit the theme variables without understanding the cascade — `--border`, `--input`, and `--ring` affect all form elements globally.

---

## 6. Database Overview

All tables are in `lib/db/src/schema/`. The database uses PostgreSQL UUIDs as primary keys.

| Table | Purpose |
|---|---|
| `entities` | The three LLCs and Personal entity. Seeded at first run. |
| `accounts` | Bank accounts, credit cards, reserve accounts per entity. |
| `categories` | Expense categories (e.g., "Software", "AI/ML Infrastructure"). |
| `vendors` | Vendor registry — name, website, notes. |
| `transactions` | Master transaction record — date, type, description, total, status. |
| `transaction_lines` | Debit/credit lines for each transaction (double-entry support). |
| `expense_allocations` | Per-entity allocation rows for shared expenses. |
| `intercompany` | Payable/receivable records created by cross-entity allocations. |
| `reimbursements` | Founder-paid expense reimbursement requests. |
| `owner_equity` | Owner contribution and draw records. |
| `tax_reserve` | Tax reserve rules (percentage) and transfer records. |
| `documents` | Evidence metadata records linked to transactions. |
| `statements` | Statement header — period, entity, account. |
| `statements` (lines) | Individual statement line items. |
| `monthly_close` | Close period records per entity per month. |
| `allocation_presets` | Saved allocation splits for recurring expenses. |
| `audit_exports` | Log of export operations (timestamp, type, filters). |

---

## 7. Critical Design Decisions

### Why `transaction_lines` exist

The app supports double-entry bookkeeping. Every transaction can have multiple debit and credit lines. This allows the app to eventually enforce balanced entries and produce trial balances. Currently, the UI uses `expenses/manual` which abstracts the lines, but the underlying structure is double-entry ready.

### Why Personal / Founder is an entity

Treating Personal as an entity allows clean allocation of mixed-purpose expenses. Without it, you would either: (a) over-claim business deductions by making 100% of a shared expense a business expense, or (b) record a separate adjustment every time. Personal-as-entity is the correct accounting pattern.

### Why tax reserve is separate

Tax reserve funds are not available operating cash. Mixing them in the operating account balance creates a false picture of how much money is available to spend. The separate account enforces discipline and makes the reserve visible on the dashboard.

### Why intercompany balances are explicit

When RCL pays SM's share of an expense, that is a real economic event — RCL is owed money. Recording it explicitly creates a paper trail that proves entity separation and prevents the IRS from treating the entities as a single commingled operation.

### Why evidence metadata exists before OCR

Building a metadata model now (file path, type, linked transaction) is the right foundation even before automatic file parsing exists. When OCR is added later, it fills in the same fields. Starting with metadata-only means zero rework — just add the file-processing layer.

### Why this is not tax software

The app records facts (amounts paid, who paid, who benefited). Tax software applies tax law (deduction eligibility, depreciation schedules, self-employment rules, state apportionment). That requires licensed tax professionals and legal liability. This app deliberately stops at record-keeping.

---

## 8. Known Limitations

Honest current state. See `docs/KNOWN_LIMITATIONS.md` for full detail.

| Limitation | Impact | Mitigation |
|---|---|---|
| No bank sync | Transactions must be entered manually | Use statement lines for reconciliation |
| No OCR | Evidence is metadata only — no receipt parsing | File paths point to evidence directory you manage |
| No payroll | W-2, payroll tax, benefits not supported | Use separate payroll software |
| No tax filing | No returns, no schedules, no tax calculations | Export records for your accountant |
| No invoicing | No AR, no invoice generation | Use separate invoicing tool |
| No auto deduction advice | App records only; does not classify deductibility | Your accountant reviews exports |
| No accountant approval workflow | No review/approve state for transactions | Add a `needs_accountant_review` flag if needed |
| File upload is metadata-only | No file storage, no file serving | Maintain `evidence/` directory manually |
| Export CSV is client-side | Large datasets may be slow | Filter by entity/period before exporting |
| No automated tests | Regressions caught by typecheck and manual testing | Run `pnpm run typecheck` before every deploy |
| No audit log table | Changes not persisted beyond server logs | Use correction memos in monthly close |
| No multi-user auth | Single session, no roles | Keep deployment private |

---

## 9. Current Feature Status

See `docs/FEATURE_STATUS.md` for the full feature matrix with implementation details and risk levels.

---

## 10. How to Continue Development

### Safest next build steps

1. Add actual file upload to the Evidence Vault (store files in `evidence/`, serve via `/api/documents/:id/file`)
2. Add reimbursement waive and convert-to-contribution actions in the UI
3. Add statement line auto-matching (by date ± 2 days and exact amount)
4. Deepen export CSV completeness verification
5. Add a scheduled backup script

### What not to touch casually

- `lib/db/src/schema/` — Schema changes require a `pnpm --filter @workspace/db run push` and can destroy data if dropping columns
- `lib/api-spec/openapi.yaml` — Changes require `pnpm --filter @workspace/api-spec run codegen` to regenerate clients; mismatches cause silent type errors
- `artifacts/api-server/src/routes/expenses.ts` — Allocation and intercompany logic is coupled; test the canonical flow after any changes
- `index.css` CSS custom properties — `--border` and `--input` cascade globally; test all forms and components after changes

### What requires review before schema changes

- Any change to `transactions` or `transaction_lines` affects every module
- Adding columns to `expense_allocations` affects the intercompany creation logic
- Removing columns from `statements` or `monthly_close` affects guards (409 responses)

---

## 11. Verification Checklist for Future Agents

Run these checks in order after any significant change:

- [ ] `pnpm run typecheck` passes with no new errors
- [ ] API server starts and responds to `GET /api/healthz`
- [ ] Seed entities are present (`GET /api/entities` returns SM, RCL, PERSONAL)
- [ ] Manual expense entry works end-to-end (New Expense → submit)
- [ ] Allocation validation enforces 100% total
- [ ] Cross-entity allocation creates intercompany balance (visible on Intercompany page)
- [ ] Owner contribution creation works (Owner Contributions page)
- [ ] Dashboard shows real data (not zeros) matching database records
- [ ] Exports generate non-empty CSVs for "All Transactions"
- [ ] Frontend build completes: `pnpm --filter @workspace/founders-finance run build`
- [ ] Statement line can be created and matched to a transaction
- [ ] Monthly close period can be created and closed
- [ ] Closed period blocks edits with a 409 response
