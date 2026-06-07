# Data Model

All tables use UUID primary keys (`defaultRandom()`), and timestamped with `created_at` / `updated_at` (timezone-aware). Numeric money values are stored as `numeric(14,2)` in PostgreSQL and returned as strings from Drizzle — always `parseFloat(String(val))` before arithmetic.

---

## Core

### `entities`

The three legal entities. Seeded once, not user-created.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `legal_name` | text | Full legal name (e.g. "Studio Maestro LLC") |
| `display_name` | text | Short display name, user-editable |
| `short_code` | text unique | `SM`, `RCL`, `PERSONAL` |
| `entity_type` | text | `llc`, `personal`, etc. |
| `purpose` | text? | Optional description |
| `tax_classification_note` | text? | e.g. "Single-member LLC, disregarded entity" |
| `primary_color` | text? | Hex color for badges (`#7C3AED`) |
| `secondary_color` | text? | Secondary brand color |
| `accent_color` | text? | Accent brand color |
| `logo_path` | text? | Not yet used |
| `is_active` | bool | Default true |

### `vendors`

Auto-created when a new vendor name is entered on an expense.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text unique | |
| `notes` | text? | |

### `categories`

Chart of accounts / expense categories. Seeded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `code` | text? | Short reference code |
| `parent_id` | uuid? FK→categories | Hierarchical categories |
| `is_active` | bool | |

### `accounts`

Bank / credit card accounts, one per entity.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK→entities | |
| `name` | text | |
| `account_type` | text | `checking`, `credit_card`, `savings`, etc. |
| `last_four` | text? | Last 4 digits of card/account |
| `institution` | text? | Bank name |
| `is_active` | bool | |

---

## Transactions

### `transactions`

Header record for every financial event.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `transaction_date` | date | |
| `transaction_type` | text | See enum below |
| `description` | text | |
| `vendor_id` | uuid? FK→vendors | |
| `total_amount` | numeric(14,2) | |
| `status` | text | `draft`, `posted`, `needs_review`, `voided` |
| `business_purpose` | text? | |
| `source_document_id` | uuid? | FK to documents (soft ref) |
| `is_balanced` | bool | True when double-entry lines balance |

**`transaction_type` enum:**
`business_expense`, `owner_contribution`, `owner_reimbursement`, `shared_expense_allocation`, `intercompany_reimbursement`, `owner_draw`, `transfer`, `asset_purchase`, `revenue`, `adjustment`

### `transaction_lines`

Double-entry lines. Each transaction has at least two lines (debit + credit).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `transaction_id` | uuid FK→transactions CASCADE | |
| `entity_id` | uuid FK→entities | Which entity this line belongs to |
| `account_id` | uuid FK→accounts | |
| `category_id` | uuid? FK→categories | |
| `debit` | numeric(14,2) | |
| `credit` | numeric(14,2) | |
| `memo` | text? | |

---

## Expense Allocation

### `expense_allocations`

Per-entity cost split for shared expenses. Created alongside `transactions` of type `business_expense`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `transaction_id` | uuid FK→transactions CASCADE | |
| `target_entity_id` | uuid FK→entities | Entity bearing this portion of the cost |
| `category_id` | uuid? FK→categories | |
| `allocation_percent` | numeric(7,4)? | Optional; informational |
| `allocation_amount` | numeric(14,2) | Definitive split amount |
| `memo` | text? | |
| `creates_intercompany_balance` | bool | True when `target_entity_id ≠ paying_entity_id` |

### `allocation_presets`

Named reusable allocation splits (e.g. "50/50 SM+RCL").

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | |
| `description` | text? | |

### `allocation_preset_lines`

Lines within a preset.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `preset_id` | uuid FK→allocation_presets CASCADE | |
| `entity_id` | uuid FK→entities | |
| `percent` | numeric(7,4) | Must sum to 100 across preset |

---

## Intercompany & Reimbursements

### `intercompany_links`

Auto-created when an expense allocation creates a cross-entity balance.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `source_transaction_id` | uuid? FK→transactions | Originating expense |
| `owing_entity_id` | uuid FK→entities | Entity that owes the amount |
| `owed_entity_id` | uuid FK→entities | Entity that paid / is owed |
| `amount` | numeric(14,2) | |
| `status` | text | `open`, `paid` |
| `reimbursement_transaction_id` | uuid? FK→transactions | Settlement transaction |
| `memo` | text? | |

### `reimbursement_requests`

Tracks owner / inter-entity reimbursements owed to the founder.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `original_transaction_id` | uuid? FK→transactions | |
| `owed_to_entity_id` | uuid FK→entities | Entity that should receive payment |
| `owed_by_entity_id` | uuid FK→entities | Entity that owes payment |
| `amount` | numeric(14,2) | |
| `status` | text | `pending`, `partially_paid`, `paid`, `waived`, `converted_to_contribution` |
| `paid_transaction_id` | uuid? FK→transactions | |
| `memo` | text? | |

---

## Owner Equity

### `owner_contributions`

Capital injections into an entity from the founder.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `transaction_id` | uuid? FK→transactions | |
| `entity_id` | uuid FK→entities | |
| `amount` | numeric(14,2) | |
| `contribution_type` | text | `capital_contribution`, `loan`, `expense_reimbursement` |
| `memo` | text? | |
| `contribution_date` | date? | |

### `owner_draws`

Cash taken out of an entity by the founder.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `transaction_id` | uuid? FK→transactions | |
| `entity_id` | uuid FK→entities | |
| `amount` | numeric(14,2) | |
| `memo` | text? | |

---

## Statements & Reconciliation

### `statements`

A monthly bank statement for one account.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK→accounts | |
| `statement_month` | date | First day of the month |
| `document_id` | uuid? FK→documents | Attached PDF |
| `opening_balance` | numeric(14,2)? | |
| `closing_balance` | numeric(14,2)? | |
| `status` | text | `uploaded`, `in_review`, `reconciled` |

### `statement_lines`

Individual line items from a bank statement.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `statement_id` | uuid FK→statements CASCADE | |
| `transaction_date` | date? | |
| `posted_date` | date? | |
| `description` | text? | |
| `amount` | numeric(14,2) | Positive = credit, negative = debit |
| `balance_after` | numeric(14,2)? | Running balance |
| `matched_transaction_id` | uuid? FK→transactions | Set when reconciled |
| `status` | text | `unmatched`, `matched`, `ignored` |
| `notes` | text? | |

### `reconciliation_matches`

Audit log of statement-line-to-transaction matches.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `statement_line_id` | uuid FK→statement_lines | |
| `transaction_id` | uuid FK→transactions | |
| `match_type` | text | `exact`, `fuzzy`, `manual` |
| `confidence` | numeric(5,2)? | 0–100 for fuzzy matches |
| `approved_by_user` | text | `"true"` or `"false"` (stored as text) |

---

## Tax Reserve

### `tax_reserve_rules`

Per-entity rules for setting aside a tax reserve percentage of revenue.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK→entities | |
| `reserve_percent` | numeric(7,4) | e.g. `30.0000` for 30% |
| `rule_basis` | text | `revenue` (default) |
| `is_active` | bool | |
| `notes` | text? | |

---

## Monthly Close

### `monthly_close_periods`

Per-entity checklist tracking close status for a calendar month.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `entity_id` | uuid FK→entities | |
| `period_month` | date | First day of the month |
| `status` | text | `open`, `review`, `closed`, `reopened` |
| `all_statements_uploaded` | bool | Checklist item |
| `all_transactions_reconciled` | bool | Checklist item |
| `all_receipts_attached` | bool | Checklist item |
| `all_allocations_complete` | bool | Checklist item |
| `intercompany_reviewed` | bool | Checklist item |
| `tax_reserve_reviewed` | bool | Checklist item |
| `export_generated` | bool | Checklist item |
| `closed_at` | timestamptz? | Set when status = `closed` |
| `correction_required_after_close` | bool | True after a reopen |

**Reopen rule:** Changing status from `closed` → `reopened` requires a non-empty `correction_memo` to be supplied in the PATCH body. The UI enforces this with a required text field before submitting.

---

## Documents (Evidence Vault)

### `documents`

Metadata for uploaded receipts, statements, contracts, and other evidence.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `document_type` | text | `receipt`, `bank_statement`, `contract`, `tax_document`, `invoice`, `other` |
| `file_name` | text? | Original filename |
| `file_path` | text? | Storage path |
| `entity_id` | uuid? FK→entities | |
| `account_id` | uuid? FK→accounts | |
| `transaction_id` | uuid? FK→transactions | |
| `statement_id` | uuid? | FK to statements (soft ref) |
| `period_month` | date? | For period-scoped evidence |
| `description` | text? | |
| `evidence_status` | text | `metadata_only`, `uploaded`, `verified` |
| `uploaded_at` | timestamptz | |

---

## Audit Exports

### `audit_exports`

Log of every CSV export generated from the Exports page.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `export_type` | text | e.g. `all_transactions`, `expenses_by_entity` |
| `generated_at` | timestamptz | |
| `row_count` | int? | Number of rows exported |
| `filters` | jsonb? | Serialized filter params used |
