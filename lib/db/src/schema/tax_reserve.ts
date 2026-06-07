import { pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";

export const tax_reserve_rules = pgTable("tax_reserve_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  reserve_percent: numeric("reserve_percent", { precision: 7, scale: 4 }).notNull(),
  rule_basis: text("rule_basis").default("revenue").notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertTaxReserveRuleSchema = createInsertSchema(tax_reserve_rules).omit({ id: true, created_at: true, updated_at: true });
export type InsertTaxReserveRule = z.infer<typeof insertTaxReserveRuleSchema>;
export type TaxReserveRule = typeof tax_reserve_rules.$inferSelect;
