import { sql } from "drizzle-orm";
import { bigint, check, date, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
  mime_type: text("mime_type"),
  file_size_bytes: bigint("file_size_bytes", { mode: "number" }),
  file_sha256: text("file_sha256"),
  entity_id: uuid("entity_id").references(() => entities.id),
  account_id: uuid("account_id").references(() => accounts.id),
  transaction_id: uuid("transaction_id").references(() => transactions.id),
  statement_id: uuid("statement_id"),
  period_month: date("period_month"),
  description: text("description"),
  evidence_status: text("evidence_status").default("metadata_only").notNull(),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  archived_at: timestamp("archived_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("documents_file_path_unique").on(table.file_path),
  check(
    "documents_type_check",
    sql`${table.document_type} in ('receipt', 'invoice', 'screenshot', 'contract', 'bank_statement', 'subscription_receipt', 'tax_document', 'note', 'other')`,
  ),
  check(
    "documents_evidence_status_check",
    sql`${table.evidence_status} in ('metadata_only', 'attached', 'missing', 'needs_review', 'archived')`,
  ),
  check("documents_file_size_nonnegative", sql`${table.file_size_bytes} is null or ${table.file_size_bytes} >= 0`),
  check(
    "documents_file_metadata_consistent",
    sql`(${table.file_path} is null and ${table.mime_type} is null and ${table.file_size_bytes} is null and ${table.file_sha256} is null) or (${table.file_path} is not null and ${table.mime_type} is not null and ${table.file_size_bytes} is not null and ${table.file_sha256} is not null)`,
  ),
]);

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploaded_at: true,
  updated_at: true,
  archived_at: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;
