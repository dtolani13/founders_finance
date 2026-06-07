import { Router } from "express";
import { db } from "@workspace/db";
import { owner_contributions, entities, transactions } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const rows = await db.select({
      contrib: owner_contributions,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(owner_contributions)
      .leftJoin(entities, eq(owner_contributions.entity_id, entities.id))
      .orderBy(desc(owner_contributions.created_at));

    res.json(rows.map(r => ({
      ...r.contrib,
      entity_display_name: r.entity_display_name,
      entity_primary_color: r.entity_primary_color,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list owner contributions");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createSchema = z.object({
  entity_id: z.string().uuid(),
  amount: z.number().positive("Amount must be positive"),
  contribution_type: z.enum(["capital_contribution", "owner_loan"]).default("capital_contribution"),
  memo: z.string().nullable().optional(),
  contribution_date: z.string(),
});

router.post("/", async (req, res) => {
  try {
    const body = createSchema.parse(req.body);

    const entityRows = await db.select().from(entities).where(eq(entities.id, body.entity_id));
    if (!entityRows.length) return res.status(400).json({ error: "Entity not found" });

    // Create backing transaction
    const [tx] = await db.insert(transactions).values({
      transaction_date: body.contribution_date,
      transaction_type: "owner_contribution",
      description: `Owner contribution to ${entityRows[0].display_name}`,
      total_amount: String(body.amount),
      status: "posted",
      is_balanced: true,
      business_purpose: body.memo ?? null,
    }).returning();

    const [contrib] = await db.insert(owner_contributions).values({
      transaction_id: tx.id,
      entity_id: body.entity_id,
      amount: String(body.amount),
      contribution_type: body.contribution_type,
      memo: body.memo ?? null,
      contribution_date: body.contribution_date,
    }).returning();

    res.status(201).json({
      ...contrib,
      entity_display_name: entityRows[0].display_name,
      entity_primary_color: entityRows[0].primary_color,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create owner contribution");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
