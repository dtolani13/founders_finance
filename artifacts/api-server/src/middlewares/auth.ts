import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthService } from "../lib/auth";

export const SESSION_COOKIE_NAME = "ff_session";

export function getSessionToken(req: Request): string | null {
  const value = req.cookies?.[SESSION_COOKIE_NAME];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createRequireAuth(service: AuthService): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await service.authenticate(getSessionToken(req));
      if (!session) {
        res.status(401).json({
          error: "Authentication required",
          code: "authentication_required",
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
