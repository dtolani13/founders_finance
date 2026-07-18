import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, expense_allocations, entities,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import {
  AccountingError,
  createManualExpense,
  replaceExpenseAllocations,
} from "../services/accounting";

const router = Router();

const allocationInputSchema = z.object({
  target_entity_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  allocation_percent: z.number().min(0).max(100).nullable().optional(),
  allocation_amount: z.number().positive(),
  memo: z.string().nullable().optional(),
  creates_intercompany_balance: z.boolean().default(false),
});

const createManualExpenseSchema = z.object({
  transaction_date: z.string(),
  vendor_id: z.string().uuid().nullable().optional(),
  vendor_name: z.string().nullable().optional(),
  description: z.string().min(1),
  business_purpose: z.string().nullable().optional(),
  total_amount: z.number().positive("Amount must be positive"),
  paying_entity_id: z.string().uuid(),
  paying_account_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  preset_id: z.string().uuid().nullable().optional(),
  allocations: z.array(allocationInputSchema).min(1),
});

router.post("/manual", async (req, res) => {
  try {
    const body = createManualExpenseSchema.parse(req.body);
    res.status(201).json(await createManualExpense(body));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create manual expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/unallocated", async (req, res) => {
  try {
    const allocated = await db.select({ id: expense_allocations.transaction_id }).from(expense_allocations);
    const allocatedIds = [...new Set(allocated.map(r => r.id))];
    const rows = await db.select().from(transactions)
      .where(eq(transactions.transaction_type, "business_expense"))
      .orderBy(desc(transactions.transaction_date));
    const unallocated = rows.filter(r => !allocatedIds.includes(r.id));
    res.json(unallocated.map(r => ({ ...r, vendor_name: null, line_count: 0, allocation_count: 0 })));
  } catch (err) {
    req.log.error({ err }, "Failed to list unallocated expenses");
    res.status(500).json({ error: "Internal server error" });
  }
});

const createAllocationsSchema = z.object({
  allocations: z.array(allocationInputSchema).min(1),
});

router.post("/:transactionId/allocations", async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { allocations } = createAllocationsSchema.parse(req.body);
    const rows = await replaceExpenseAllocations(transactionId, allocations);
    res.json(rows.map(row => ({
      ...row.allocation,
      entity_short_code: row.entity_short_code,
      entity_display_name: row.entity_display_name,
      entity_primary_color: row.entity_primary_color,
    })));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    if (err instanceof AccountingError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
    req.log.error({ err }, "Failed to create allocations");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
