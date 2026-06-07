import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { transactions } from "./transactions";
import { entities } from "./entities";

export const reimbursement_requests = pgTable("reimbursement_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  original_transaction_id: uuid("original_transaction_id").references(() => transactions.id),
  owed_to_entity_id: uuid("owed_to_entity_id").references(() => entities.id).notNull(),
  owed_by_entity_id: uuid("owed_by_entity_id").references(() => entities.id).notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: text("status").default("pending").notNull(),
  paid_transaction_id: uuid("paid_transaction_id").references(() => transactions.id),
  memo: text("memo"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertReimbursementRequestSchema = createInsertSchema(reimbursement_requests).omit({ id: true, created_at: true, updated_at: true });
export type InsertReimbursementRequest = z.infer<typeof insertReimbursementRequestSchema>;
export type ReimbursementRequest = typeof reimbursement_requests.$inferSelect;
