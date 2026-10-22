import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";

export const MAX_STATEMENT_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_STATEMENT_CSV_ROWS = 5_000;

export type StatementImportMapping = {
  transactionDateColumn: string;
  postedDateColumn?: string;
  descriptionColumn: string;
  amountColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  balanceColumn?: string;
  dateFormat?: "us" | "iso" | "day_first";
  amountSign?: "negative_outflow" | "positive_outflow";
};

export type ParsedStatementImportRow = {
  sourceRow: number;
  transaction_date: string;
  posted_date: string | null;
  description: string;
  amount: number;
  balance_after: number | null;
};

export type StatementImportError = { row: number; message: string };

function csvRecords(input: Buffer): string[][] {
  if (!input.length) throw new Error("The CSV file is empty.");
  if (input.length > MAX_STATEMENT_CSV_BYTES) throw new Error("CSV files are limited to 2 MB.");
  const records = parse(input, {
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
    max_record_size: 65_536,
  }) as string[][];
  if (records.length < 2) throw new Error("The CSV must contain a header row and at least one data row.");
  if (records[0].length > 128) throw new Error("CSV files are limited to 128 columns.");
  if (records.length - 1 > MAX_STATEMENT_CSV_ROWS) throw new Error(`CSV files are limited to ${MAX_STATEMENT_CSV_ROWS.toLocaleString()} data rows.`);
  return records;
}

function headersFrom(records: string[][]): string[] {
  const headers = records[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("Every CSV column must have a header.");
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    throw new Error("CSV headers must be unique.");
  }
  return headers;
}

export function inspectStatementCsv(input: Buffer) {
  const records = csvRecords(input);
  const headers = headersFrom(records);
  return {
    headers,
    row_count: records.length - 1,
    sample_rows: records.slice(1, 6).map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""]))),
  };
}

function parseDate(value: string, format: StatementImportMapping["dateFormat"] = "us"): string {
  const trimmed = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (!match || format === "iso") throw new Error("Use four-digit years and the selected date format (ISO, MM/DD/YYYY or DD/MM/YYYY).");
    month = Number(match[format === "day_first" ? 2 : 1]);
    day = Number(match[format === "day_first" ? 1 : 2]);
    year = Number(match[3]);
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) {
    throw new Error("The date is not valid.");
  }
  return candidate.toISOString().slice(0, 10);
}

function parseMoney(value: string, allowBlank = false): number | null {
  const trimmed = value.trim();
  if (!trimmed && allowBlank) return null;
  if (!trimmed) throw new Error("Amount is required.");
  const parenthesized = /^\([^()]+\)$/.test(trimmed);
  let valueText = parenthesized ? trimmed.slice(1, -1) : trimmed;
  const match = /^([+-]?)(?:\$)?((?:\d+|[1-9]\d{0,2}(?:,\d{3})+))(?:\.(\d{1,2}))?$/.exec(valueText);
  if (!match || (parenthesized && match[1])) throw new Error("Use a valid USD amount with correct comma grouping and at most two decimal places; values are never rounded.");
  const cents = BigInt(match[2].replaceAll(",", "")) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  if (cents > 99_999_999_999_999n) throw new Error("Amount exceeds the supported database range.");
  const negative = parenthesized || match[1] === "-";
  return Number(negative ? -cents : cents) / 100;
}

export function statementImportFingerprint(input: Buffer, mapping: StatementImportMapping, statementId: string): string {
  return createHash("sha256").update("statement-csv-v2\0").update(statementId).update("\0")
    .update(JSON.stringify([mapping.transactionDateColumn, mapping.postedDateColumn ?? "", mapping.descriptionColumn,
      mapping.amountColumn ?? "", mapping.debitColumn ?? "", mapping.creditColumn ?? "", mapping.balanceColumn ?? "",
      mapping.dateFormat ?? "us", mapping.amountSign ?? "negative_outflow", "USD"]))
    .update("\0").update(input).digest("hex");
}

export function statementImportTotals(rows: ParsedStatementImportRow[]) {
  let debit = 0n, credit = 0n;
  for (const row of rows) {
    const cents = BigInt(row.amount.toFixed(2).replace(".", ""));
    if (cents < 0n) debit -= cents;
    else credit += cents;
  }
  if (debit > BigInt(Number.MAX_SAFE_INTEGER) || credit > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Combined statement totals exceed the safe display range. Split the file into smaller statements.");
  }
  return { debit_cents: Number(debit), credit_cents: Number(credit), net_cents: Number(credit - debit) };
}

export function statementLineFingerprint(row: Pick<ParsedStatementImportRow, "transaction_date" | "description" | "amount" | "balance_after">): string {
  const description = row.description.trim().replace(/\s+/g, " ").toLowerCase();
  const amount = row.amount.toFixed(2);
  const balance = row.balance_after == null ? "" : row.balance_after.toFixed(2);
  return `${row.transaction_date}|${description}|${amount}|${balance}`;
}

export function parseStatementCsv(input: Buffer, mapping: StatementImportMapping) {
  const records = csvRecords(input);
  const headers = headersFrom(records);
  const headerIndexes = new Map(headers.map((header, index) => [header, index]));
  const selectedColumns = [
    mapping.transactionDateColumn,
    mapping.postedDateColumn,
    mapping.descriptionColumn,
    mapping.amountColumn,
    mapping.debitColumn,
    mapping.creditColumn,
    mapping.balanceColumn,
  ].filter(Boolean) as string[];
  if (new Set(selectedColumns).size !== selectedColumns.length) throw new Error("Map each CSV column to only one field.");
  const missing = selectedColumns.filter((column) => !headerIndexes.has(column));
  if (missing.length) throw new Error(`Mapped column not found: ${missing.join(", ")}.`);
  const usesAmount = Boolean(mapping.amountColumn);
  const usesDebitCredit = Boolean(mapping.debitColumn || mapping.creditColumn);
  if (usesAmount === usesDebitCredit) throw new Error("Map either one amount column or debit/credit columns.");
  if (usesDebitCredit && (!mapping.debitColumn || !mapping.creditColumn)) throw new Error("Map both debit and credit columns.");

  const rows: ParsedStatementImportRow[] = [];
  const errors: StatementImportError[] = [];
  const duplicateRows: number[] = [];
  const fingerprints = new Set<string>();
  const value = (record: string[], column: string | undefined) => column ? (record[headerIndexes.get(column)!] ?? "") : "";

  records.slice(1).forEach((record, index) => {
    const sourceRow = index + 2;
    try {
      const transactionDate = parseDate(value(record, mapping.transactionDateColumn), mapping.dateFormat);
      const postedRaw = value(record, mapping.postedDateColumn);
      const description = value(record, mapping.descriptionColumn).trim();
      if (!description) throw new Error("Description is required.");
      if (description.length > 1000) throw new Error("Description cannot exceed 1,000 characters.");
      let amount: number;
      if (mapping.amountColumn) {
        amount = parseMoney(value(record, mapping.amountColumn))!;
        if (mapping.amountSign === "positive_outflow") amount = -amount;
      } else {
        const debit = parseMoney(value(record, mapping.debitColumn), true);
        const credit = parseMoney(value(record, mapping.creditColumn), true);
        if ((debit ?? 0) < 0 || (credit ?? 0) < 0) throw new Error("Debit and credit columns must use nonnegative magnitudes.");
        if (debit != null && credit != null && debit !== 0 && credit !== 0) throw new Error("A row cannot contain both a debit and a credit.");
        if ((debit == null || debit === 0) && (credit == null || credit === 0)) throw new Error("Debit or credit is required.");
        amount = debit != null && debit !== 0 ? -Math.abs(debit) : Math.abs(credit!);
      }
      if (amount === 0) throw new Error("Amount cannot be zero.");
      const balanceRaw = value(record, mapping.balanceColumn);
      const row: ParsedStatementImportRow = {
        sourceRow,
        transaction_date: transactionDate,
        posted_date: postedRaw ? parseDate(postedRaw, mapping.dateFormat) : null,
        description,
        amount,
        balance_after: balanceRaw ? parseMoney(balanceRaw, true) : null,
      };
      const fingerprint = statementLineFingerprint(row);
      if (fingerprints.has(fingerprint)) duplicateRows.push(sourceRow);
      else fingerprints.add(fingerprint);
      rows.push(row);
    } catch (error) {
      errors.push({ row: sourceRow, message: error instanceof Error ? error.message : "Invalid row." });
    }
  });

  statementImportTotals(rows);
  return { headers, rows, errors, duplicate_rows: duplicateRows };
}
