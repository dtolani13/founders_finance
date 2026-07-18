import { authService } from "../lib/auth-store";
import { createAuthRouter } from "./auth";

export default createAuthRouter(authService);
