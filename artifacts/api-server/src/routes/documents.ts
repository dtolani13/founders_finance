import { createReadStream, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { db, documents, entities } from "@workspace/db";
import { desc, eq, isNull } from "drizzle-orm";
import multer from "multer";
import { z } from "zod";
import {
  archiveEvidence,
  cleanupStagedEvidence,
  createEvidenceMetadata,
  createEvidenceWithFile,
  EVIDENCE_MAX_BYTES,
  EvidenceStorageError,
  getEvidenceContent,
  getEvidenceStagingRoot,
  replaceEvidenceFile,
  toPublicDocument,
  updateEvidenceMetadata,
  type EvidenceMetadataInput,
} from "../services/evidence-storage";

const router = Router();
const stagingRoot = getEvidenceStagingRoot();
mkdirSync(stagingRoot, { recursive: true });

const uploadMimeTypes = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
  "application/octet-stream",
]);
const uploadExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".csv"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: stagingRoot,
    filename: (_req, _file, callback) => callback(null, `${Date.now()}-${randomUUID()}.upload`),
  }),
  limits: {
    fileSize: EVIDENCE_MAX_BYTES,
    files: 1,
    fields: 12,
    fieldSize: 64 * 1024,
    parts: 14,
  },
  fileFilter: (_req, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    if (!uploadExtensions.has(extension) || !uploadMimeTypes.has(file.mimetype.toLowerCase())) {
      callback(new EvidenceStorageError(
        "Unsupported file. Use PDF, PNG, JPEG, WebP, or CSV.",
        415,
        "EVIDENCE_TYPE_NOT_ALLOWED",
      ));
      return;
    }
    callback(null, true);
  },
});

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? "Evidence files cannot exceed 20 MB." : "Invalid evidence upload.",
        code: error.code,
      });
      return;
    }
    if (error instanceof EvidenceStorageError) {
      res.status(error.statusCode).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  });
}

const documentType = z.enum([
  "receipt",
  "invoice",
  "screenshot",
  "contract",
  "bank_statement",
  "subscription_receipt",
  "tax_document",
  "note",
  "other",
]);

const optionalUuid = z.preprocess(
  (value) => value === "" || value === undefined ? null : value,
  z.string().uuid().nullable(),
);

const metadataSchema = z.object({
  document_type: documentType,
  entity_id: optionalUuid.optional(),
  account_id: optionalUuid.optional(),
  transaction_id: optionalUuid.optional(),
  statement_id: optionalUuid.optional(),
  period_month: z.preprocess(
    (value) => value === "" || value === undefined ? null : value,
    z.string().regex(/^\d{4}-\d{2}-01$/).nullable(),
  ).optional(),
  description: z.preprocess(
    (value) => value === "" || value === undefined ? null : value,
    z.string().max(4000).nullable(),
  ).optional(),
});

const metadataUpdateSchema = metadataSchema.partial();

function handleRouteError(error: unknown, req: Request, res: Response, message: string) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Validation failed", issues: error.issues });
    return;
  }
  if (error instanceof EvidenceStorageError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }
  req.log.error({ err: error }, message);
  res.status(500).json({ error: "Internal server error" });
}

async function withEntityName(document: typeof documents.$inferSelect) {
  let entityDisplayName: string | null = null;
  if (document.entity_id) {
    const rows = await db.select({ display_name: entities.display_name }).from(entities)
      .where(eq(entities.id, document.entity_id));
    entityDisplayName = rows[0]?.display_name ?? null;
  }
  return { ...toPublicDocument(document), entity_display_name: entityDisplayName };
}

router.get("/", async (req, res) => {
  try {
    const { entity_id, transaction_id, document_type, period_month, evidence_status } = req.query as Record<string, string | undefined>;
    const includeArchived = req.query.include_archived === "true";
    const rows = await db.select({ doc: documents, entity_display_name: entities.display_name })
      .from(documents)
      .leftJoin(entities, eq(documents.entity_id, entities.id))
      .where(includeArchived ? undefined : isNull(documents.archived_at))
      .orderBy(desc(documents.uploaded_at));
    const filtered = rows.filter(({ doc }) => {
      if (entity_id && doc.entity_id !== entity_id) return false;
      if (transaction_id && doc.transaction_id !== transaction_id) return false;
      if (document_type && doc.document_type !== document_type) return false;
      if (period_month && doc.period_month?.slice(0, 7) !== period_month.slice(0, 7)) return false;
      if (evidence_status && doc.evidence_status !== evidence_status) return false;
      return true;
    });
    res.json(filtered.map(({ doc, entity_display_name }) => ({
      ...toPublicDocument(doc),
      entity_display_name,
    })));
  } catch (error) {
    handleRouteError(error, req, res, "Failed to list documents");
  }
});

router.post("/", async (req, res) => {
  try {
    const input = metadataSchema.parse(req.body) as EvidenceMetadataInput;
    res.status(201).json(await withEntityName(await createEvidenceMetadata(input)));
  } catch (error) {
    handleRouteError(error, req, res, "Failed to create document metadata");
  }
});

router.post("/upload", receiveFile, async (req, res) => {
  try {
    if (!req.file) throw new EvidenceStorageError("Choose a file to upload.", 400, "EVIDENCE_FILE_REQUIRED");
    const input = metadataSchema.parse(req.body) as EvidenceMetadataInput;
    const document = await createEvidenceWithFile(input, req.file);
    res.status(201).json(await withEntityName(document));
  } catch (error) {
    await cleanupStagedEvidence(req.file?.path);
    handleRouteError(error, req, res, "Failed to upload evidence");
  }
});

router.get("/:id/content", async (req, res, next) => {
  try {
    const content = await getEvidenceContent(String(req.params.id));
    const disposition = req.query.download === "true" ? "attachment" : "inline";
    const encodedName = encodeURIComponent(content.fileName).replace(/['()]/g, escape);
    res.setHeader("Content-Type", content.mimeType);
    res.setHeader("Content-Length", String(content.bytes));
    res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodedName}`);
    res.setHeader("Cache-Control", "private, no-store");
    const stream = createReadStream(content.path);
    stream.on("error", (error) => {
      req.log.error({ err: error, documentId: req.params.id }, "Failed to stream evidence content");
      if (!res.headersSent) next(error);
      else res.destroy(error);
    });
    stream.pipe(res);
  } catch (error) {
    handleRouteError(error, req, res, "Failed to retrieve evidence");
  }
});

router.post("/:id/file", receiveFile, async (req, res) => {
  try {
    if (!req.file) throw new EvidenceStorageError("Choose a replacement file.", 400, "EVIDENCE_FILE_REQUIRED");
    const document = await replaceEvidenceFile(String(req.params.id), req.file);
    res.json(await withEntityName(document));
  } catch (error) {
    await cleanupStagedEvidence(req.file?.path);
    handleRouteError(error, req, res, "Failed to replace evidence");
  }
});

router.put("/:id", async (req, res) => {
  try {
    const input = metadataUpdateSchema.parse(req.body) as Partial<EvidenceMetadataInput>;
    res.json(await withEntityName(await updateEvidenceMetadata(String(req.params.id), input)));
  } catch (error) {
    handleRouteError(error, req, res, "Failed to update document metadata");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const archived = await archiveEvidence(String(req.params.id));
    res.json({ archived: true, document: await withEntityName(archived) });
  } catch (error) {
    handleRouteError(error, req, res, "Failed to archive evidence");
  }
});

export default router;
