# Reviewed statement ingestion

The RCL edition follows the reviewed ingestion pattern used for FoundersVaultOS: inspect, map, preview the complete file, confirm, then reconcile. This implementation is native to Founders Finance's Express/PostgreSQL stack.

1. Create a statement for the correct bank account and month, with opening/closing balances where available.
2. Choose **Import CSV** and a UTF-8 bank CSV (BOM is supported). Limits are 2 MiB, 5,000 data rows, 128 columns, 64 KiB per record and 1,000 characters per description. PDF/OCR and bank connections are not supported.
3. Review the detected columns. Select either a signed amount or separate nonnegative debit/credit columns. Select the date convention and whether positive or negative amounts mean money out. Four-digit years are required; ISO dates are supported. Currency is USD only; convert nothing implicitly.
4. Validate and review every row using 25-row pages. Check money out, money in, net change, and running balances against the bank export. Amounts with excess decimals, malformed comma grouping, contradictory signs, invalid dates or missing descriptions are rejected. No silent rounding occurs.
5. Review possible duplicates. Matching uses account, transaction date, normalized description, amount and optional running balance, including archived and overlapping statements. Identical legitimate transactions require careful review; this is a deterministic heuristic, not a bank transaction ID. Changing whether a balance column is included can change the duplicate fingerprint. The UI never skips duplicates without a checkbox selection.
6. Confirm the review checkbox and import. A SHA-256 fingerprint binds the file bytes, mapping, conventions, and statement to the preview. It is an integrity binding, not an authentication token. The server reparses the file and checks access, account/entity state, periods, and duplicates again. The account lock serializes concurrent imports. Any required audit-write failure rolls back all inserted lines.
7. Imported rows remain **unmatched statement lines**. Ingestion does not create or post ledger transactions. Match each row to a posted transaction for the same account and exact signed account amount. Completion changes the statement to Reconciled.

Changing the file or mapping clears the preview. Imports require a fresh matching fingerprint; replay and concurrent duplicate requests cannot silently insert the same lines. Totals are calculated in integer cents and checked against the safe display range. Overflows fail before writing.

## Provenance and recovery

Audit records retain the source fingerprint, source row numbers and inserted/skipped counts. Line notes retain source row numbers. Raw CSV bytes and original filenames are not saved by the importer. Retain the bank's original export securely outside the app or attach appropriate evidence separately. Existing encrypted backup/restore covers committed database lines and saved evidence.

## Scope

This is a single-owner local app. Host and Origin checks plus loopback binding protect the local service boundary; they are not a multi-tenant/cloud authorization design. No background ingestion, PDF/OCR, FX conversion or automatic ledger posting is enabled. A human still verifies the bank statement, period, mappings and totals. The preview does not assert that opening balance plus imported net equals closing balance; partial and overlapping bank exports need owner review.

## Developer contract

OpenAPI source: `lib/api-spec/openapi.yaml`. Regenerate with `pnpm --filter @workspace/api-spec run codegen`. Multipart mapping requires `date_format`, `amount_sign`, and `currency=USD`; commit also requires the preview's `preview_fingerprint`. Generated React Query and Zod outputs are committed. Focused coverage is in statement-import.test.ts, statement-http.test.ts and accounting.test.ts.
