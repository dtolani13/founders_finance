# Troubleshooting — Founders Finance

> Common problems and how to fix them. Start with the most specific section that matches your symptom.

---

## Application Will Not Start

**Symptoms:** `pnpm run app:start` exits before reporting the application ready, or `app:status` reports an unhealthy service.

**Likely causes and fixes:**

| Cause | How to check | Fix |
|---|---|---|
| `DATABASE_URL` not set | Run `pnpm run app:doctor` | Add it to the root `.env` |
| PostgreSQL not running | Run `pnpm run app:doctor` | Correct the URL or let the launcher start `.local/pgdata` |
| Database does not exist | `psql $DATABASE_URL -c "\l"` — look for `founders_finance` | `createdb founders_finance` |
| Migrations not applied | `pnpm run db:migrate:status` | Create an encrypted backup, then run `pnpm run db:migrate` |
| Port conflict | `Get-NetTCPConnection -LocalPort 5175,8081 -ErrorAction SilentlyContinue` | Stop the conflicting application, then run `pnpm run app:restart` |
| Build or runtime error | Read `.local/runtime/api.log` and `.local/runtime/web.log` | Correct the first reported error, then restart |

Start with:

```powershell
pnpm run app:doctor
pnpm run app:status
Get-Content .local/runtime/api.log -Tail 80
Get-Content .local/runtime/web.log -Tail 80
```

---

## Database Connection Fails

**Symptoms:** API starts but every request returns 500. Logs show a connection error.

**Check:**

```bash
psql $DATABASE_URL -c "SELECT 1"
```

If this fails:
- Connection string is wrong — verify host, port, user, password, database name
- PostgreSQL is not accepting connections — check `pg_hba.conf` for local connections
- For local dev: the database may have been reset — check PostgreSQL administration tools

**Fix:** Verify `DATABASE_URL` in local environment variables or `.env`. Ensure it matches the actual running PostgreSQL instance.

---

## Database Migration Fails

**Symptoms:** `pnpm run db:migrate` or `pnpm run db:migrate:status` errors out.

**Likely causes:**

| Error | Cause | Fix |
|---|---|---|
| Baseline mismatch | An existing untracked database differs from the committed baseline | Stop and compare the reported columns; do not force adoption |
| Constraint creation fails | Existing rows violate a new integrity rule | Correct the reported data in a documented transaction, then retry |
| Migration remains pending | The migration transaction rolled back | Read the first database error, correct its cause, and rerun status/migrate |
| Connection refused | PostgreSQL not running | Start PostgreSQL |

**Safe approach for development:** If the database has no important data, drop it and recreate:

```bash
dropdb founders_finance
createdb founders_finance
pnpm run db:migrate
```

**For production data:** Never drop or patch the schema manually. Restore from the pre-migration backup if needed, correct the migration in source, and rerun the disposable acceptance drill. See [Database Migrations](DATABASE_MIGRATIONS.md).

---

## Web App Cannot Reach The API

**Symptoms:** Page loads but all data shows empty or "Error loading data". Browser console shows failed `/api/*` requests.

**Check in order:**

1. Run `pnpm run app:status`.
2. Check the application health route:
   ```powershell
   Invoke-RestMethod http://127.0.0.1:5175/api/healthz
   ```
3. Read `.local/runtime/api.log` and `.local/runtime/web.log`.
4. Confirm application code uses relative `/api/...` URLs.
5. Run `pnpm run app:restart` after correcting the cause.

When the API is unavailable, the owner boundary shows a secure-service-unavailable alert. It must not report a successful mutation while the API is offline.

---

## Environment Variable Missing

**Symptoms:** Startup error mentioning a missing variable; or sessions fail silently.

**Required variables:**

| Variable | Where to set | What it does |
|---|---|---|
| `DATABASE_URL` | Root `.env` | PostgreSQL connection |
| `SESSION_SECRET` | Root `.env` | Server session protection; at least 32 characters |
| `EVIDENCE_STORAGE_ROOT` | Root `.env` | Private evidence directory |
| `BACKUP_STORAGE_ROOT` | Root `.env` | Encrypted backup directory |

`API_PORT` and `WEB_PORT` are optional launcher overrides. Normal local use defaults to API `8081` and web `5175`.

**Generating a session secret:**
```bash
openssl rand -hex 32
```

---

## Transaction Will Not Save

**Symptoms:** Submitting a transaction or expense form returns an error.

**Check:**

1. **Validation error (400):** The form should show the specific field that failed. Common issues:
   - Amount is zero or negative
   - Date is missing or in wrong format
   - Required entity or account not selected
   - Description is empty

2. **Closed period (409):** The transaction date falls in a closed monthly close period. Either change the date or reopen the period (add a correction memo).

3. **Network error:** API server is not running. Check `/api/healthz`.

4. Check browser Network tab → the failing request → Response tab for the error message.

---

## Allocation Total Mismatch

**Symptoms:** Expense form shows "Allocations must total 100%" or similar error.

**Cause:** Allocation rows do not add up to the full transaction amount (either by percentage or dollar amount).

**Fix:**
- Review each allocation row
- Percentages must sum to exactly 100%
- Dollar amounts must sum to exactly the total expense amount
- Floating point rounding: if you get 99.99% due to rounding, adjust one row by 0.01%

**Common mistake:** Forgetting to include the Personal / Founder allocation. If the total is $100 and you have SM $40 and RCL $40, you must explicitly add Personal $20 — not leave it blank.

---

## Intercompany Balance Did Not Appear

**Symptoms:** Cross-entity allocation was submitted but the Intercompany page shows no new balance.

**Check:**

1. Were the allocations actually submitted? Go to Transactions and find the expense — do the allocation lines appear?
2. Were both entities different? Allocations within the same entity do not create intercompany entries.
3. Did the Personal / Founder allocation create a balance? Personal allocations do not create intercompany entries by design.
4. Check the API server logs for errors during the allocation save.

**Fix:** If allocation rows were saved but no intercompany link was created, check `artifacts/api-server/src/routes/expenses.ts` — the `creates_intercompany_balance` flag on each allocation row controls this. It should be `true` when `target_entity_id !== paying_entity_id` (and target is not Personal).

---

## Dashboard Shows Zero

**Symptoms:** Dashboard loads but all balances show $0.00.

**Check in order:**

1. Is the database empty? Go to Transactions — are any transactions listed?
   - If empty: enter some test transactions and re-check
   - If transactions exist: continue

2. Are transactions in `posted` status? Draft transactions may not be included in dashboard calculations. Check `GET /api/transactions` and look at the `status` field.

3. Is the API returning real data? Check browser Network tab → `GET /api/dashboard/summary` → Response.

4. Check the API server logs for errors in the dashboard route handler.

---

## Export Is Empty

**Symptoms:** Export CSV downloads but contains only headers, no data rows.

**Likely causes:**

| Cause | Fix |
|---|---|
| No transactions in the database | Enter transactions first |
| Filters are too restrictive | Clear entity/period filters and try "All Entities", "All Periods" |
| Transactions are in draft status | Post transactions before exporting |
| Wrong export type selected | Try "All Transactions" first — it is the broadest |

**Note:** The `all_transactions` export includes all posted transactions with no entity filter by default. If it is empty, the database genuinely has no posted transactions.

---

## Statement Line Will Not Match

**Symptoms:** Clicking "Match" on a statement line fails or shows no matching transactions.

**Check:**

1. Does the transaction you want to match exist and is it in `posted` status? Draft transactions cannot be matched.
2. Is the transaction for the same entity as the statement? Cross-entity matching is not supported.
3. Is the amount correct? The match is manual — amount tolerance is not enforced, but verify you are selecting the correct transaction.
4. Has the line already been matched? A line can only be matched once. Check if it is already in `matched` status.

**Fix:** If the transaction does not exist, create it first. If the transaction is in draft, post it first.

---

## Evidence Record Missing

**Symptoms:** Transaction shows "Missing Evidence" badge on dashboard or evidence list.

**What it means:** The transaction has no linked document record in the Evidence Vault.

**Fix:**

1. Go to **Evidence**
2. Add evidence:
   - Link it to the transaction
   - Type: `receipt`, `invoice`, `screenshot`, or `note`
   - Choose the actual file when it is available
   - Add the company, period, and description
3. If the receipt is unavailable, create a metadata-only `note` explaining what is missing and why

The "Missing Evidence" flag clears once any document record is linked to the transaction.

---

## Monthly Close Blocks Edit

**Symptoms:** Attempting to edit a transaction returns 409. Error message mentions "closed period."

**What is happening:** The transaction's date falls in a period that has been closed via Monthly Close.

**Fix:**

1. Go to **Monthly Close**
2. Find the closed period for the company and month
3. Select **Reopen**, enter the required correction memo, and confirm
4. Make the correction to the transaction
5. Complete the checklist again and close the period

---

## Frontend Build Fails

**Symptoms:** `pnpm run build` exits with errors.

**Fix in order:**

1. Run typecheck first to get clear error messages:
   ```bash
   pnpm run typecheck
   ```

2. If generated files are stale (errors in `api-client-react` or `api-zod`):
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   pnpm run typecheck
   ```

3. If Tailwind CSS errors: check `index.css` for invalid `@apply` directives or unknown utility classes.

4. If a page component has type errors: fix them in the page file — do not edit generated files.

The four UI source-map location warnings printed by Vite are non-blocking. TypeScript errors and build failures are not accepted.

---

## Automated Tests Fail

**Symptoms:** Test runner reports failures.

Run the complete root suite and preserve the first failing assertion:

```powershell
pnpm test
pnpm run typecheck
```

The release baseline is 32 passing tests. Database-backed tests create and remove isolated databases; they require a reachable PostgreSQL server with permission to create temporary databases. Do not point a failing test at a different production database as a workaround.
