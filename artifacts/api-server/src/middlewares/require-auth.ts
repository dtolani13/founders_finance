import { authService } from "../lib/auth-store";
import { createRequireAuth } from "./auth";

export const requireAuth = createRequireAuth(authService);
