import type { NextFunction, Request, Response } from "express";

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function securityMiddleware(req: Request, res: Response, next: NextFunction) {
  for (const [header, value] of Object.entries(securityHeaders)) {
    res.setHeader(header, value);
  }
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  let host: URL;
  try { host = new URL(`http://${req.headers.host ?? ""}`); }
  catch { res.status(403).json({ error: "A local application host is required." }); return; }
  if (!loopback.has(host.hostname)) {
    res.status(403).json({ error: "This workspace accepts local application hosts only." }); return;
  }
  const origin = req.get("origin");
  const webPort = process.env.WEB_PORT ?? "5175";
  const approved = (process.env.APP_ALLOWED_ORIGINS ?? `http://127.0.0.1:${webPort},http://localhost:${webPort}`).split(",").map((value) => value.trim());
  const originAllowed = (value: string) => {
    try {
      const parsed = new URL(value);
      return loopback.has(parsed.hostname) && ["http:", "https:"].includes(parsed.protocol) && approved.includes(parsed.origin);
    } catch { return false; }
  };
  if ((origin && !originAllowed(origin)) || req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Requests must come from this local workspace." }); return;
  }
  res.setHeader("Cache-Control", "no-store");
  next();
}
