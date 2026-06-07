import { Router } from "express";
import { db } from "@workspace/db";
import { audit_log } from "@workspace/db";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(audit_log).orderBy(desc(audit_log.created_at)).limit(200);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list audit records");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
