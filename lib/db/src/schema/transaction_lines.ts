import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactions } from "./transactions";
import { entities } from "./entities";
import { accounts } from "./accounts";
import { categories } from "./categories";

export const transaction_lines = pgTable("transaction_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_id: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }).notNull(),
  entity_id: uuid("entity_id").references(() => entities.id),
  account_id: uuid("account_id").references(() => accounts.id),
  category_id: uuid("category_id").references(() => categories.id),
  debit: numeric("debit", { precision: 14, scale: 2 }).default("0").notNull(),
  credit: numeric("credit", { precision: 14, scale: 2 }).default("0").notNull(),
  memo: text("memo"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTransactionLineSchema = createInsertSchema(transaction_lines).omit({ id: true, created_at: true });
export type InsertTransactionLine = z.infer<typeof insertTransactionLineSchema>;
export type TransactionLine = typeof transaction_lines.$inferSelect;
