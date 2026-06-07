import { pgTable, uuid, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { accounts } from "./accounts";
import { transactions } from "./transactions";
import { documents } from "./documents";

export const statements = pgTable("statements", {
  id: uuid("id").primaryKey().defaultRandom(),
  account_id: uuid("account_id").references(() => accounts.id).notNull(),
  statement_month: date("statement_month").notNull(),
  document_id: uuid("document_id").references(() => documents.id),
  opening_balance: numeric("opening_balance", { precision: 14, scale: 2 }),
  closing_balance: numeric("closing_balance", { precision: 14, scale: 2 }),
  status: text("status").default("uploaded").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const statement_lines = pgTable("statement_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  statement_id: uuid("statement_id").references(() => statements.id, { onDelete: "cascade" }).notNull(),
  transaction_date: date("transaction_date"),
  posted_date: date("posted_date"),
  description: text("description"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  balance_after: numeric("balance_after", { precision: 14, scale: 2 }),
  matched_transaction_id: uuid("matched_transaction_id").references(() => transactions.id),
  status: text("status").default("unmatched").notNull(),
  notes: text("notes"),
});

export const reconciliation_matches = pgTable("reconciliation_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  statement_line_id: uuid("statement_line_id").references(() => statement_lines.id).notNull(),
  transaction_id: uuid("transaction_id").references(() => transactions.id).notNull(),
  match_type: text("match_type").notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 2 }),
  approved_by_user: text("approved_by_user").default("false"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertStatementSchema = createInsertSchema(statements).omit({ id: true, created_at: true, updated_at: true });
export type InsertStatement = z.infer<typeof insertStatementSchema>;
export type Statement = typeof statements.$inferSelect;

export const insertStatementLineSchema = createInsertSchema(statement_lines).omit({ id: true });
export type InsertStatementLine = z.infer<typeof insertStatementLineSchema>;
export type StatementLine = typeof statement_lines.$inferSelect;
