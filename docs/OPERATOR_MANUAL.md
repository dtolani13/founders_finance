# Operator Manual — Founders Finance

> This is your complete operating reference. Read it once. Refer back to individual sections as needed.

---

## 1. What the App Is

Founders Finance is a private, single-user finance control system for a solo founder managing three legal entities. It tracks:

- Money movement within and between entities
- Entity separation (who paid, who benefited)
- Shared expense allocation with personal/non-deductible splits
- Owner contributions, draws, and reimbursements
- Intercompany balances (what one entity owes another)
- Tax reserve accounts (separate from operating cash)
- Evidence records (receipts, invoices, statements)
- Statement reconciliation
- Monthly close process
- CSV exports for accountant review

It runs locally or on a private deployment. There is no public access, no login screen, and no multi-user support by design.

---

## 2. What the App Is Not

| Not this | Reason |
|---|---|
| Tax filing software | It does not calculate tax owed or file returns |
| Legal or accounting advice | All figures are estimates and records only |
| Payroll | No employee pay, W-2, or payroll tax logic |
| Invoicing | No invoice generation or accounts receivable workflow |
| Bank sync | No Plaid, no automatic transaction import |
| OCR receipt scanner | Evidence is metadata-only; no file parsing |
| QuickBooks clone | Intentionally simpler and entity-separation focused |
| Multi-currency | All amounts are USD |

---

## 3. Core Operating Rule

Every dollar recorded in this ledger must be able to answer four questions:

1. **Who paid?** — Which entity's account was debited
2. **Who benefited?** — Which entity received the value
3. **Who owes whom?** — If a cross-entity payment occurred, what intercompany balance was created
4. **Where is the proof?** — Receipt, invoice, screenshot, or statement line attached

If you cannot answer all four, the record is incomplete.

---

## 4. Entities Explained

### Studio Maestro LLC (SM)

**Purpose:** Creative services, design, and production work.

**Belongs here:**
- Client project expenses (software, contractors, hardware for projects)
- Studio-specific subscriptions (Adobe Creative Cloud, domain hosting)
- Equipment purchased for creative production

**Example transactions:**
- Adobe Creative Cloud subscription ($599/year)
- Freelancer invoice for video editing
- MacBook Pro purchased for studio use

**Do not mix in:**
- RCL's cloud/AI infrastructure costs
- Personal living expenses
- Expenses shared with other entities without proper allocation

---

### Recursive Chaos Labs LLC (RCL)

**Purpose:** Software development, AI/ML research, and technical product work.

**Belongs here:**
- Cloud compute and API costs (AWS, OpenAI, Anthropic)
- Development software and SaaS (GitHub, 1Password, cloud IDE)
- Technical research and experimentation expenses

**Example transactions:**
- OpenAI API usage — $142.50/month
- AWS compute + storage — $89.20/month
- GitHub Teams subscription — $16/month

**Do not mix in:**
- SM's creative software costs
- Personal phone/internet without a proper split allocation
- Personal subscriptions

---

### Personal / Founder

**Purpose:** Captures the founder's personal portion of shared expenses and any personal draws or contributions.

**Belongs here:**
- Personal share of phone/internet bills (e.g., 20% of a shared bill)
- Personal-use portion of any mixed-purpose expense
- Owner draws taken from either LLC

**Why it's an entity:**
Treating Personal as an entity allows the system to allocate partial expenses cleanly. When RCL pays a $100 shared bill, $20 can be marked as "Personal" rather than forcing a false 100% business deduction.

**Do not mix in:**
- Pure business expenses — those belong to SM or RCL
- This entity has no operating bank accounts or tax reserve

---

## 5. Accounts Explained

Each entity has accounts that represent where money is held or tracked.

| Account Type | What It Represents | Example |
|---|---|---|
| `operating_checking` | Primary business checking account | Mercury checking for RCL |
| `tax_reserve` | Funds set aside for estimated taxes, not available operating cash | Separate Mercury savings for SM |
| `credit_card` | Business credit card balance | Amex Business card under SM |
| `reimbursement_clearing` | Temporary holding account for pending founder reimbursements | Tracks what RCL owes the founder |
| `intercompany_receivable` | What another entity owes this entity | SM is owed $40 by RCL |
| `intercompany_payable` | What this entity owes another entity | RCL owes SM $40 |
| `owner_equity` | Accumulated capital contributions from the owner | Founder's capital in SM |
| `owner_draw` | Money taken out by the founder as a draw | Founder took $2,000 from RCL |
| `personal_paid_expenses` | Tracking account for founder-paid expenses awaiting reimbursement | Founder paid AWS on personal card |

---

## 6. Transaction Types Explained

### `owner_contribution`
**Definition:** The founder puts money into a company.
**When to use:** Whenever the founder transfers personal funds to a business account, or is treating a payment as equity/loan rather than an expense.
**Example:** Founder transfers $5,000 from personal savings to RCL's operating account.

---

### `owner_reimbursement`
**Definition:** The founder paid a business expense personally and the company will repay them.
**When to use:** Founder used a personal card or personal funds for a legitimate business expense.
**Example:** Founder paid $19.95 for 1Password Teams on a personal Amex. RCL owes the founder $19.95.

---

### `business_expense`
**Definition:** A normal operating expense paid by a business account.
**When to use:** Any purchase made from a business account for business purposes.
**Example:** RCL's checking account pays AWS $89.20 for cloud hosting.

---

### `shared_expense_allocation`
**Definition:** A single payment that benefits multiple entities or includes a personal component, split into allocations.
**When to use:** Any expense where the benefit is not 100% attributable to one entity.
**Example:** RCL pays $100 for OpenAI API. Allocated: SM $40, RCL $40, Personal $20.

---

### `intercompany_reimbursement`
**Definition:** One entity pays another entity back for a previous intercompany balance.
**When to use:** When clearing an intercompany payable. This does not create a new expense — it settles an existing debt.
**Example:** SM transfers $40 to RCL to clear the intercompany balance created by the OpenAI allocation.

---

### `owner_draw`
**Definition:** The founder takes money out of a company for personal use.
**When to use:** Distributions, draws, or owner pay that is not W-2 salary.
**Example:** Founder takes $3,000 from SM's operating account for personal use.

---

### `transfer`
**Definition:** Moving money between accounts within the same entity.
**When to use:** Moving operating cash to the tax reserve account, or between checking accounts of the same entity.
**Example:** RCL moves $1,500 from operating checking to tax reserve savings.

---

### `asset_purchase`
**Definition:** Purchasing a capital asset (equipment, hardware) rather than an expensed item.
**When to use:** Items that should be capitalized and potentially depreciated, not fully expensed in one period.
**Example:** SM purchases a $3,500 camera for studio use.

---

### `revenue`
**Definition:** Income received by an entity.
**When to use:** Client payments, licensing fees, or any inbound business revenue.
**Example:** SM invoices a client $4,500 for a design project; payment received.

---

### `adjustment`
**Definition:** A correcting entry to fix a prior record.
**When to use:** When a previously posted transaction had an error and needs to be corrected via a memo entry.
**Example:** A $100 transaction was posted to SM but should have been RCL; an adjustment corrects the record.

---

## 7. Allocations Explained

### Why allocations exist

When a single payment benefits more than one entity — or includes a personal component — recording it as 100% one entity's expense is inaccurate. Allocations let you split the economic benefit correctly.

### How splits work

**Percentage split:** You specify what percent of the total each entity receives.
- Example: SM 40%, RCL 40%, Personal 20%

**Dollar split:** You specify the exact dollar amount for each entity.
- Example: SM $40, RCL $40, Personal $20 (on a $100 expense)

**Preset split:** You save a recurring allocation pattern (e.g., "OpenAI Standard Split") so you can apply it to future expenses without re-entering percentages each time.

### The personal/non-deductible portion

Any allocation to the Personal / Founder entity is non-deductible for business purposes. The app flags these visually (amber warning on the New Expense screen). The expense is still recorded — it just clearly separates what the business can claim versus what is personal.

### What happens when one entity pays for another's share

**Example — RCL pays OpenAI $100:**

| Party | Share | Result |
|---|---|---|
| Studio Maestro LLC | $40 | SM owes RCL $40 — creates an intercompany balance |
| Recursive Chaos Labs LLC | $40 | RCL's own share — direct business expense |
| Personal / Founder | $20 | Non-deductible — personal portion, no intercompany balance created |

RCL fronts the full $100. The ledger automatically records:
- A payable on SM's books (SM owes RCL $40)
- A receivable on RCL's books (RCL is owed $40 by SM)
- The Personal $20 is logged as non-deductible, no intercompany entry

SM settles the balance by recording an `intercompany_reimbursement` transaction when it transfers $40 to RCL.

---

## 8. Intercompany Balances Explained

### What they are

Intercompany balances arise whenever one entity pays for something that another entity owes. They represent real money debts between your own companies.

| Term | Meaning |
|---|---|
| Payable | This entity owes money to another entity |
| Receivable | Another entity owes money to this entity |

### Who owes whom — example

RCL pays $100 for a shared OpenAI bill (SM's share: $40):
- RCL has a **receivable** of $40 from SM
- SM has a **payable** of $40 to RCL

### How reimbursement clears the balance

When SM transfers $40 to RCL, record it as an `intercompany_reimbursement`. The balance is marked paid and the books are cleared.

### Why this matters for entity separation

The IRS and state agencies treat each LLC as a separate legal entity. Commingling funds without recording intercompany balances destroys entity separation and can pierce the corporate veil. Explicit intercompany records prove each entity's expenses are its own.

---

## 9. Owner Contributions Explained

| Type | Meaning |
|---|---|
| Capital contribution | Founder puts money into the LLC as equity. No repayment obligation. Default. |
| Owner loan | Founder lends money to the LLC. Creates a repayment obligation. Use only if explicitly intended. |

**Default to capital contribution** unless you and your accountant have specifically decided to structure it as a loan. Loans require interest documentation and repayment terms to be treated as loans rather than equity by the IRS.

---

## 10. Owner Reimbursements Explained

When the founder pays a business expense personally, the company owes the founder that money back.

| Status | Meaning |
|---|---|
| `pending` | The reimbursement has been recorded but not yet paid |
| `paid` | The company has transferred the money back to the founder |
| `waived` | The founder chose not to be repaid (effectively a contribution) |
| `converted_to_contribution` | The pending reimbursement was formally reclassified as a capital contribution |

Track all personally-paid expenses even if you plan to waive them — the record proves the expense was real and business-related.

---

## 11. Tax Reserve Explained

Each operating LLC (SM and RCL) has a tax reserve account that is separate from operating cash.

### How it works

1. Each period, transfer an estimated percentage of revenue or net income to the tax reserve account
2. Record this as a `transfer` transaction (not an expense)
3. The dashboard shows operating cash and tax reserve separately
4. At tax time, the reserve funds are available to pay the tax bill

### Critical label

> **Estimated tax set-aside only. This is not calculated tax owed.**

The app's tax reserve suggestions are based on a configurable percentage rule. They are estimates only. Always verify the actual amount owed with your accountant before filing. The app does not calculate self-employment tax, depreciation, deductions, or state taxes.

---

## 12. Evidence Vault Explained

### What it stores

The evidence vault records metadata about supporting documents. It does not upload or serve files — you store the actual files yourself.

| Evidence Type | When to use |
|---|---|
| `receipt` | Purchase receipt for any expense |
| `invoice` | Vendor invoice |
| `screenshot` | Screenshot of a subscription confirmation, SaaS dashboard charge |
| `contract` | Service agreement or vendor contract |
| `bank_statement` | Monthly bank or credit card statement |
| `subscription_receipt` | Auto-renewal or recurring billing confirmation email |
| `tax_document` | 1099, W-9, or other tax form |
| `note` | Text memo explaining a transaction |

### Metadata-only records

If you have no file yet (receipt not found, pending invoice), create a `note` type evidence record explaining the situation. This is better than leaving the transaction with no evidence at all.

### Status flags

- **Missing evidence:** Transaction has no attached documents. Dashboard highlights these.
- **Needs review:** Document has been attached but has not been verified against the transaction amount.

---

## 13. Statements and Reconciliation Explained

### Statement record

A statement represents one bank or credit card statement for one account in one period. Example: "RCL Mercury Checking — April 2026."

### Statement lines

Each line on the statement is imported as a statement line — date, description, amount. Lines start as `unmatched`.

### Reconciliation statuses

| Status | Meaning |
|---|---|
| `unmatched` | Statement line has not been linked to a ledger transaction |
| `matched` | Statement line is linked to a posted transaction |
| `ignored` | Line has been reviewed and intentionally excluded (e.g., internal transfer already recorded) |
| `needs_review` | Line was flagged for manual follow-up |

### Why reconciliation matters

Reconciliation proves your ledger matches actual bank activity. Any unmatched line at month-end is either a missing transaction, a duplicate, or an error. Closing the month without reconciling leaves unexplained gaps.

---

## 14. Monthly Close Explained

### Why close exists

Closing a period creates a formal checkpoint. Once closed:
- Transactions for that period require a correction memo to explain any changes
- The dashboard reflects the period's final numbers
- Exports for that period are stable

### What to review before closing

1. All transactions posted (no drafts remaining)
2. All statement lines matched or intentionally ignored
3. Intercompany balances reviewed (settled or acknowledged)
4. Tax reserve transfer recorded
5. Evidence attached to all significant transactions

### Correction memos

If you need to correct a record in a closed period, the monthly close screen has a `correction_memo` field. Document what changed and why. This is your audit trail.

---

## 15. Exports Explained

All exports are CSV files generated in the browser from live API data.

| Export | What it contains |
|---|---|
| All transactions | Every transaction across all entities, all types |
| Expenses by entity | Business expenses broken down per entity |
| Expenses by category | Expenses grouped by category code |
| Owner contributions | All capital contributions and owner loans |
| Reimbursements | All reimbursement requests and their status |
| Intercompany balances | All intercompany payables and receivables |
| Tax reserve activity | All tax reserve transfers and balances |
| Document index | All evidence records and their metadata |
| Personal/non-deductible log | All allocations to Personal / Founder entity |
| Monthly close summary | Closed periods and their correction memos |
| Statement reconciliation summary | Statement lines, match status, and linked transactions |

**Filter before exporting** — exports are not paginated server-side. Use the entity and period filters to limit output size.

---

## 16. Normal Use Flow

### Entering an expense

1. Go to **New Expense**
2. Enter date, total amount, description, vendor, category, business purpose
3. Select the paying entity and paying account
4. If a past statement is available, optionally link to it

### Allocating the expense

5. Add allocation rows — one per entity receiving the benefit
6. Enter either percentage or dollar amount per entity
7. If any allocation goes to Personal / Founder, the app shows a non-deductible warning
8. Submit — intercompany balances are created automatically if cross-entity

### Attaching evidence

9. Go to **Evidence**
10. Create a document record: link to the transaction, enter file path or note, select type
11. Mark status as `needs_review` until you have verified the amount matches the receipt

### Reconciling a statement

12. Go to **Statements**
13. Create a statement for the period and account
14. Enter statement lines (date, description, amount)
15. Match each line to a posted transaction
16. Mark unmatched lines as `ignored` if they are internal transfers already recorded elsewhere

### Reviewing reimbursements

17. Go to **Reimbursements**
18. Review pending items
19. When paid, mark as `paid` with the payment date

### Reviewing tax reserve

20. Go to **Tax Reserve**
21. Review the suggested transfer amount for the period
22. Record the transfer transaction manually

### Closing the month

23. Go to **Monthly Close**
24. Verify the checklist for each entity
25. Click Close Period — enter a correction memo if anything changed after initial entry

### Exporting records

26. Go to **Exports**
27. Select the report type and any filters
28. Download CSV and deliver to accountant or archive

---

## 17. Verification Flow — Canonical Test

Use this test to confirm the app is working correctly after any update:

1. **Create a $100 expense** — paid by RCL, vendor "OpenAI", category "AI/ML Infrastructure", description "OpenAI API - spec test"
2. **Allocate** — Studio Maestro $40 (40%), RCL $40 (40%), Personal $20 (20%)
3. **Confirm intercompany balance** — Dashboard or Intercompany page should show SM owes RCL $40
4. **Add evidence** — Create a document record on the transaction, type `screenshot`, file_path `evidence/openai/2026-05/openai-api-may.png`
5. **Add statement line** — Create a statement for RCL's account for the current month, add a line for $100 "OpenAI"
6. **Match statement line** — Link the $100 line to the posted transaction
7. **Record owner contribution** — Navigate to Owner Contributions, add a $5,000 capital contribution to RCL
8. **Export transactions** — Go to Exports, run "All Transactions" CSV, confirm the OpenAI expense appears

If all eight steps complete without error, the core flow is working.
