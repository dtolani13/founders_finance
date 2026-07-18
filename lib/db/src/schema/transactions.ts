import { sql } from "drizzle-orm";
import { check, pgTable, uuid, text, boolean, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vendors } from "./vendors";

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_date: date("transaction_date").notNull(),
  transaction_type: text("transaction_type").notNull(),
  description: text("description").notNull(),
  vendor_id: uuid("vendor_id").references(() => vendors.id),
  total_amount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").default("draft").notNull(),
  business_purpose: text("business_purpose"),
  source_document_id: uuid("source_document_id"),
  is_balanced: boolean("is_balanced").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("transactions_total_amount_positive", sql`${table.total_amount} > 0`),
  check("transactions_status_check", sql`${table.status} in ('draft', 'needs_review', 'posted', 'voided')`),
]);

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true, created_at: true, updated_at: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;
