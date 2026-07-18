import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const auth_credentials = pgTable("auth_credentials", {
  id: text("id").primaryKey(),
  password_hash: text("password_hash").notNull(),
  session_version: integer("session_version").default(1).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auth_sessions = pgTable("auth_sessions", {
  token_hash: text("token_hash").primaryKey(),
  credential_id: text("credential_id")
    .references(() => auth_credentials.id, { onDelete: "cascade" })
    .notNull(),
  session_version: integer("session_version").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  ip_hash: text("ip_hash"),
  user_agent_hash: text("user_agent_hash"),
});

export const auth_login_attempts = pgTable("auth_login_attempts", {
  key_hash: text("key_hash").primaryKey(),
  failures: integer("failures").default(0).notNull(),
  window_started_at: timestamp("window_started_at", {
    withTimezone: true,
  }).notNull(),
  blocked_until: timestamp("blocked_until", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type AuthCredential = typeof auth_credentials.$inferSelect;
export type AuthSession = typeof auth_sessions.$inferSelect;
export type AuthLoginAttempt = typeof auth_login_attempts.$inferSelect;
