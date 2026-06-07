import { pgTable, uuid, text, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";

export const monthly_close_periods = pgTable("monthly_close_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  period_month: date("period_month").notNull(),
  status: text("status").default("open").notNull(),
  all_statements_uploaded: boolean("all_statements_uploaded").default(false).notNull(),
  all_transactions_reconciled: boolean("all_transactions_reconciled").default(false).notNull(),
  all_receipts_attached: boolean("all_receipts_attached").default(false).notNull(),
  all_allocations_complete: boolean("all_allocations_complete").default(false).notNull(),
  intercompany_reviewed: boolean("intercompany_reviewed").default(false).notNull(),
  tax_reserve_reviewed: boolean("tax_reserve_reviewed").default(false).notNull(),
  export_generated: boolean("export_generated").default(false).notNull(),
  closed_at: timestamp("closed_at", { withTimezone: true }),
  correction_required_after_close: boolean("correction_required_after_close").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertMonthlyClosePeriodSchema = createInsertSchema(monthly_close_periods).omit({ id: true, created_at: true, updated_at: true });
export type InsertMonthlyClosePeriod = z.infer<typeof insertMonthlyClosePeriodSchema>;
export type MonthlyClosePeriod = typeof monthly_close_periods.$inferSelect;
