import { Router } from "express";
import { db } from "@workspace/db";
import { accounts, entities } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { entity_id } = req.query;
    const conditions = entity_id
      ? and(eq(accounts.is_active, true), eq(accounts.entity_id, entity_id as string))
      : eq(accounts.is_active, true);
    const rows = await db.select().from(accounts).where(conditions);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!rows.length) return res.status(404).json({ error: "Account not found" });
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
