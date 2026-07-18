import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import cookieParser from "cookie-parser";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  AuthService,
  type AuthCredentialRecord,
  type AuthSessionRecord,
  type AuthStore,
  type LoginAttemptRecord,
} from "./auth";
import { createRequireAuth } from "../middlewares/auth";
import { createAuthRouter } from "../routes/auth";

class MemoryAuthStore implements AuthStore {
  credential: AuthCredentialRecord | null = null;
  sessions = new Map<string, AuthSessionRecord>();
  attempts = new Map<string, LoginAttemptRecord>();

  async getCredential() {
    return this.credential;
  }

  async createCredential(passwordHash: string) {
    if (this.credential) return false;
    this.credential = { passwordHash, sessionVersion: 1 };
    return true;
  }

  async getSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async createSession(session: AuthSessionRecord) {
    this.sessions.set(session.tokenHash, session);
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async deleteExpiredSessions(now: Date) {
    for (const [tokenHash, session] of this.sessions) {
      if (session.expiresAt.getTime() < now.getTime())
        this.sessions.delete(tokenHash);
    }
  }

  async getLoginAttempt(keyHash: string) {
    return this.attempts.get(keyHash) ?? null;
  }

  async saveLoginAttempt(attempt: LoginAttemptRecord) {
    this.attempts.set(attempt.keyHash, attempt);
  }

  async clearLoginAttempt(keyHash: string) {
    this.attempts.delete(keyHash);
  }
}

function createService(store: MemoryAuthStore, now: () => Date) {
  return new AuthService(store, {
    secret: "test-secret-that-is-at-least-thirty-two-characters-long",
    now,
    scryptCost: 1_024,
    sessionDurationMs: 1_000,
  });
}

async function withServer(
  service: AuthService,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(service));
  app.get("/api/protected", createRequireAuth(service), (_req, res) => {
    res.json({ protected: true });
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(500)
        .json({
          error: error instanceof Error ? error.message : "Unknown error",
        });
    },
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function sessionCookie(response: Response): string {
  const rawCookie = response.headers.get("set-cookie");
  assert.ok(rawCookie, "response should set a session cookie");
  assert.match(rawCookie, /HttpOnly/i);
  assert.match(rawCookie, /SameSite=Strict/i);
  assert.match(rawCookie, /Path=\/api/i);
  return rawCookie.split(";", 1)[0];
}

test("setup protects finance routes and logout revokes the session", async () => {
  const store = new MemoryAuthStore();
  let currentTime = new Date("2026-07-18T12:00:00.000Z");
  const service = createService(store, () => currentTime);

  await withServer(service, async (baseUrl) => {
    const initialStatus = await fetch(`${baseUrl}/api/auth/status`);
    assert.deepEqual(await initialStatus.json(), {
      configured: false,
      authenticated: false,
      expires_at: null,
    });

    const denied = await fetch(`${baseUrl}/api/protected`);
    assert.equal(denied.status, 401);

    const setup = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple" }),
    });
    assert.equal(setup.status, 201);
    const cookie = sessionCookie(setup);

    const allowed = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie },
    });
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { protected: true });

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    assert.equal(logout.status, 204);

    const deniedAfterLogout = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie },
    });
    assert.equal(deniedAfterLogout.status, 401);
  });
});

test("expired sessions cannot access protected routes", async () => {
  const store = new MemoryAuthStore();
  let currentTime = new Date("2026-07-18T12:00:00.000Z");
  const service = createService(store, () => currentTime);

  await withServer(service, async (baseUrl) => {
    const setup = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple" }),
    });
    const cookie = sessionCookie(setup);
    currentTime = new Date(currentTime.getTime() + 1_001);

    const denied = await fetch(`${baseUrl}/api/protected`, {
      headers: { Cookie: cookie },
    });
    assert.equal(denied.status, 401);
  });
});

test("repeated invalid passphrases trigger a persistent lockout", async () => {
  const store = new MemoryAuthStore();
  const currentTime = new Date("2026-07-18T12:00:00.000Z");
  const service = createService(store, () => currentTime);
  await service.setup("correct horse battery staple", {
    ipAddress: "127.0.0.1",
  });

  await withServer(service, async (baseUrl) => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "definitely the wrong passphrase" }),
      });
      assert.equal(response.status, 401);
    }

    const lockout = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "definitely the wrong passphrase" }),
    });
    assert.equal(lockout.status, 429);
    assert.equal(lockout.headers.get("retry-after"), "900");

    const stillLocked = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "correct horse battery staple" }),
    });
    assert.equal(stillLocked.status, 429);
  });
});
