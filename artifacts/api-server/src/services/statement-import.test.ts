import assert from "node:assert/strict";
import test from "node:test";
import { inspectStatementCsv, parseStatementCsv, statementLineFingerprint, statementImportFingerprint, statementImportTotals } from "./statement-import";

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

  const splitCsv = Buffer.from('Date,Description,Debit,Credit\n7/2/2026,Purchase,12.34,\n7/3/2026,Refund,,4.56\n');
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

test("statement CSV rejects silent rounding, bad grouping and contradictory signs", () => {
  const bad = ['1.005', '1,2.34', '(+12.00)', '1 2.00', '1e3', '9999999999999.99'];
  for (const value of bad) {
    const result = parseStatementCsv(Buffer.from(`Date,Description,Amount\n2026-10-22,Example,"${value}"\n`), {
      transactionDateColumn: "Date", descriptionColumn: "Description", amountColumn: "Amount",
    });
    assert.equal(result.errors.length, 1, `${value} must be rejected without rounding`);
    assert.equal(result.rows.length, 0);
  }
});

test("debit and credit columns reject negative magnitudes instead of changing their sign", () => {
  const result = parseStatementCsv(Buffer.from('Date,Description,Debit,Credit\n2026-10-22,Example,-12.00,\n'), {
    transactionDateColumn: "Date", descriptionColumn: "Description", debitColumn: "Debit", creditColumn: "Credit",
  });
  assert.equal(result.errors.length, 1);
  assert.equal(result.rows.length, 0);
});

test("explicit date and sign conventions produce exact cents and preview binding", () => {
  const csv = Buffer.from('Date,Description,Amount\n03/04/2026,Charge,0.10\n04/04/2026,Charge,0.20\n05/04/2026,Refund,-1.00\n');
  const mapping = { transactionDateColumn: "Date", descriptionColumn: "Description", amountColumn: "Amount", dateFormat: "day_first" as const, amountSign: "positive_outflow" as const };
  const result = parseStatementCsv(csv, mapping);
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows[0].transaction_date, "2026-04-03");
  assert.deepEqual(statementImportTotals(result.rows), { debit_cents: 30, credit_cents: 100, net_cents: 70 });
  const fingerprint = statementImportFingerprint(csv, mapping, "statement-a");
  assert.equal(fingerprint, statementImportFingerprint(csv, mapping, "statement-a"));
  assert.notEqual(fingerprint, statementImportFingerprint(csv, {...mapping, dateFormat: "us"}, "statement-a"));
  assert.notEqual(fingerprint, statementImportFingerprint(Buffer.concat([csv,Buffer.from('\n')]), mapping, "statement-a"));
  assert.notEqual(fingerprint, statementImportFingerprint(csv, mapping, "statement-b"));
});

test("CSV bounds, duplicate mappings and invalid calendar dates fail clearly", () => {
  assert.throws(() => inspectStatementCsv(Buffer.alloc(2 * 1024 * 1024 + 1, 65)), /2 MB/);
  assert.throws(() => inspectStatementCsv(Buffer.from('Date,Description,Amount\n' + '2026-10-22,Example,1\n'.repeat(5001))), /5,000/);
  const mapping = { transactionDateColumn: "Date", descriptionColumn: "Description", amountColumn: "Amount" };
  assert.throws(() => parseStatementCsv(Buffer.from('Date,Description,Amount\n2026-10-22,Example,1\n'), {...mapping, balanceColumn: "Amount"}), /only one field/);
  const parsed = parseStatementCsv(Buffer.from('Date,Description,Amount\n2026-02-30,Example,1\n10/22/26,Example,1\n'), mapping);
  assert.equal(parsed.errors.length, 2);
  const maxRow = {sourceRow:2,transaction_date:"2026-10-22",posted_date:null,description:"Range",amount:999999999999.99,balance_after:null};
  assert.throws(() => statementImportTotals(Array(100).fill(maxRow)), /safe display range/);
});
