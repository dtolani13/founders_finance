import { pgTable, uuid, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const entities = pgTable("entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  legal_name: text("legal_name").notNull(),
  display_name: text("display_name").notNull(),
  short_code: text("short_code").notNull().unique(),
  entity_type: text("entity_type").notNull(),
  purpose: text("purpose"),
  tax_classification_note: text("tax_classification_note"),
  primary_color: text("primary_color"),
  secondary_color: text("secondary_color"),
  accent_color: text("accent_color"),
  logo_path: text("logo_path"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertEntitySchema = createInsertSchema(entities).omit({ id: true, created_at: true, updated_at: true });
export type InsertEntity = z.infer<typeof insertEntitySchema>;
export type Entity = typeof entities.$inferSelect;
