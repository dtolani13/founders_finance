import { pgTable, uuid, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";
import { accounts } from "./accounts";
import { transactions } from "./transactions";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  document_type: text("document_type").notNull(),
  file_name: text("file_name"),
  file_path: text("file_path"),
  entity_id: uuid("entity_id").references(() => entities.id),
  account_id: uuid("account_id").references(() => accounts.id),
  transaction_id: uuid("transaction_id").references(() => transactions.id),
  statement_id: uuid("statement_id"),
  period_month: date("period_month"),
  description: text("description"),
  evidence_status: text("evidence_status").default("metadata_only").notNull(),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, uploaded_at: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
