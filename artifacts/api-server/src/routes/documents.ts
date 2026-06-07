import { Router } from "express";
import { db } from "@workspace/db";
import { documents, entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { entity_id, transaction_id, document_type, period_month, evidence_status } = req.query as Record<string, string | undefined>;
    const rows = await db.select({
      doc: documents,
      entity_display_name: entities.display_name,
    })
      .from(documents)
      .leftJoin(entities, eq(documents.entity_id, entities.id));

    const filtered = rows.filter(r => {
      if (entity_id && r.doc.entity_id !== entity_id) return false;
      if (transaction_id && r.doc.transaction_id !== transaction_id) return false;
      if (document_type && r.doc.document_type !== document_type) return false;
      if (period_month && r.doc.period_month?.slice(0, 7) !== period_month.slice(0, 7)) return false;
      if (evidence_status && r.doc.evidence_status !== evidence_status) return false;
      return true;
    });

    res.json(filtered.map(r => ({ ...r.doc, entity_display_name: r.entity_display_name })));
  } catch (err) {
    req.log.error({ err }, "Failed to list documents");
    res.status(500).json({ error: "Internal server error" });
  }
});

function sanitizeFilePath(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const stripped = raw
    .replace(/\.\.[/\\]/g, "")
    .replace(/^[/\\]+/, "")
    .replace(/\0/g, "");
  return stripped || null;
}

const createDocumentSchema = z.object({
  document_type: z.enum(["receipt","invoice","screenshot","contract","bank_statement","subscription_receipt","tax_document","note","other"]),
  file_name: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  transaction_id: z.string().uuid().nullable().optional(),
  statement_id: z.string().uuid().nullable().optional(),
  period_month: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  evidence_status: z.enum(["metadata_only","attached","missing","needs_review"]).default("metadata_only"),
});

router.post("/", async (req, res) => {
  try {
    const body = createDocumentSchema.parse(req.body);
    body.file_path = sanitizeFilePath(body.file_path);
    const [doc] = await db.insert(documents).values(body).returning();

    let entity_display_name: string | null = null;
    if (doc.entity_id) {
      const eRows = await db.select().from(entities).where(eq(entities.id, doc.entity_id));
      entity_display_name = eRows[0]?.display_name ?? null;
    }
    res.status(201).json({ ...doc, entity_display_name });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create document");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateDocumentSchema = z.object({
  document_type: z.string().nullable().optional(),
  file_name: z.string().nullable().optional(),
  file_path: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  evidence_status: z.string().nullable().optional(),
  transaction_id: z.string().uuid().nullable().optional(),
  period_month: z.string().nullable().optional(),
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = updateDocumentSchema.parse(req.body);
    const update: Record<string, unknown> = {};
    if (body.document_type !== undefined) update.document_type = body.document_type;
    if (body.file_name !== undefined) update.file_name = body.file_name;
    if (body.file_path !== undefined) update.file_path = sanitizeFilePath(body.file_path);
    if (body.description !== undefined) update.description = body.description;
    if (body.evidence_status !== undefined) update.evidence_status = body.evidence_status;
    if (body.transaction_id !== undefined) update.transaction_id = body.transaction_id;
    if (body.period_month !== undefined) update.period_month = body.period_month;
    const rows = await db.update(documents).set(update).where(eq(documents.id, id)).returning();
    if (!rows.length) return res.status(404).json({ error: "Document not found" });
    let entity_display_name: string | null = null;
    if (rows[0].entity_id) {
      const eRows = await db.select().from(entities).where(eq(entities.id, rows[0].entity_id));
      entity_display_name = eRows[0]?.display_name ?? null;
    }
    res.json({ ...rows[0], entity_display_name });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to update document");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.delete(documents).where(eq(documents.id, id)).returning();
    if (!rows.length) return res.status(404).json({ error: "Document not found" });
    res.json({ deleted: true, id });
  } catch (err) {
    req.log.error({ err }, "Failed to delete document");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
