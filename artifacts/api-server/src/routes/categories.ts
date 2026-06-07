import { Router } from "express";
import { db } from "@workspace/db";
import { categories } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select().from(categories).where(eq(categories.is_active, true));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
