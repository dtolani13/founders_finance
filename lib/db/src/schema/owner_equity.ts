import { sql } from "drizzle-orm";
import { check, pgTable, uuid, text, timestamp, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactions } from "./transactions";
import { entities } from "./entities";

export const owner_contributions = pgTable("owner_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_id: uuid("transaction_id").references(() => transactions.id),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  contribution_type: text("contribution_type").default("capital_contribution").notNull(),
  memo: text("memo"),
  contribution_date: date("contribution_date"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("owner_contributions_amount_positive", sql`${table.amount} > 0`),
]);

export const insertOwnerContributionSchema = createInsertSchema(owner_contributions).omit({ id: true, created_at: true });
export type InsertOwnerContribution = z.infer<typeof insertOwnerContributionSchema>;
export type OwnerContribution = typeof owner_contributions.$inferSelect;

export const owner_draws = pgTable("owner_draws", {
  id: uuid("id").primaryKey().defaultRandom(),
  transaction_id: uuid("transaction_id").references(() => transactions.id),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  memo: text("memo"),
  draw_date: date("draw_date").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("owner_draws_amount_positive", sql`${table.amount} > 0`),
]);

export const insertOwnerDrawSchema = createInsertSchema(owner_draws).omit({ id: true, created_at: true });
export type InsertOwnerDraw = z.infer<typeof insertOwnerDrawSchema>;
export type OwnerDraw = typeof owner_draws.$inferSelect;
