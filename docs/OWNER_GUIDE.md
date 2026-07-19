# Founders Finance Owner Guide

This is the primary operating guide for the personal Founders Finance installation.

Founders Finance is a private, local-first financial operations system for one owner managing multiple companies and personal financial activity. It is designed to keep company records separate, explain where cash moved, preserve supporting evidence, and produce traceable records for review or accountant handoff.

## 1. What Founders Finance Does

Founders Finance records and connects:

- Companies and their financial accounts
- Expenses and the company that paid
- The company or companies that benefited
- Shared-expense allocations
- Intercompany balances and settlements
- Owner contributions and owner draws
- Reimbursements
- Tax-reserve rules and activity
- Receipts, invoices, statements, and other evidence
- Bank-statement imports and reconciliation
- Monthly close checklists
- Audit history
- CSV exports, printed reports, and PDF reports
- Encrypted database and evidence backups

The core rule is simple: every recorded dollar should answer four questions.

1. Who paid?
2. Who benefited?
3. Does anyone owe another company or the owner?
4. Where is the supporting evidence?

## 2. What It Does Not Do

Founders Finance is not:

- Tax-return preparation or filing software
- Legal, tax, or accounting advice
- Payroll software
- An invoicing or accounts-receivable platform
- A bank-transfer system
- A direct bank connection
- Multi-user or cloud-hosted software
- Multi-currency accounting

Tax-reserve values are planning estimates. Confirm tax decisions with a qualified tax professional.

## 3. Starting and Unlocking the App

### Normal daily startup

Open **Founders Finance** from one of these locations:

- Desktop shortcut: `C:\Desktop\Founders Finance.lnk`
- Windows Start Menu: **Founders Finance**
- Taskbar, after pinning the Start Menu shortcut
- Direct executable: `release\Founders Finance.exe`

The launcher performs the startup work automatically:

1. Locates the configured Founders Finance installation.
2. Starts the local PostgreSQL database if it is stopped.
3. Confirms database migrations are current.
4. Builds and starts the verified API and frontend.
5. Waits for both services to become healthy.
6. Opens Founders Finance in a dedicated Microsoft Edge app window.

### Unlocking

Enter the owner passphrase on the unlock screen. The passphrase itself is never stored. The app stores a one-way password hash and creates a protected local session.

Sessions expire after 12 hours. Five repeated failed attempts trigger a temporary 15-minute lockout.

### Locking the workspace

Use the lock/logout control in the top-right corner when leaving the computer. Locking ends the current application session without stopping the database or deleting data.

### Maintenance commands

These commands are available from the repository root if troubleshooting is needed:

```powershell
pnpm run app:doctor
pnpm run app:start
pnpm run app:status
pnpm run app:restart
pnpm run app:stop
```

## 4. Where Data Is Stored

The current installation stores data locally under:

`C:\AI_Projects\Founders-Finance\Founders-Finance`

Important locations:

| Data | Location |
|---|---|
| PostgreSQL database cluster | `.local\pgdata` |
| Uploaded evidence files | `evidence` |
| Encrypted backup packages | `backups` |
| Runtime state and service logs | `.local\runtime` |
| Windows launcher | `release\Founders Finance.exe` |

The PostgreSQL database is not a single document that should be copied while running. Use **Backup & Restore** to create a recoverable encrypted package.

Financial data, evidence, the local database, `.env`, and backup packages are excluded from Git. Pushing source code to GitHub does not back up financial data.

## 5. Initial Owner Setup

The clean owner database contains these company identities:

- Studio Maestro
- Polymathic Systems
- Recursive Chaos Labs
- Personal

Each has a blank checking account and tax-reserve account with a zero balance. No sample transactions, vendors, categories, statements, evidence, or tax rules are loaded.

Complete setup in this order:

1. Open **Settings** and review each company.
2. Review the blank accounts for each company.
3. Choose the date when Founders Finance recordkeeping will begin.
4. Reuse and rename a default account only when its opening balance is truly zero on that date.
5. When an account has a non-zero starting balance, create a new account with the real opening balance and deactivate the unused blank account.
6. Enter the financial institution and last four digits where appropriate.
7. Open **Reference Data** and create the categories you actually use.
8. Add recurring vendors only when useful.
9. Add allocation presets only for recurring, proven splits.
10. Open **Tax Reserve** and configure only the rules you intend to use.
11. Create and test an encrypted baseline backup.

Do not create made-up transactions or edit database files to force account balances. The account opening balance establishes the starting point; posted ledger activity drives the current balance after that.

## 6. Core Concepts

### Companies

A company is the legal or personal record owner. Company separation is central to the app. Never choose a company only because it has available cash. Choose the company that legally paid or benefited.

### Accounts

Accounts identify where money came from or went. Common account types include checking, savings/tax reserve, and credit card.

The account belongs to exactly one company. A payment from one company's account for another company's benefit can create an intercompany balance.

### Categories

Categories describe the accounting purpose of a transaction or line, such as software, professional services, equipment, travel, revenue, owner equity, or non-deductible personal activity.

Categories can be deactivated later without breaking historical records.

### Vendors

Vendors identify the person or business paid. A vendor may have a default category, but you must still confirm the category for each transaction.

### Transaction status

- **Draft:** incomplete and still editable.
- **Needs review:** requires an owner decision or correction.
- **Posted:** finalized in the ledger and protected from ordinary editing.
- **Void:** canceled through a traceable correction rather than deleted.

Posted history is intentionally immutable. Corrections use controlled void, reversal, reopen, archive, or deactivate actions.

### Evidence

Evidence is the proof behind a financial record. Examples include receipts, invoices, contracts, screenshots, tax documents, and bank statements.

Files are stored outside the public website, validated by signature and size, checksummed with SHA-256, and included in encrypted backups.

## 7. Navigation Reference

### Dashboard

The Dashboard is the high-level operating view. It summarizes company activity, cash position, review items, tax reserves, intercompany obligations, reimbursements, and close status.

Use it to identify what needs attention. Do not treat dashboard summaries as replacements for the underlying transaction, statement, or evidence record.

### Transactions

Transactions is the searchable ledger. Use it to:

- Review recorded activity
- Filter by company, type, status, or date
- Open transaction details
- Review journal lines and allocations
- Post a balanced draft transaction
- Inspect evidence and audit history
- Void an incorrect posted transaction through the controlled action

### New Expense

New Expense records a business purchase or shared expense.

Required decisions include:

- Transaction date
- Description
- Amount
- Paying account and paying company
- Vendor and category
- Business purpose
- Benefiting company or allocation
- Supporting evidence

### Allocations

Allocations divide a shared expense among benefiting companies or Personal.

Allocation percentages must total 100 percent. Allocation amounts must total the transaction amount. A cross-company share may create an intercompany obligation when one company paid another company's portion.

Allocation presets are convenience templates, not permanent accounting rules. Review every split before posting.

### Intercompany

Intercompany records amounts one company owes another.

Use it to:

- Review open balances
- Identify the original transaction
- Choose the correct checking accounts for settlement
- Record settlement
- Reverse an incorrect settlement with a linked correcting journal

Do not delete an intercompany balance. Settle it or reverse the related action so the history remains explainable.

### Contributions

Contributions record money the owner puts into a company.

Choose the company, destination account, date, amount, contribution type, and memo. The app creates a balanced, posted, traceable journal.

### Owner Draws

Owner Draws record money removed from a company for the owner. A draw is not automatically a business expense.

Choose the company, cash account, amount, date, and memo. Confirm the treatment with the accountant when necessary.

### Reimbursements

Reimbursements track expenses paid personally or by another company that should be repaid.

Supported outcomes include:

- Paid
- Waived
- Converted to owner contribution

Each completion path creates or links the required accounting record and prevents duplicate processing.

### Tax Reserve

Tax Reserve tracks planning rules and reserve activity by company.

Configure the intended percentage and rule basis. Review the resulting estimate and move cash separately through the real bank. Founders Finance does not execute transfers or determine final tax liability.

### Evidence

Evidence stores and links supporting files.

Use it to:

- Upload a file
- Select its document type
- Link it to a company, account, transaction, statement, or period
- Preview or download it
- Replace it while preserving the previous version
- Archive it without destroying history

Maximum upload size is 20 MB per file.

### Statements

Statements represent bank or credit-card statement periods and their lines.

You can:

- Create a statement for an account and month
- Add an isolated manual line
- Import a CSV
- Map date, description, amount, debit, and credit columns
- Preview every row before import
- Reject invalid or duplicate rows before any write occurs
- Match a statement line to a posted transaction
- Unmatch and correct a reconciliation
- Archive the statement while retaining its history

CSV imports support up to 2 MB and 5,000 rows. Dates may use ISO or common US month/day/year formats. Suggested matches always require owner confirmation.

### Monthly Close

Monthly Close is the period-control checklist for each company.

The checklist confirms that transactions, evidence, statements, reimbursements, intercompany balances, tax reserves, and exports have been reviewed.

Closing a month blocks affected financial mutations. Reopening requires a correction memo and creates an audit record. Reclose after the correction is complete.

### Exports

Exports produces accountant-readable and owner-readable reports from live data. See Section 15 for all report types, CSV downloads, printing, and PDF output.

### Backup & Restore

Backup & Restore creates encrypted recovery packages containing the PostgreSQL database and evidence files.

It supports:

- Create and automatically verify
- Download the encrypted package
- Re-run integrity verification
- Test restore into an isolated clean database
- Guarded live restore
- Automatic pre-restore recovery point

### Audit Log

Audit Log is the read-only history of important changes.

Filter by table, action, record, or date. Inspect previous and new values when investigating who or what changed a record. The current personal release has one owner, but the audit trail still matters for correction history and accountant review.

### Reference Data

Reference Data manages accounts, categories, vendors, and allocation presets.

Create, edit, deactivate, or reactivate records. Deactivation keeps historical references intact. Avoid renaming a historical category into a different accounting meaning; create a new category instead.

### Settings

Settings manages companies and company lifecycle.

You can create, edit, close, archive, or reopen companies. Closing or archiving preserves records and deactivates appropriate accounts. Retention dates and reasons document why records remain available.

## 8. Recording a Normal Expense

1. Open **New Expense**.
2. Enter the date, description, and total amount.
3. Select the real paying account.
4. Select or create the vendor.
5. Select the correct category.
6. Write a useful business-purpose memo.
7. Confirm the benefiting company.
8. Add allocations if more than one company or Personal benefited.
9. Attach the receipt or invoice in **Evidence**.
10. Review totals and submit.
11. Open the transaction detail and confirm it is balanced.
12. Post it when complete.

## 9. Recording a Shared Expense

1. Record the full payment under the company and account that actually paid.
2. Add one allocation per benefiting company or Personal.
3. Confirm allocations total 100 percent and the full amount.
4. Review whether the split creates an intercompany balance.
5. Attach evidence supporting the payment and split.
6. Post only after the allocation is correct.
7. Settle the intercompany balance later through **Intercompany** when cash is repaid.

## 10. Handling Corrections

Never erase posted financial history to make the screen look clean.

Use the appropriate correction:

- Draft error: edit before posting.
- Posted transaction error: void through transaction detail, then enter the correct transaction.
- Intercompany settlement error: create the linked reversal.
- Reconciliation error: unmatch and rematch.
- Closed-month error: reopen with a correction memo, correct the record, and reclose.
- Obsolete vendor/category/account/preset: deactivate it.
- Closed business: close or archive the company and retain records.
- Superseded evidence: replace or archive it.

Review the Audit Log after material corrections.

## 11. Statement Reconciliation Workflow

1. Create the statement for the correct company account and month.
2. Import the bank CSV or add isolated manual lines.
3. Map CSV columns explicitly.
4. Review the complete validation preview.
5. Resolve invalid dates, amounts, missing descriptions, and duplicates.
6. Import only after the preview is clean.
7. Review suggested transaction matches.
8. Confirm each match manually.
9. Investigate unmatched lines instead of forcing a match.
10. Confirm the account's statement period is fully reconciled.
11. Attach the original statement as Evidence.

## 12. Monthly Close Workflow

For each company and month:

1. Enter and post all known transactions.
2. Resolve all Needs Review items.
3. Attach missing evidence.
4. Import and reconcile each account statement.
5. Resolve reimbursements.
6. Review and settle intercompany balances where appropriate.
7. Review tax-reserve activity.
8. Generate the required exports.
9. Complete the Monthly Close checklist.
10. Close the period.
11. Create and test an encrypted backup.
12. Copy the backup off this computer.

## 13. Company Closure and Record Retention

Closing a company does not delete it.

Before closure, review:

- Non-zero accounts
- Open intercompany balances
- Pending reimbursements
- Unreconciled statement lines
- Missing or unresolved evidence
- Tax-reserve activity

Record the closure reason and retention date. Use archive when the company is no longer operational but records must remain available. Reopen only when a legitimate correction or resumed operation requires it.

## 14. Evidence and Document Practices

Use descriptive evidence names, such as:

`2026-07 Vendor Invoice 1042.pdf`

Recommended evidence rules:

- Attach proof as soon as the transaction is entered.
- Keep the original bank statement even after CSV import.
- Link evidence to the most specific applicable record.
- Do not upload executable files or unrelated personal documents.
- Preview the uploaded copy to confirm it opens.
- Replace incorrect files through the app instead of overwriting storage folders manually.
- Never rename or move evidence files directly in Windows Explorer.

## 15. Exports, Printing, and PDF Reports

Founders Finance includes 13 tested export types.

| Export | Purpose |
|---|---|
| All Transactions | Complete transaction ledger with source identity |
| Expenses by Entity | Allocated expense totals and detail by company |
| Expenses by Category | Expense detail grouped by accounting category |
| Owner Contributions | Capital contributions and owner loans |
| Owner Draws | Owner distributions linked to posted journals |
| Company Retention | Closed and archived companies and retention dates |
| Reimbursements | Reimbursement amounts, parties, and status |
| Intercompany Balances | Company-to-company payables, receivables, and status |
| Tax Reserve Rules | Reserve percentages and rule basis by company |
| Document Index | Evidence metadata and record linkage |
| Personal / Non-Deductible | Activity allocated to Personal |
| Monthly Close Summary | Close checklist and status by company/month |
| Reconciliation Summary | Statement-line matching status by account |

### Generate an export

1. Open **Exports**.
2. Select the report type.
3. Select a company when the report supports company filtering.
4. Select a month when the report supports period filtering.
5. Click **Generate**.
6. Review the preview and record count.

The screen preview shows up to 100 rows for responsiveness. CSV and printed output include the complete generated report.

### Download CSV

1. Generate the report.
2. Click **Download CSV**.
3. Save the file in the intended accounting archive.
4. Open it in Excel or another spreadsheet application to confirm it is readable.

CSV is the preferred accountant handoff format because it preserves complete row-level data and can be filtered, totaled, and imported.

### Print a report

1. Generate the report.
2. Click **Print / Save PDF**.
3. Select the physical printer in the Windows print dialog.
4. Review orientation, margins, and page count.
5. Print.

Reports use a landscape print layout with a Founders Finance heading, generation date, record count, repeated table headers, and all report rows.

### Save a report as PDF

1. Generate the report.
2. Click **Print / Save PDF**.
3. Select **Microsoft Print to PDF**.
4. Choose the file name and destination.
5. Save and open the PDF to verify it.

Printing is report-based. For a receipt, invoice, or original statement, preview or download the Evidence file and print it from the associated PDF or image viewer.

## 16. Backup and Restore

### What a backup contains

An encrypted `.ffbackup` package contains:

- The PostgreSQL database
- Evidence files
- Integrity metadata and fingerprints

CSV exports are useful records but are not complete backups.

### Create a backup

1. Open **Backup & Restore**.
2. Enter a unique passphrase of at least 12 characters.
3. Confirm the passphrase.
4. Create the backup.
5. Wait for automatic verification to complete.
6. Run **Test Restore**.
7. Download or copy the `.ffbackup` package.
8. Store the passphrase separately in a password manager.

Local encrypted packages are stored under:

`C:\AI_Projects\Founders-Finance\Founders-Finance\backups`

### Off-device backup

A backup on the same drive does not protect against drive failure, theft, fire, or ransomware.

Copy the encrypted package to at least one of:

- A separate desktop computer
- A home server
- An external drive stored separately
- A reputable cloud storage account

Do not place the unencrypted database folder or loose evidence files on a shared network location. Copy only encrypted `.ffbackup` packages unless a specific secured storage design has been implemented.

### Test Restore

Test Restore decrypts the selected package into an isolated temporary database, compares database rows and evidence fingerprints, and removes the temporary environment afterward. It does not replace the live owner database.

### Live restore

Live restore replaces current live data and is intentionally guarded. It requires the backup passphrase and exact confirmation phrase. The app creates a pre-restore recovery point before replacement.

Use live restore only when recovering from loss or corruption, and confirm the selected backup date first.

## 17. Recommended Operating Schedule

### Each transaction

- Record the real payer and beneficiary.
- Use the correct account, vendor, and category.
- Attach evidence.
- Review allocations.
- Post only when balanced and complete.

### Weekly

- Review Draft and Needs Review transactions.
- Attach missing evidence.
- Review reimbursements and intercompany balances.
- Create an encrypted backup after meaningful activity.

### Monthly

- Import and reconcile statements.
- Review tax reserves.
- Generate and archive exports.
- Complete Monthly Close.
- Create, verify, test, and copy an encrypted backup off-device.

### Annually

- Generate company, owner-equity, reimbursement, tax-reserve, document-index, and reconciliation exports.
- Review archived companies and retention dates.
- Provide the accountant with requested CSV/PDF reports and supporting evidence.
- Test recovery from a recent backup.

## 18. Troubleshooting

### The app does not open

Run:

```powershell
pnpm run app:doctor
pnpm run app:status
```

Then review:

- `.local\runtime\api.log`
- `.local\runtime\web.log`
- `.local\postgres.log`

### The passphrase is rejected

- Confirm Caps Lock is off.
- Wait 15 minutes if repeated failures caused lockout.
- Do not delete authentication records or the database to bypass the passphrase.

### An export is empty

- Confirm transactions are posted.
- Remove restrictive company or month filters.
- Try **All Transactions** first.
- An empty clean ledger correctly produces an empty export.

### A print button is disabled

The generated report has no rows. Adjust filters or enter/post the required records first.

### A statement will not match

- Confirm the transaction is posted.
- Confirm the account is correct.
- Confirm the amount and date.
- Remove an incorrect existing match before rematching.

### A month blocks changes

The month is closed. Reopen it through Monthly Close with a specific correction memo, make the correction, and reclose it.

### Backup verification fails

- Confirm the passphrase.
- Do not rename internal package contents.
- Do not use the package until verification succeeds.
- Create a fresh backup and run Test Restore.

## 19. Owner Safety Rules

1. Never edit PostgreSQL files directly.
2. Never move evidence files manually.
3. Never treat GitHub as a financial-data backup.
4. Never delete posted history to hide a mistake.
5. Never share the owner passphrase or backup passphrase in email or chat.
6. Never keep the only backup on the same physical drive.
7. Always test a backup before relying on it.
8. Always review company, account, and allocation choices before posting.
9. Always preserve original statements and important evidence.
10. Always consult a qualified professional for tax and legal decisions.

## 20. Quick Reference

| Need | Go to |
|---|---|
| Record an expense | New Expense |
| Review ledger activity | Transactions |
| Split a shared cost | Allocations |
| Settle company-to-company debt | Intercompany |
| Record owner money going in | Contributions |
| Record owner money coming out | Owner Draws |
| Resolve money owed to owner/company | Reimbursements |
| Review estimated tax reserves | Tax Reserve |
| Store receipts or statements | Evidence |
| Import and reconcile bank activity | Statements |
| Lock a completed accounting month | Monthly Close |
| Create CSV, print, or PDF reports | Exports |
| Create or test recovery packages | Backup & Restore |
| Investigate changes | Audit Log |
| Manage accounts, vendors, and categories | Reference Data |
| Manage companies | Settings |

The intended operating cycle is:

**Record -> Allocate -> Attach Evidence -> Reconcile -> Review -> Export -> Close -> Back Up**
