import assert from "node:assert/strict";
import test from "node:test";
import { inspectStatementCsv, parseStatementCsv, statementLineFingerprint } from "./statement-import";

test("statement CSV inspection handles quoted fields and a BOM", () => {
  const csv = Buffer.from('\uFEFFDate,Description,Amount\n07/01/2026,"Vendor, Inc.","(1,234.50)"\n');
  const inspection = inspectStatementCsv(csv);
  assert.deepEqual(inspection.headers, ["Date", "Description", "Amount"]);
  assert.equal(inspection.row_count, 1);
  assert.equal(inspection.sample_rows[0].Description, "Vendor, Inc.");
});

test("statement CSV maps amount and debit-credit layouts deterministically", () => {
  const amountCsv = Buffer.from('Date,Description,Amount,Balance\n2026-07-01,Deposit,"$25.10",100.10\n');
  const amount = parseStatementCsv(amountCsv, {
    transactionDateColumn: "Date",
    descriptionColumn: "Description",
    amountColumn: "Amount",
    balanceColumn: "Balance",
  });
  assert.equal(amount.errors.length, 0);
  assert.deepEqual(amount.rows[0], {
    sourceRow: 2,
    transaction_date: "2026-07-01",
    posted_date: null,
    description: "Deposit",
    amount: 25.1,
    balance_after: 100.1,
  });

  const splitCsv = Buffer.from('Date,Description,Debit,Credit\n7/2/26,Purchase,12.34,\n7/3/2026,Refund,,4.56\n');
  const split = parseStatementCsv(splitCsv, {
    transactionDateColumn: "Date",
    descriptionColumn: "Description",
    debitColumn: "Debit",
    creditColumn: "Credit",
  });
  assert.deepEqual(split.rows.map((row) => row.amount), [-12.34, 4.56]);
});

test("statement CSV reports every invalid row and in-file duplicate before insertion", () => {
  const csv = Buffer.from('Date,Description,Amount\n07/01/2026,Valid,-10.00\n07/01/2026,Valid,-10.00\n13/01/2026,Bad date,-2.00\n07/04/2026,,4.00\n');
  const result = parseStatementCsv(csv, {
    transactionDateColumn: "Date",
    descriptionColumn: "Description",
    amountColumn: "Amount",
  });
  assert.deepEqual(result.duplicate_rows, [3]);
  assert.deepEqual(result.errors.map((error) => error.row), [4, 5]);
});

test("statement fingerprints normalize description whitespace and money precision", () => {
  const first = statementLineFingerprint({ transaction_date: "2026-07-01", description: "Vendor  Inc", amount: -10, balance_after: null });
  const second = statementLineFingerprint({ transaction_date: "2026-07-01", description: " vendor inc ", amount: -10.001, balance_after: null });
  assert.equal(first, second);
});
