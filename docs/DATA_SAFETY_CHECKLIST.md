# Data Safety Checklist

Use this checklist each month before closing a period, and whenever making changes to the system.

---

## Monthly Close Checklist

### Pre-close (run before marking a period "closed")

- [ ] All bank statements uploaded for the period (one per active account)
- [ ] All statement lines matched or intentionally ignored (with notes)
- [ ] All expenses recorded and allocated to the correct entity
- [ ] All intercompany transfers reviewed and balanced
- [ ] Tax reserve transfers executed and documented
- [ ] All receipts/invoices attached to high-value transactions (>$100)
- [ ] Owner contributions and draws recorded
- [ ] Export generated and saved (`/api/exports/all_transactions?period_month=YYYY-MM`)

### At close

- [ ] Monthly close period status set to "closed"
- [ ] Encrypted backup created and verified in **Backup & Restore**
- [ ] Encrypted package copied to a separate local or cloud location

### Post-close corrections

If you need to edit a closed period, a **correction memo is required**. The API enforces this (HTTP 409 if no memo provided). Corrections should:

1. Be specific ("Corrected allocation for invoice #1234 — was SM, should be RCL")
2. Reference the original transaction ID(s)
3. Be stored in the `correction_memo` field of the monthly close period

---

## Data Integrity Rules

### Transactions

- **Never hard-delete financial transactions.** Use the void action instead (`DELETE /transactions/:id` now soft-deletes by setting `status = "voided"`).
- Posted transactions cannot be voided without an explicit `/void` call.
- Balanced transactions must have equal debits and credits within $0.01.

### Statement Reconciliation

- Statements with matched lines cannot be deleted (API returns 409).
- Unmatch all lines before deleting a statement.
- "Ignored" lines should always have a note explaining why they were ignored.

### Intercompany

- An entity cannot create an intercompany link to itself.
- Both sides of an intercompany transfer should be recorded before the period closes.

### Documents / Evidence

- `file_path` fields are sanitized on write — path traversal sequences (`../`) are stripped automatically.
- Actual evidence files must be stored in the `evidence/` directory (or configured `EVIDENCE_STORAGE_ROOT`).
- The `evidence/` directory is excluded from git.

---

## Security Checklist

- [ ] `.env` file exists locally and is NOT committed to git (verify with `git status`)
- [ ] `SESSION_SECRET` is at least 64 random hex characters
- [ ] `DATABASE_URL` is not exposed in logs or error messages
- [ ] Evidence directory is not publicly accessible via HTTP
- [ ] Latest backup shows **Verified** in the Backup & Restore control center
- [ ] Backup passphrase is stored separately in a password manager
- [ ] A clean-database recovery drill has passed this quarter
- [ ] No real financial data in screenshots shared publicly

---

## Access Control

This app uses single-owner passphrase authentication. It is intended for one founder on a private local deployment.

- Do not expose the deployed URL publicly.
- Lock the workspace when stepping away.
- Rotate `SESSION_SECRET` and the owner passphrase if access may have been compromised.
- Do not reuse the owner passphrase as a backup passphrase.

---

## Audit Trail

Material finance and lifecycle mutations write before/after context or an operation memo to the persistent `audit_log` table. Use the in-app **Audit Log** workspace for the financial audit trail. Runtime API logs are diagnostic records and are not a substitute for the database audit history.
