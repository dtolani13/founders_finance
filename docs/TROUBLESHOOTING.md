# Troubleshooting — Founders Finance

> Common problems and how to fix them. Start with the most specific section that matches your symptom.

---

## Backend Will Not Start

**Symptoms:** API server workflow shows an error immediately on start. No response from `/api/healthz`.

**Likely causes and fixes:**

| Cause | How to check | Fix |
|---|---|---|
| `DATABASE_URL` not set | `echo $DATABASE_URL` — should print a postgres URL | Add to local environment variables or `.env` |
| PostgreSQL not running | `pg_isready -d $DATABASE_URL` | Start PostgreSQL service |
| Database does not exist | `psql $DATABASE_URL -c "\l"` — look for `founders_finance` | `createdb founders_finance` |
| Schema not pushed | `psql $DATABASE_URL -c "\dt"` — tables should exist | `pnpm --filter @workspace/db run push` |
| Port conflict | `lsof -i :$PORT` | Kill the conflicting process |
| Syntax error in route file | Check workflow console logs for `SyntaxError` or `TypeError` | Fix the TypeScript error, restart |

**Always check the workflow console logs first** — the error message will usually tell you exactly what failed.

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

## Migrations Fail (Schema Push Fails)

**Symptoms:** `pnpm --filter @workspace/db run push` errors out.

**Likely causes:**

| Error | Cause | Fix |
|---|---|---|
| `column already exists` | Schema has a column that conflicts with an existing DB column | Check the schema file vs actual table with `\d tablename` in psql |
| `relation does not exist` | Table referenced in schema does not exist in DB | Re-run push; if it still fails, check for typos in table name |
| `cannot drop column with foreign key` | Trying to remove a column that other tables reference | Drop the foreign key constraint first in psql, then push |
| Connection refused | PostgreSQL not running | Start PostgreSQL |

**Safe approach for development:** If the database has no important data, drop it and recreate:

```bash
dropdb founders_finance
createdb founders_finance
pnpm --filter @workspace/db run push
```

**For production data:** Never drop — write a manual ALTER TABLE migration instead.

---

## Frontend Cannot Reach Backend

**Symptoms:** Page loads but all data shows empty or "Error loading data". Browser console shows failed `/api/*` requests.

**Check in order:**

1. Is the API server running?
   ```bash
   curl http://localhost:80/api/healthz
   ```
2. Is the local reverse proxy routing correctly? Check `local service config` in `artifacts/api-server/local-service-config/` — the `/api` path must be configured there.
3. Is the frontend making requests to the correct base path? All API calls should use relative URLs (`/api/...`), not hardcoded ports.
4. Check browser Network tab for the failing request — look at the actual URL and response body.

**Most common fix:** Restart the API Server workflow. If the server crashed, the proxy continues to route `/api` but gets no response.

---

## Environment Variable Missing

**Symptoms:** Startup error mentioning a missing variable; or sessions fail silently.

**Required variables:**

| Variable | Where to set | What it does |
|---|---|---|
| `DATABASE_URL` | local environment variables or `.env` | Database connection |
| `SESSION_SECRET` | local environment variables or `.env` | Express session signing |
| `PORT` | Set manually for local dev | HTTP port |

**For local dev:** Go to the Secrets panel and verify all three are present. `PORT` is injected automatically — do not set it manually.

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
2. Create a document record:
   - Link it to the transaction
   - Type: `receipt`, `invoice`, `screenshot`, or `note`
   - File path: path to the actual file (or a description if the file is pending)
3. If you cannot find the receipt: create a `note` type record explaining that the receipt is missing and why

The "Missing Evidence" flag clears once any document record is linked to the transaction.

---

## Monthly Close Blocks Edit

**Symptoms:** Attempting to edit a transaction returns 409. Error message mentions "closed period."

**What is happening:** The transaction's date falls in a period that has been closed via Monthly Close.

**Fix:**

1. Go to **Monthly Close**
2. Find the closed period for the entity and month
3. Click to edit the period record and add a correction memo explaining the change
4. Make the correction to the transaction
5. The correction memo serves as your audit trail

**Do not:** Avoid closing periods if you frequently need to edit past transactions. Close only when you are confident the period is complete.

---

## Frontend Build Fails

**Symptoms:** `pnpm --filter @workspace/founders-finance run build` exits with errors.

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

**Pre-existing `TS7030` errors** (not all code paths return a value) in some route files are accepted and will not block the build. Any new errors should be resolved.

---

## Backend Tests Fail

**Symptoms:** Test runner reports failures.

**Current state:** There are no automated tests in this project. All verification is manual.

**Manual verification procedure:** Follow the canonical test in `docs/OPERATOR_MANUAL.md`, Section 17 — Verification Flow.

To catch type errors:
```bash
pnpm run typecheck
```

If you add tests in the future: place them in `artifacts/api-server/src/__tests__/` and add a `test` script to the package.json.
