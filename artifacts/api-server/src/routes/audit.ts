import { Router } from "express";
import { db } from "@workspace/db";
import { audit_log } from "@workspace/db";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const query = z.object({
      table_name: z.string().trim().min(1).optional(),
      action: z.string().trim().min(1).optional(),
      record_id: z.string().uuid().optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      limit: z.coerce.number().int().min(1).max(500).default(200),
    }).parse(req.query);
    const conditions = [
      query.table_name ? eq(audit_log.table_name, query.table_name) : undefined,
      query.action ? eq(audit_log.action, query.action) : undefined,
      query.record_id ? eq(audit_log.record_id, query.record_id) : undefined,
      query.from ? gte(audit_log.created_at, query.from) : undefined,
      query.to ? lte(audit_log.created_at, query.to) : undefined,
    ].filter((condition) => condition !== undefined);
    const rows = await db.select().from(audit_log)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(audit_log.created_at))
      .limit(query.limit);
    res.json(rows);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to list audit records");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
