import { eq, lt } from "drizzle-orm";
import {
  auth_credentials,
  auth_login_attempts,
  auth_sessions,
  db,
} from "@workspace/db";
import {
  AuthService,
  type AuthSessionRecord,
  type AuthStore,
  type LoginAttemptRecord,
} from "./auth";

const OWNER_ID = "owner";

export class DrizzleAuthStore implements AuthStore {
  async getCredential() {
    const [row] = await db
      .select()
      .from(auth_credentials)
      .where(eq(auth_credentials.id, OWNER_ID))
      .limit(1);
    return row
      ? { passwordHash: row.password_hash, sessionVersion: row.session_version }
      : null;
  }

  async createCredential(passwordHash: string): Promise<boolean> {
    const rows = await db
      .insert(auth_credentials)
      .values({ id: OWNER_ID, password_hash: passwordHash })
      .onConflictDoNothing()
      .returning({ id: auth_credentials.id });
    return rows.length === 1;
  }

  async getSession(tokenHash: string) {
    const [row] = await db
      .select()
      .from(auth_sessions)
      .where(eq(auth_sessions.token_hash, tokenHash))
      .limit(1);
    return row
      ? {
          tokenHash: row.token_hash,
          credentialId: row.credential_id,
          sessionVersion: row.session_version,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
          lastSeenAt: row.last_seen_at,
          ipHash: row.ip_hash,
          userAgentHash: row.user_agent_hash,
        }
      : null;
  }

  async createSession(session: AuthSessionRecord): Promise<void> {
    await db.insert(auth_sessions).values({
      token_hash: session.tokenHash,
      credential_id: session.credentialId,
      session_version: session.sessionVersion,
      expires_at: session.expiresAt,
      created_at: session.createdAt,
      last_seen_at: session.lastSeenAt,
      ip_hash: session.ipHash,
      user_agent_hash: session.userAgentHash,
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await db
      .delete(auth_sessions)
      .where(eq(auth_sessions.token_hash, tokenHash));
  }

  async deleteExpiredSessions(now: Date): Promise<void> {
    await db.delete(auth_sessions).where(lt(auth_sessions.expires_at, now));
  }

  async getLoginAttempt(keyHash: string) {
    const [row] = await db
      .select()
      .from(auth_login_attempts)
      .where(eq(auth_login_attempts.key_hash, keyHash))
      .limit(1);
    return row
      ? {
          keyHash: row.key_hash,
          failures: row.failures,
          windowStartedAt: row.window_started_at,
          blockedUntil: row.blocked_until,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async saveLoginAttempt(attempt: LoginAttemptRecord): Promise<void> {
    await db
      .insert(auth_login_attempts)
      .values({
        key_hash: attempt.keyHash,
        failures: attempt.failures,
        window_started_at: attempt.windowStartedAt,
        blocked_until: attempt.blockedUntil,
        updated_at: attempt.updatedAt,
      })
      .onConflictDoUpdate({
        target: auth_login_attempts.key_hash,
        set: {
          failures: attempt.failures,
          window_started_at: attempt.windowStartedAt,
          blocked_until: attempt.blockedUntil,
          updated_at: attempt.updatedAt,
        },
      });
  }

  async clearLoginAttempt(keyHash: string): Promise<void> {
    await db
      .delete(auth_login_attempts)
      .where(eq(auth_login_attempts.key_hash, keyHash));
  }
}

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET is required to protect Founders Finance sessions.",
  );
}

export const authService = new AuthService(new DrizzleAuthStore(), {
  secret: sessionSecret,
});
