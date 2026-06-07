import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, transaction_lines, expense_allocations,
  intercompany_links, reimbursement_requests,
  entities, vendors
} from "@workspace/db";
import { eq, sql, desc, notInArray } from "drizzle-orm";
import { z } from "zod";

const router = Router();

const allocationInputSchema = z.object({
  target_entity_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  allocation_percent: z.number().nullable().optional(),
  allocation_amount: z.number(),
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

    // Validate allocation total
    const allocTotal = body.allocations.reduce((s, a) => s + a.allocation_amount, 0);
    if (Math.abs(allocTotal - body.total_amount) >= 0.01) {
      return res.status(400).json({ error: `Allocation total (${allocTotal.toFixed(2)}) must equal transaction total (${body.total_amount.toFixed(2)})` });
    }

    let vendorId = body.vendor_id ?? null;
    if (!vendorId && body.vendor_name) {
      const existing = await db.select().from(vendors).where(eq(vendors.name, body.vendor_name));
      if (existing.length) {
        vendorId = existing[0].id;
      } else {
        const created = await db.insert(vendors).values({ name: body.vendor_name }).returning();
        vendorId = created[0].id;
      }
    }

    // Create transaction
    const [tx] = await db.insert(transactions).values({
      transaction_date: body.transaction_date,
      transaction_type: "business_expense",
      description: body.description,
      vendor_id: vendorId,
      total_amount: String(body.total_amount),
      business_purpose: body.business_purpose ?? null,
      status: "draft",
      is_balanced: false,
    }).returning();

    // Create transaction lines
    const payingEntityRows = await db.select().from(entities).where(eq(entities.id, body.paying_entity_id));
    if (!payingEntityRows.length) return res.status(400).json({ error: "Paying entity not found" });

    const lines = [
      // Debit: expense account
      { transaction_id: tx.id, entity_id: body.paying_entity_id, account_id: body.paying_account_id, category_id: body.category_id ?? null, debit: String(body.total_amount), credit: "0", memo: body.description },
      // Credit: payment (cash out)
      { transaction_id: tx.id, entity_id: body.paying_entity_id, account_id: body.paying_account_id, category_id: null, debit: "0", credit: String(body.total_amount), memo: "Payment" },
    ];
    await db.insert(transaction_lines).values(lines);
    await db.update(transactions).set({ is_balanced: true }).where(eq(transactions.id, tx.id));

    // Create expense allocations
    const allocRows = await db.insert(expense_allocations).values(
      body.allocations.map(a => ({
        transaction_id: tx.id,
        target_entity_id: a.target_entity_id,
        category_id: a.category_id ?? null,
        allocation_percent: a.allocation_percent != null ? String(a.allocation_percent) : null,
        allocation_amount: String(a.allocation_amount),
        memo: a.memo ?? null,
        creates_intercompany_balance: a.creates_intercompany_balance,
      }))
    ).returning();

    // Create intercompany links where paying entity != beneficiary entity and amount > 0
    for (const alloc of body.allocations) {
      if (alloc.creates_intercompany_balance && alloc.target_entity_id !== body.paying_entity_id && alloc.allocation_amount > 0) {
        await db.insert(intercompany_links).values({
          source_transaction_id: tx.id,
          owing_entity_id: alloc.target_entity_id,
          owed_entity_id: body.paying_entity_id,
          amount: String(alloc.allocation_amount),
          status: "open",
          memo: `From expense: ${body.description}`,
        });
      }
    }

    // Fetch enriched result
    const linesResult = await db.select().from(transaction_lines).where(eq(transaction_lines.transaction_id, tx.id));
    const allocsResult = await db.select({
      alloc: expense_allocations,
      entity_short_code: entities.short_code,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(expense_allocations)
      .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
      .where(eq(expense_allocations.transaction_id, tx.id));

    res.status(201).json({
      transaction: { ...tx, vendor_name: vendorId ? (await db.select().from(vendors).where(eq(vendors.id, vendorId)))[0]?.name : null, line_count: linesResult.length, allocation_count: allocsResult.length },
      lines: linesResult,
      allocations: allocsResult.map(a => ({ ...a.alloc, entity_short_code: a.entity_short_code, entity_display_name: a.entity_display_name, entity_primary_color: a.entity_primary_color })),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
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

    const txRows = await db.select().from(transactions).where(eq(transactions.id, transactionId));
    if (!txRows.length) return res.status(404).json({ error: "Transaction not found" });

    const allocTotal = allocations.reduce((s, a) => s + a.allocation_amount, 0);
    const txTotal = parseFloat(String(txRows[0].total_amount));
    if (Math.abs(allocTotal - txTotal) >= 0.01) {
      return res.status(400).json({ error: `Allocation total (${allocTotal.toFixed(2)}) must equal transaction total (${txTotal.toFixed(2)})` });
    }

    await db.delete(expense_allocations).where(eq(expense_allocations.transaction_id, transactionId));
    const rows = await db.insert(expense_allocations).values(
      allocations.map(a => ({
        transaction_id: transactionId,
        target_entity_id: a.target_entity_id,
        category_id: a.category_id ?? null,
        allocation_percent: a.allocation_percent != null ? String(a.allocation_percent) : null,
        allocation_amount: String(a.allocation_amount),
        memo: a.memo ?? null,
        creates_intercompany_balance: a.creates_intercompany_balance,
      }))
    ).returning();

    const result = await db.select({
      alloc: expense_allocations,
      entity_short_code: entities.short_code,
      entity_display_name: entities.display_name,
      entity_primary_color: entities.primary_color,
    })
      .from(expense_allocations)
      .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
      .where(eq(expense_allocations.transaction_id, transactionId));

    res.json(result.map(a => ({ ...a.alloc, entity_short_code: a.entity_short_code, entity_display_name: a.entity_display_name, entity_primary_color: a.entity_primary_color })));
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
    req.log.error({ err }, "Failed to create allocations");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
