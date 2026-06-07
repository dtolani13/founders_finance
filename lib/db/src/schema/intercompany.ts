import { pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactions } from "./transactions";
import { entities } from "./entities";

export const intercompany_links = pgTable("intercompany_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  source_transaction_id: uuid("source_transaction_id").references(() => transactions.id),
  owing_entity_id: uuid("owing_entity_id").references(() => entities.id).notNull(),
  owed_entity_id: uuid("owed_entity_id").references(() => entities.id).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").default("open").notNull(),
  reimbursement_transaction_id: uuid("reimbursement_transaction_id").references(() => transactions.id),
  memo: text("memo"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertIntercompanyLinkSchema = createInsertSchema(intercompany_links).omit({ id: true, created_at: true, updated_at: true });
export type InsertIntercompanyLink = z.infer<typeof insertIntercompanyLinkSchema>;
export type IntercompanyLink = typeof intercompany_links.$inferSelect;
