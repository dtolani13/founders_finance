import { Router } from "express";
import { db } from "@workspace/db";
import { entities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  archiveCompany,
  closeCompany,
  CompanyLifecycleError,
  createCompany,
  reopenCompany,
  updateCompany,
} from "../services/company-lifecycle";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query["include_inactive"] === "true";
    const rows = includeInactive
      ? await db.select().from(entities)
      : await db.select().from(entities).where(eq(entities.is_active, true));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to list entities");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await db.select().from(entities).where(eq(entities.id, id));
    if (!rows.length) return res.status(404).json({ error: "Entity not found" });
    res.json(rows[0]);
  } catch (err) {
    req.log.error({ err }, "Failed to get entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateEntitySchema = z.object({
  display_name: z.string().optional(),
  purpose: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
  logo_path: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
});

const lifecycleSchema = z.object({
  archive_until: z.coerce.date().nullable().optional(),
  archive_reason: z.string().nullable().optional(),
});

const createEntitySchema = z.object({
  legal_name: z.string().min(1),
  display_name: z.string().min(1),
  short_code: z.string().min(2).max(12).transform((value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "")),
  entity_type: z.string().min(1).default("LLC"),
  purpose: z.string().nullable().optional(),
  tax_classification_note: z.string().nullable().optional(),
  primary_color: z.string().nullable().optional(),
  secondary_color: z.string().nullable().optional(),
  accent_color: z.string().nullable().optional(),
});

router.post("/", async (req, res) => {
  try {
    const body = createEntitySchema.parse(req.body);
    res.status(201).json(await createCompany(body));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof CompanyLifecycleError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const body = lifecycleSchema.parse(req.body ?? {});
    res.json(await closeCompany(id, body));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof CompanyLifecycleError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to close entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/archive", async (req, res) => {
  try {
    const { id } = req.params;
    const body = lifecycleSchema.parse(req.body ?? {});
    res.json(await archiveCompany(id, body));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof CompanyLifecycleError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to archive entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/reopen", async (req, res) => {
  try {
    const { id } = req.params;
    res.json(await reopenCompany(id));
  } catch (err) {
    if (err instanceof CompanyLifecycleError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to reopen entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const body = updateEntitySchema.parse(req.body);
    res.json(await updateCompany(id, body));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof CompanyLifecycleError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to update entity");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
