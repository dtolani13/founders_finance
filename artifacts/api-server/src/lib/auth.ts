import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const OWNER_ID = "owner";
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const DEFAULT_SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;

export type AuthCredentialRecord = {
  passwordHash: string;
  sessionVersion: number;
};

export type AuthSessionRecord = {
  tokenHash: string;
  credentialId: string;
  sessionVersion: number;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  ipHash: string | null;
  userAgentHash: string | null;
};

export type LoginAttemptRecord = {
  keyHash: string;
  failures: number;
  windowStartedAt: Date;
  blockedUntil: Date | null;
  updatedAt: Date;
};

export interface AuthStore {
  getCredential(): Promise<AuthCredentialRecord | null>;
  createCredential(passwordHash: string): Promise<boolean>;
  getSession(tokenHash: string): Promise<AuthSessionRecord | null>;
  createSession(session: AuthSessionRecord): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(now: Date): Promise<void>;
  getLoginAttempt(keyHash: string): Promise<LoginAttemptRecord | null>;
  saveLoginAttempt(attempt: LoginAttemptRecord): Promise<void>;
  clearLoginAttempt(keyHash: string): Promise<void>;
}

export type AuthContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuthStatus = {
  configured: boolean;
  authenticated: boolean;
  expiresAt: string | null;
};

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

type AuthServiceOptions = {
  secret: string;
  now?: () => Date;
  scryptCost?: number;
  sessionDurationMs?: number;
};

function scrypt(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: cost,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey as Buffer);
      },
    );
  });
}

export function validatePassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new AuthError(
      `Use at least ${PASSWORD_MIN_LENGTH} characters for your passphrase.`,
      400,
      "password_too_short",
    );
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new AuthError(
      `Passphrases cannot exceed ${PASSWORD_MAX_LENGTH} characters.`,
      400,
      "password_too_long",
    );
  }
}

export async function hashPassword(
  password: string,
  cost = DEFAULT_SCRYPT_COST,
): Promise<string> {
  validatePassword(password);
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, cost);
  return [
    "scrypt",
    cost,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [
    algorithm,
    costText,
    blockSizeText,
    parallelizationText,
    saltText,
    keyText,
  ] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !costText ||
    !blockSizeText ||
    !parallelizationText ||
    !saltText ||
    !keyText
  ) {
    return false;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  if (
    !Number.isInteger(cost) ||
    cost < 1_024 ||
    blockSize !== SCRYPT_BLOCK_SIZE ||
    parallelization !== SCRYPT_PARALLELIZATION
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(keyText, "base64url");
    const actual = await scrypt(
      password,
      Buffer.from(saltText, "base64url"),
      cost,
    );
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AuthService {
  private readonly now: () => Date;
  private readonly scryptCost: number;
  private readonly sessionDurationMs: number;

  constructor(
    private readonly store: AuthStore,
    private readonly options: AuthServiceOptions,
  ) {
    if (options.secret.length < 32) {
      throw new Error("SESSION_SECRET must be at least 32 characters.");
    }
    this.now = options.now ?? (() => new Date());
    this.scryptCost = options.scryptCost ?? DEFAULT_SCRYPT_COST;
    this.sessionDurationMs = options.sessionDurationMs ?? SESSION_DURATION_MS;
  }

  async getStatus(token?: string | null): Promise<AuthStatus> {
    const credential = await this.store.getCredential();
    if (!credential) {
      return { configured: false, authenticated: false, expiresAt: null };
    }
    if (!token) {
      return { configured: true, authenticated: false, expiresAt: null };
    }

    const session = await this.getValidSession(token, credential);
    return session
      ? {
          configured: true,
          authenticated: true,
          expiresAt: session.expiresAt.toISOString(),
        }
      : { configured: true, authenticated: false, expiresAt: null };
  }

  async setup(
    password: string,
    context: AuthContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    validatePassword(password);
    if (await this.store.getCredential()) {
      throw new AuthError(
        "Owner access is already configured.",
        409,
        "already_configured",
      );
    }

    const passwordHash = await hashPassword(password, this.scryptCost);
    const created = await this.store.createCredential(passwordHash);
    if (!created) {
      throw new AuthError(
        "Owner access is already configured.",
        409,
        "already_configured",
      );
    }
    return this.issueSession({ passwordHash, sessionVersion: 1 }, context);
  }

  async login(
    password: string,
    context: AuthContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    const credential = await this.store.getCredential();
    if (!credential) {
      throw new AuthError(
        "Owner access has not been configured.",
        409,
        "not_configured",
      );
    }

    const now = this.now();
    const attemptKey = this.contextHash(
      "login",
      context.ipAddress ?? "unknown",
    );
    const attempt = await this.store.getLoginAttempt(attemptKey);
    if (
      attempt?.blockedUntil &&
      attempt.blockedUntil.getTime() > now.getTime()
    ) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((attempt.blockedUntil.getTime() - now.getTime()) / 1000),
      );
      throw new AuthError(
        "Too many unsuccessful attempts. Try again after the lockout period.",
        429,
        "temporarily_locked",
        retryAfterSeconds,
      );
    }

    if (!(await verifyPassword(password, credential.passwordHash))) {
      const windowExpired =
        !attempt ||
        now.getTime() - attempt.windowStartedAt.getTime() >= ATTEMPT_WINDOW_MS;
      const failures = windowExpired ? 1 : attempt.failures + 1;
      const blockedUntil =
        failures >= MAX_FAILURES
          ? new Date(now.getTime() + BLOCK_DURATION_MS)
          : null;
      await this.store.saveLoginAttempt({
        keyHash: attemptKey,
        failures,
        windowStartedAt: windowExpired ? now : attempt.windowStartedAt,
        blockedUntil,
        updatedAt: now,
      });

      throw new AuthError(
        blockedUntil
          ? "Too many unsuccessful attempts. Access is temporarily locked."
          : "That passphrase did not unlock Founders Finance.",
        blockedUntil ? 429 : 401,
        blockedUntil ? "temporarily_locked" : "invalid_credentials",
        blockedUntil ? BLOCK_DURATION_MS / 1000 : undefined,
      );
    }

    await this.store.clearLoginAttempt(attemptKey);
    return this.issueSession(credential, context);
  }

  async authenticate(token?: string | null): Promise<AuthSessionRecord | null> {
    if (!token) return null;
    const credential = await this.store.getCredential();
    if (!credential) return null;
    return this.getValidSession(token, credential);
  }

  async logout(token?: string | null): Promise<void> {
    if (token) await this.store.deleteSession(hashToken(token));
  }

  private async getValidSession(
    token: string,
    credential: AuthCredentialRecord,
  ): Promise<AuthSessionRecord | null> {
    const tokenHash = hashToken(token);
    const session = await this.store.getSession(tokenHash);
    const now = this.now();
    if (
      !session ||
      session.credentialId !== OWNER_ID ||
      session.sessionVersion !== credential.sessionVersion ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      if (session) await this.store.deleteSession(tokenHash);
      return null;
    }
    return session;
  }

  private async issueSession(
    credential: AuthCredentialRecord,
    context: AuthContext,
  ): Promise<{ token: string; expiresAt: Date }> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.sessionDurationMs);
    const token = randomBytes(32).toString("base64url");
    await this.store.deleteExpiredSessions(now);
    await this.store.createSession({
      tokenHash: hashToken(token),
      credentialId: OWNER_ID,
      sessionVersion: credential.sessionVersion,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      ipHash: context.ipAddress
        ? this.contextHash("ip", context.ipAddress)
        : null,
      userAgentHash: context.userAgent
        ? this.contextHash("ua", context.userAgent)
        : null,
    });
    return { token, expiresAt };
  }

  private contextHash(purpose: string, value: string): string {
    return createHmac("sha256", this.options.secret)
      .update(`${purpose}:${value}`)
      .digest("hex");
  }
}
