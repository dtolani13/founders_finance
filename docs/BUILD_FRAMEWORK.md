# Build Framework

This document describes the architectural decisions, conventions, and layering used in the Founders Finance.

## Architecture Overview

```
Browser (React SPA)
    │
    │  HTTP / JSON  (proxied via local reverse proxy)
    ▼
Express API  (/api/*)
    │
    │  Drizzle ORM queries
    ▼
PostgreSQL Database
```

The frontend and backend are completely separate artifacts sharing only the generated API contract. They never import each other's source code.

## OpenAPI-First Workflow

The API contract lives in `lib/api-spec/openapi.yaml`. All changes to the API surface must start there.

```
Edit openapi.yaml
      │
      ▼
pnpm --filter @workspace/api-spec run codegen
      │
      ├─► lib/api-client-react/src/generated/api.ts   (React Query hooks)
      └─► lib/api-zod/src/generated/                  (Zod schemas)
```

**Never edit generated files.** They are overwritten on every codegen run.

The backend uses the Zod schemas from `@workspace/api-zod` to validate request bodies. The frontend uses the React Query hooks from `@workspace/api-client-react` for all data fetching and mutation.

## Backend (api-server)

- Framework: Express 4
- Language: TypeScript, compiled with esbuild for dev and tsc for type-checking
- Port: read from `process.env.PORT` at startup
- Base path: all routes are mounted under `/api`
- Logging: structured JSON via `pino`. Use `req.log` inside route handlers, the singleton `logger` elsewhere. **No `console.log`.**
- Validation: Zod schemas on all `POST`/`PUT` request bodies
- UUID guard: all `:id` params are validated as UUIDs before any Drizzle query (returns 404, not 500)

### Route Structure

```
src/routes/
  index.ts              — mounts all sub-routers
  entities.ts           — /entities
  accounts.ts           — /accounts
  transactions.ts       — /transactions
  expenses.ts           — /expenses/manual
  allocation_presets.ts — /allocation-presets
  categories.ts         — /categories
  vendors.ts            — /vendors
  statements.ts         — /statements, /statement-lines (both mounted on statementsRouter)
  documents.ts          — /documents
  dashboard.ts          — /dashboard
  exports.ts            — /exports/:type
  monthly_close.ts      — /monthly-close
  intercompany.ts       — /intercompany
  reimbursements.ts     — /reimbursements
  tax_reserve.ts        — /tax-reserve
  owner_contributions.ts— /owner-contributions
  health.ts             — /healthz
```

### Drizzle Rules

- Always use `inArray(col, array)` from `drizzle-orm` — never `sql\`col = ANY(${array})\``.
- Numeric columns stored as `text`/`numeric` in Postgres — always `parseFloat(String(row.col))` when doing arithmetic.

## Frontend (founders-finance)

- Framework: React 19 + Vite
- Language: TypeScript
- Styling: Tailwind CSS v4 + shadcn/ui components
- Routing: Wouter (lightweight, path-based)
- Data: React Query via generated hooks from `@workspace/api-client-react`
- Forms: React Hook Form + Zod resolvers

### Page List

| Route | Page | Purpose |
|---|---|---|
| `/` | Dashboard | Unreconciled count, entity snapshots, recent transactions |
| `/transactions` | Transactions | Full transaction ledger with filters |
| `/expenses/new` | NewExpense | Record a business expense with multi-entity allocation |
| `/statements` | Statements | Bank statement upload, line management, reconciliation |
| `/allocations` | Allocations | View expense allocations |
| `/intercompany` | Intercompany | Cross-entity balance tracking |
| `/reimbursements` | Reimbursements | Pending and settled reimbursement requests |
| `/owner-contributions` | OwnerContributions | Capital contributions and draws |
| `/tax-reserve` | TaxReserve | Tax reserve rules and transfer suggestions |
| `/monthly-close` | MonthlyClose | Per-entity period checklist and close/reopen |
| `/evidence` | Evidence | Document vault with status filters |
| `/exports` | Exports | CSV export grid |
| `/settings` | Settings | Entity display names, colors, tax notes |

### Conventions

- **Radix `SelectItem` values** must never be `""`. Use `"__all__"` or `"__none__"` as sentinels for "no filter" states.
- **`formatDate`** in `lib/utils.ts` detects ISO timestamps via `.includes("T")` before appending `T00:00:00` to avoid timezone drift on date-only strings.
- **`entityBadgeStyle(color)`** returns an inline style object for entity color badges — pass the `primary_color` string.
- **Query key factories** (`getListXQueryKey(params)`) must be passed explicitly to `useQuery` options for correct cache invalidation.

## Database

- ORM: Drizzle ORM with `drizzle-zod` for schema-derived Zod types
- Migrations: schema-push only (`drizzle-kit push`) — no migration files
- Connection: single `Pool` instance in `lib/db/src/index.ts`, shared across all routes

## Shared Libraries

| Package | Purpose |
|---|---|
| `@workspace/db` | Drizzle schema, types, and db connection |
| `@workspace/api-spec` | OpenAPI spec and codegen config |
| `@workspace/api-client-react` | Generated React Query hooks |
| `@workspace/api-zod` | Generated Zod validation schemas |

## Proxy & Routing

All traffic goes through a local reverse proxy. The API is accessible at `/api/*` and the SPA at `/`. Services bind to their individual `$PORT` env vars; the proxy routes by path prefix.

In application code, use relative URLs (e.g. `/api/transactions`). Do not hardcode ports.
