import { sql } from "drizzle-orm";
import { check, pgTable, uuid, text, boolean, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { entities } from "./entities";

export const allocation_presets = pgTable("allocation_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const allocation_preset_lines = pgTable("allocation_preset_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  preset_id: uuid("preset_id").references(() => allocation_presets.id, { onDelete: "cascade" }).notNull(),
  entity_id: uuid("entity_id").references(() => entities.id).notNull(),
  percent: numeric("percent", { precision: 7, scale: 4 }).notNull(),
}, (table) => [
  check("allocation_preset_lines_percent_range", sql`${table.percent} >= 0 and ${table.percent} <= 100`),
]);

export const insertAllocationPresetSchema = createInsertSchema(allocation_presets).omit({ id: true, created_at: true, updated_at: true });
export type InsertAllocationPreset = z.infer<typeof insertAllocationPresetSchema>;
export type AllocationPreset = typeof allocation_presets.$inferSelect;

export const insertAllocationPresetLineSchema = createInsertSchema(allocation_preset_lines).omit({ id: true });
export type InsertAllocationPresetLine = z.infer<typeof insertAllocationPresetLineSchema>;
export type AllocationPresetLine = typeof allocation_preset_lines.$inferSelect;
