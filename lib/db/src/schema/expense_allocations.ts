import { sql } from "drizzle-orm";
import { check, pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactions } from "./transactions";
import { entities } from "./entities";
import { categories } from "./categories";

export const expense_allocations = pgTable("expense_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_id: uuid("transaction_id").references(() => transactions.id, { onDelete: "cascade" }).notNull(),
  target_entity_id: uuid("target_entity_id").references(() => entities.id).notNull(),
  category_id: uuid("category_id").references(() => categories.id),
  allocation_percent: numeric("allocation_percent", { precision: 7, scale: 4 }),
  allocation_amount: numeric("allocation_amount", { precision: 14, scale: 2 }).notNull(),
  memo: text("memo"),
  creates_intercompany_balance: boolean("creates_intercompany_balance").default(false).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("expense_allocations_amount_positive", sql`${table.allocation_amount} > 0`),
  check(
    "expense_allocations_percent_range",
    sql`${table.allocation_percent} is null or (${table.allocation_percent} >= 0 and ${table.allocation_percent} <= 100)`,
  ),
]);

export const insertExpenseAllocationSchema = createInsertSchema(expense_allocations).omit({ id: true, created_at: true });
export type InsertExpenseAllocation = z.infer<typeof insertExpenseAllocationSchema>;
export type ExpenseAllocation = typeof expense_allocations.$inferSelect;
