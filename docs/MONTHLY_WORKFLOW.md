# Monthly Workflow — Founders Finance

> Run this checklist at the end of each month (or beginning of the next). Complete each section in order. Do not close the month until all sections are done.

---

## Before You Begin

- [ ] Confirm which month you are closing (e.g., "April 2026")
- [ ] Gather bank statements for all active accounts:
  - SM operating checking
  - SM tax reserve savings
  - RCL operating checking
  - RCL tax reserve savings
  - Any credit cards used for business
- [ ] Gather all receipts, invoices, and subscription confirmations for the month
- [ ] Gather records of any expenses paid from personal accounts on behalf of either LLC
- [ ] Note any intercompany payments made during the month

---

## Section 1 — Enter Revenue (if any)

For each LLC that received revenue this month:

1. Go to **Transactions → Create** (or use the transaction form)
2. Transaction type: `revenue`
3. Date: date payment was received
4. Amount: amount received
5. Entity: the receiving LLC
6. Description: client name or project code
7. Attach evidence: bank deposit confirmation or invoice

> If no revenue this month, skip this section.

---

## Section 2 — Tax Reserve Transfer

For each LLC with a tax reserve rule:

1. Go to **Tax Reserve**
2. Review the suggested transfer amount for the month
3. If the suggestion looks reasonable, record a `transfer` transaction:
   - From: operating checking account
   - To: tax reserve account
   - Amount: suggested amount (or your adjusted figure)
   - Description: "Tax reserve set-aside — [Month Year]"
4. Do **not** record this as an expense — it is a transfer, not a cost

> **Reminder: Estimated tax set-aside only. This is not calculated tax owed.**
> Always verify with your accountant before making any actual tax payments.

---

## Section 3 — Enter Business Expenses

For each business expense paid by a company account this month:

1. Go to **New Expense**
2. Fill in: date, amount, description, vendor, category, business purpose
3. Select paying entity and paying account
4. If 100% one entity's expense: submit without allocations
5. If shared or has a personal component: continue to Section 4

**Common recurring expenses to enter:**
- Software subscriptions (Adobe CC, GitHub, 1Password, cloud IDE)
- Cloud infrastructure (AWS, OpenAI API)
- Internet and phone (if business-paid)
- Professional services
- Equipment and hardware

---

## Section 4 — Allocate Shared Expenses

For any expense that spans multiple entities or has a personal component:

1. After creating the expense, add allocation rows
2. Enter each entity's share — by percentage or dollar amount
3. Confirm the total equals 100% (the form enforces this)
4. If any allocation goes to Personal / Founder: the amber warning is expected and correct
5. Submit — intercompany balances are created automatically

**Common allocation scenarios:**
- Phone/internet: personal 20%, SM 40%, RCL 40% (adjust to your actual usage)
- Shared SaaS tools: SM 50%, RCL 50%
- AI API usage: allocate by actual project attribution if known, or use a standing preset

> If you have saved allocation presets, select the preset and verify the amounts are still correct for this month before submitting.

---

## Section 5 — Enter Personally-Paid Expenses

For any business expense paid from a personal account or personal card:

1. Go to **New Expense**
2. Transaction type: `owner_reimbursement`
3. Enter the expense details normally
4. The app records this as a reimbursement request (pending status)
5. Attach evidence: the receipt or invoice

Do this even if you plan to waive the reimbursement. The record proves the expense was real and business-related.

---

## Section 6 — Review Intercompany Balances

1. Go to **Intercompany**
2. Review all pending balances
3. For each balance that should be settled this month:
   - Confirm the receiving entity has made or will make the transfer
   - Record an `intercompany_reimbursement` transaction when money moves
   - Mark the balance as paid
4. Balances that will not be settled this month: leave as pending (they carry over)

---

## Section 7 — Review Owner Reimbursements

1. Go to **Reimbursements**
2. Review all pending reimbursement requests
3. For each request that has been paid:
   - Click Mark Paid, enter payment date
4. For requests you are waiving:
   - Mark as waived (or convert to contribution if appropriate)
5. Leave genuinely pending items as pending — they carry over

---

## Section 8 — Upload / Record Evidence Metadata

For every significant transaction this month:

1. Go to **Evidence**
2. Create a document record for each transaction that lacks one:
   - Type: `receipt`, `invoice`, `screenshot`, or `subscription_receipt`
   - File path: path relative to the `evidence/` directory (e.g., `evidence/rcl/2026-05/openai-api-may.png`)
   - Linked transaction: select the transaction
3. If you do not have the file yet: create a `note` type record explaining what is missing
4. Place the actual files in the `evidence/` directory on the host

> The app does not upload or store files. You are responsible for placing files in the evidence directory and keeping the `file_path` field accurate.

---

## Section 9 — Enter Statement Lines

For each bank and credit card statement for the month:

1. Go to **Statements**
2. Create a statement record: entity, account, period month
3. Add each line from the statement: date, description, amount
4. Do this for all active accounts:
   - SM operating checking
   - SM tax reserve savings (if activity)
   - RCL operating checking
   - RCL tax reserve savings (if activity)
   - Credit cards

> You can enter statements electronically by copying line items from your bank's online portal. No import automation exists — this is manual.

---

## Section 10 — Reconcile Statement Lines

For each statement created in Section 9:

1. Go to **Statements**, select the statement
2. For each line, click **Match** and select the corresponding posted transaction
3. If a line has no transaction yet: go enter the missing transaction first, then return to match
4. If a line is a duplicate or already recorded elsewhere: mark as `ignored`
5. Continue until all lines are matched or intentionally ignored

**Goal: zero unmatched lines before closing the month.**

If a line cannot be matched and you do not know what it is:
- Mark it `needs_review`
- Create a `note` evidence record explaining it
- Do not close the month until you have resolved it or accepted the open item

---

## Section 11 — Review Dashboard

1. Go to **Dashboard**
2. Verify:
   - True Available Cash looks correct for each entity
   - Operating cash and tax reserve are shown separately
   - Intercompany balances match what you expect
   - No obvious missing transactions (e.g., a large AWS bill that is not reflected)
3. If numbers look wrong: investigate before closing

---

## Section 12 — Close the Month

1. Go to **Monthly Close**
2. For each entity (SM and RCL):
   - Review the checklist items
   - Confirm all items are complete
   - Click **Close Period**
3. If you close and later discover an error:
   - The app will prompt for a **correction memo** when you attempt to edit a closed-period record
   - Document the correction clearly: what changed, why, and when

> Personal / Founder entity typically does not have its own close period unless you are formally tracking it.

---

## Section 13 — Export Records

After closing, generate monthly exports for your records:

1. Go to **Exports**
2. Run and download each relevant report for the month:
   - All Transactions (filtered to the closed month)
   - Expenses by Entity
   - Expenses by Category
   - Owner Contributions (if any this month)
   - Reimbursements
   - Intercompany Balances
   - Tax Reserve Activity
   - Document Index
   - Personal/Non-Deductible Log
   - Monthly Close Summary
3. Save all exports in an organized archive (e.g., `exports/2026-05/`)

---

## Section 14 — Backup

After exporting, back up the following:

1. **Database:** `pg_dump $DATABASE_URL > backups/founders_finance_2026-05.sql`
2. **Evidence directory:** `tar -czf backups/evidence_2026-05.tar.gz evidence/`
3. **Exports folder:** Copy `exports/2026-05/` to a backup location (cloud storage, external drive)

See `docs/BACKUP_AND_RESTORE.md` for full backup instructions.

---

## Monthly Close Completion Criteria

You may consider the month closed when:

- [ ] All revenue entered
- [ ] Tax reserve transfer recorded
- [ ] All expenses entered and allocated
- [ ] All personally-paid expenses recorded as reimbursements
- [ ] Intercompany balances reviewed
- [ ] Reimbursements reviewed
- [ ] Evidence records created for all significant transactions
- [ ] Statement lines entered for all accounts
- [ ] All statement lines matched or intentionally ignored
- [ ] Dashboard reviewed and numbers look correct
- [ ] Monthly close period closed for SM and RCL
- [ ] Exports downloaded and archived
- [ ] Database and evidence backup completed
