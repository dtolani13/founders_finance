# Next Build Steps — Founders Finance

> What to build next, in what order, and what to leave alone for now.

---

## Current State Assessment

The core financial ledger is working end-to-end:
- Manual expense entry with allocation works
- Intercompany balances are created automatically
- Owner contributions, tax reserve, statements, monthly close, and exports are all functional
- The UI has strong visual definition and a professional financial terminal look

The app is usable today for its intended purpose. The next phase is deepening reliability, filling partial features, and making it easier to maintain.

---

## 1. Immediate Next Step

**Add actual file upload to the Evidence Vault.**

Currently, `file_path` in the `documents` table is a metadata string you manage manually. The next most valuable improvement is making file attachment real:

1. Add `POST /api/documents/:id/upload` — multipart file upload, stores to `evidence/` directory
2. Add `GET /api/documents/:id/file` — serves the file with appropriate content-type
3. Update the Evidence page to show an upload button and a preview link
4. Sanitize the stored path (already done in the route) — just wire it to actual disk I/O

This is the single highest-value improvement because evidence is the legal foundation of every transaction record.

---

## 2. Recommended Build Sequence

### Phase 1 — Complete Partial Features (do first)

These are features that exist but have gaps. Complete them before adding anything new.

**1a. Evidence file upload** (described above)

**1b. Reimbursement waive and convert-to-contribution actions**
- The DB supports `waived` and `converted_to_contribution` status
- The UI only has `mark-paid`
- Add two more action buttons on the Reimbursements page

**1c. Intercompany settlement transaction**
- When marking an intercompany balance as paid, auto-create the `intercompany_reimbursement` transaction
- Currently the user must create this manually and then mark the balance paid separately

**1d. Owner draw entry form**
- The DB schema supports owner draws
- No UI to enter a draw — add a form to Owner Contributions page

**1e. Verify export completeness**
- Manually test each of the 11 export types
- Fix any that produce wrong columns or missing rows
- See FEATURE_STATUS.md for which ones need verification

---

### Phase 2 — Deepen Reconciliation

**2a. Statement line auto-match**
- Query transactions by entity, amount, and date within ±3 days
- Present candidates for the user to confirm (not auto-accept)
- This dramatically reduces the manual effort of reconciliation

**2b. Statement import from CSV**
- Accept a simple CSV paste (date, description, amount)
- Parse and create statement lines in bulk
- Reduces manual line-by-line entry

---

### Phase 3 — Improve Exports

**3a. Verify all 11 export types**
- Run each export with real data
- Confirm columns match what an accountant would need
- Add entity name and period columns where missing

**3b. Add filtering to more exports**
- Most exports currently filter by entity
- Add period month filter to all exports
- Add transaction type filter to the "all transactions" export

**3c. Server-side export for large datasets**
- Currently all CSV generation is in the browser
- For large datasets (1000+ transactions), add a server-side export endpoint that streams CSV
- This prevents browser memory issues

---

### Phase 4 — Backup Tooling

**Completed.** The shared backup engine, CLI, and in-app control center create AES-256-GCM encrypted database-plus-evidence packages, verify file fingerprints, run isolated clean-database recovery drills, and require a pre-restore backup plus exact confirmation for live recovery.

---

### Phase 5 — Observability and Audit

**5a. Add `audit_log` database table**

Table structure:
```
id, entity_id, table_name, record_id, action (create/update/delete), 
changed_by (always "founder" for now), changed_at, old_values (jsonb), new_values (jsonb)
```

Add a middleware or after-hook to the most critical routes (transactions, allocations, monthly_close) to write audit log entries.

**5b. Audit log viewer page**

Simple read-only page showing recent audit entries, filterable by table and action.

---

### Phase 6 — Auth (only if needed)

If the app ever needs to be deployed where others might access it:

- Add a simple password gate or a simple password gate using an environment variable
- Do not add per-user roles unless the use case genuinely requires it — this is a single-founder tool
- A simple Bearer token checked in middleware is sufficient for most private hosting scenarios

**Do not add auth speculatively.** It adds complexity with no benefit for a private single-user deployment.

---

### Phase 7 — OCR and Receipt Parsing (future)

Once file upload is working:

- Integrate a document parsing service (AWS Textract, Google Document AI, or a local model)
- Parse amount, date, and vendor from uploaded receipts
- Pre-fill transaction form fields from parsed data
- User confirms or corrects before saving

This is a meaningful time-saver but has high integration complexity. Build it only after file upload is stable.

---

### Phase 8 — Local Deployment Packaging

When ready to move to managed hosting:

- Add a `docker-compose.yml` with Node.js app + PostgreSQL
- Document the `.env` setup for self-hosted deployment
- Add a health check route test to the startup sequence
- Add automated database backup via cron inside the container

---

## 3. Do Not Build Yet

These are out of scope for this tool's purpose. Do not build them until the core ledger is complete and stable.

| Feature | Why not now |
|---|---|
| Bank sync (Plaid) | High complexity, ongoing maintenance, API costs. Manual entry is fine for current volume. |
| Payroll | Completely different domain. Requires tax law compliance. Use Gusto or Rippling. |
| Invoicing | Different product. Use Wave, FreshBooks, or HoneyBook for client invoicing. |
| Tax filing | Requires licensed tax professional involvement and legal liability. Out of scope permanently. |
| Automatic tax advice | Same as above. The app estimates; the accountant decides. |
| Mobile app | Desktop web is sufficient for a monthly workflow. |
| Public SaaS hosting | This is a private internal tool by design. |
| Multi-currency | Not needed for a USD-only founder in the US. |
| Recurring transaction automation | Low value — the recurring expenses are a small set; manual entry is fast enough. |

---

## 4. Suggested Next Prompt for Future Agent

Use this prompt to continue development in the next session:

---

```
The Founders Finance is a working private ledger for a solo founder managing three LLCs.

The current partial features to complete are, in order:

1. Evidence file upload
   - Add POST /api/documents/:id/upload (multipart, stores to evidence/ directory)
   - Add GET /api/documents/:id/file (serves stored file)
   - Update Evidence page to show an upload button and file preview link
   - File path sanitization is already in place in the route — wire it to disk I/O

2. Reimbursement waive and convert-to-contribution
   - DB supports waived and converted_to_contribution status values
   - Add waive and convert buttons to the Reimbursements page UI
   - Wire to the existing update route

3. Intercompany settlement auto-transaction
   - When POST /api/intercompany/:id/mark-paid is called, auto-create an
     intercompany_reimbursement transaction for the amount and entities involved
   - Return the created transaction ID in the response

Do not change the stack (Node.js + Express + TypeScript + Drizzle + PostgreSQL + React + Vite).
Do not change any existing working functionality.
Do not modify the OpenAPI spec without also running codegen.
Do not change the CSS variables or theme — the styling is locked.

After each change, run: pnpm run typecheck
After implementation, run the canonical verification test in docs/OPERATOR_MANUAL.md Section 17.
```

---

## Reference Documents

- `docs/OPERATOR_MANUAL.md` — How the app works and what every feature does
- `docs/HANDOFF_PACKET.md` — Architecture, folder structure, design decisions
- `docs/FEATURE_STATUS.md` — Complete feature matrix with implementation status
- `docs/KNOWN_LIMITATIONS.md` — Accepted trade-offs and missing features
- `docs/TROUBLESHOOTING.md` — Common problems and fixes
- `docs/MONTHLY_WORKFLOW.md` — Step-by-step operating checklist
