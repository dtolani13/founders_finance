import { pgTable, uuid, text, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";

export const audit_log = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  table_name: text("table_name").notNull(),
  record_id: uuid("record_id").notNull(),
  action: text("action").notNull(),
  previous_value: text("previous_value"),
  new_value: text("new_value"),
  memo: text("memo"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const exports_table = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id").references(() => entities.id),
  export_type: text("export_type").notNull(),
  period_month: date("period_month"),
  file_path: text("file_path"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(audit_log).omit({ id: true, created_at: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof audit_log.$inferSelect;

export const insertExportSchema = createInsertSchema(exports_table).omit({ id: true, created_at: true });
export type InsertExport = z.infer<typeof insertExportSchema>;
export type Export = typeof exports_table.$inferSelect;
