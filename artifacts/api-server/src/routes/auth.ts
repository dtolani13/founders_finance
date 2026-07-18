import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { AuthError, type AuthService } from "../lib/auth";
import { getSessionToken, SESSION_COOKIE_NAME } from "../middlewares/auth";

const credentialsSchema = z.object({
  password: z.string(),
});

function requestContext(req: Request) {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
    userAgent: req.get("user-agent") ?? null,
  };
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
    expires: expiresAt,
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api",
  });
}

function sendAuthError(error: unknown, res: Response): boolean {
  if (!(error instanceof AuthError)) return false;
  if (error.retryAfterSeconds) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
  }
  res.status(error.status).json({
    error: error.message,
    code: error.code,
    retry_after_seconds: error.retryAfterSeconds,
  });
  return true;
}

export function createAuthRouter(service: AuthService): Router {
  const router = Router();

  router.get("/status", async (req, res, next) => {
    try {
      const status = await service.getStatus(getSessionToken(req));
      if (!status.authenticated && getSessionToken(req))
        clearSessionCookie(res);
      res.setHeader("Cache-Control", "no-store");
      res.json({
        configured: status.configured,
        authenticated: status.authenticated,
        expires_at: status.expiresAt,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/setup", async (req, res, next) => {
    try {
      const { password } = credentialsSchema.parse(req.body);
      const session = await service.setup(password, requestContext(req));
      setSessionCookie(res, session.token, session.expiresAt);
      res
        .status(201)
        .json({
          authenticated: true,
          expires_at: session.expiresAt.toISOString(),
        });
    } catch (error) {
      if (!sendAuthError(error, res)) next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { password } = credentialsSchema.parse(req.body);
      const session = await service.login(password, requestContext(req));
      setSessionCookie(res, session.token, session.expiresAt);
      res.json({
        authenticated: true,
        expires_at: session.expiresAt.toISOString(),
      });
    } catch (error) {
      if (!sendAuthError(error, res)) next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      await service.logout(getSessionToken(req));
      clearSessionCookie(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
