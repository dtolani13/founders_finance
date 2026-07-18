import { pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  name: text("name").notNull(),
  account_type: text("account_type").notNull(),
  institution_name: text("institution_name"),
  last_four: text("last_four"),
  opening_balance: numeric("opening_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  current_balance: numeric("current_balance", { precision: 14, scale: 2 }).default("0").notNull(),
  is_tax_reserve: boolean("is_tax_reserve").default(false).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true, created_at: true, updated_at: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;
