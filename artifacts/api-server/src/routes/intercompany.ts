import { Router } from "express";
import { db } from "@workspace/db";
import { intercompany_links, entities } from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/balances", async (req, res) => {
  try {
    const rows = await db.select({
      link: intercompany_links,
      owing_entity_name: entities.display_name,
      owing_entity_color: entities.primary_color,
    })
      .from(intercompany_links)
      .leftJoin(entities, eq(intercompany_links.owing_entity_id, entities.id));

    const owedEntities = await db.select({ id: entities.id, display_name: entities.display_name, primary_color: entities.primary_color }).from(entities);
    const owedMap: Record<string, { display_name: string; primary_color: string | null }> = {};
    owedEntities.forEach(e => { owedMap[e.id] = e; });

    res.json(rows.map(r => ({
      ...r.link,
      owing_entity_name: r.owing_entity_name,
      owing_entity_color: r.owing_entity_color,
      owed_entity_name: owedMap[r.link.owed_entity_id]?.display_name ?? null,
      owed_entity_color: owedMap[r.link.owed_entity_id]?.primary_color ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list intercompany balances");
    res.status(500).json({ error: "Internal server error" });
  }
});

const markPaidSchema = z.object({
  payment_transaction_id: z.string().uuid().nullable().optional(),
  memo: z.string().nullable().optional(),
});

router.post("/:id/mark-paid", async (req, res) => {
  try {
    const { id } = req.params;
    const body = markPaidSchema.parse(req.body);
    const rows = await db.update(intercompany_links)
      .set({
        status: "paid",
        reimbursement_transaction_id: body.payment_transaction_id ?? null,
        memo: body.memo ?? null,
        updated_at: new Date(),
      })
      .where(eq(intercompany_links.id, id))
      .returning();
    if (!rows.length) return res.status(404).json({ error: "Intercompany link not found" });

    const owedEntities = await db.select({ id: entities.id, display_name: entities.display_name, primary_color: entities.primary_color }).from(entities);
    const owedMap: Record<string, { display_name: string; primary_color: string | null }> = {};
    owedEntities.forEach(e => { owedMap[e.id] = e; });

    const link = rows[0];
    const owingEntity = owedMap[link.owing_entity_id];
    const owedEntity = owedMap[link.owed_entity_id];

    res.json({
      ...link,
      owing_entity_name: owingEntity?.display_name ?? null,
      owing_entity_color: owingEntity?.primary_color ?? null,
      owed_entity_name: owedEntity?.display_name ?? null,
      owed_entity_color: owedEntity?.primary_color ?? null,
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to mark intercompany paid");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
