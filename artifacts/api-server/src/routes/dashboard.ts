import { Router } from "express";
import { db } from "@workspace/db";
import {
  entities, accounts, transactions, vendors,
  intercompany_links, reimbursement_requests, documents,
  statement_lines, statements, monthly_close_periods
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res) => {
  try {
    const allEntities = await db.select().from(entities).where(eq(entities.is_active, true));
    const allAccounts = await db.select().from(accounts).where(eq(accounts.is_active, true));
    const allIntercompany = await db.select().from(intercompany_links);
    const allReimbursements = await db.select().from(reimbursement_requests);
    const allDocuments = await db.select({
      entity_id: documents.entity_id,
      evidence_status: documents.evidence_status,
    }).from(documents);

    // Compute unreconciled counts per account → per entity
    const allStatements = await db.select().from(statements);
    const stmtIds = allStatements.map(s => s.id);
    const unmatchedByStmt: Record<string, number> = {};
    if (stmtIds.length) {
      const unmatchedLines = await db.select().from(statement_lines).where(
        inArray(statement_lines.statement_id, stmtIds)
      );
      for (const l of unmatchedLines) {
        if (l.status === "unmatched") {
          unmatchedByStmt[l.statement_id] = (unmatchedByStmt[l.statement_id] ?? 0) + 1;
        }
      }
    }
    // account_id → entity_id map
    const accountEntityMap: Record<string, string> = {};
    for (const a of allAccounts) {
      if (a.entity_id) accountEntityMap[a.id] = a.entity_id;
    }
    // statement_id → entity_id via account
    const stmtEntityMap: Record<string, string> = {};
    for (const s of allStatements) {
      const entityId = accountEntityMap[s.account_id];
      if (entityId) stmtEntityMap[s.id] = entityId;
    }
    // sum unmatched per entity
    const unreconciledByEntity: Record<string, number> = {};
    for (const [stmtId, count] of Object.entries(unmatchedByStmt)) {
      const entityId = stmtEntityMap[stmtId];
      if (entityId) unreconciledByEntity[entityId] = (unreconciledByEntity[entityId] ?? 0) + count;
    }

    // Monthly close status for current month per entity
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const closePeriods = await db.select().from(monthly_close_periods);
    const closeStatusByEntity: Record<string, string> = {};
    for (const p of closePeriods) {
      if (p.period_month === currentMonth || p.period_month?.slice(0, 7) === currentMonth.slice(0, 7)) {
        closeStatusByEntity[p.entity_id] = p.status;
      }
    }
    // fallback: pick most recent period per entity
    const sortedPeriods = [...closePeriods].sort((a, b) =>
      (b.period_month ?? "").localeCompare(a.period_month ?? "")
    );
    for (const p of sortedPeriods) {
      if (!closeStatusByEntity[p.entity_id]) {
        closeStatusByEntity[p.entity_id] = p.status;
      }
    }

    const entityCards = allEntities.map(entity => {
      const entityAccounts = allAccounts.filter(a => a.entity_id === entity.id);
      const taxReserveAccounts = entityAccounts.filter(a => a.is_tax_reserve);
      const operatingAccounts = entityAccounts.filter(a => !a.is_tax_reserve);

      const operating_cash = operatingAccounts.reduce((s, a) => s + parseFloat(String(a.current_balance || 0)), 0);
      const tax_reserve_balance = taxReserveAccounts.reduce((s, a) => s + parseFloat(String(a.current_balance || 0)), 0);

      const pending_reimbursements = allReimbursements
        .filter(r => r.owed_by_entity_id === entity.id && r.status === "pending")
        .reduce((s, r) => s + parseFloat(String(r.amount)), 0);

      const intercompany_receivables = allIntercompany
        .filter(l => l.owed_entity_id === entity.id && l.status === "open")
        .reduce((s, l) => s + parseFloat(String(l.amount)), 0);

      const intercompany_payables = allIntercompany
        .filter(l => l.owing_entity_id === entity.id && l.status === "open")
        .reduce((s, l) => s + parseFloat(String(l.amount)), 0);

      const true_available_cash = operating_cash - intercompany_payables - pending_reimbursements;

      const missing_evidence_count = allDocuments
        .filter(d => d.entity_id === entity.id && d.evidence_status === "missing")
        .length;

      return {
        entity,
        operating_cash,
        tax_reserve_balance,
        pending_reimbursements,
        intercompany_receivables,
        intercompany_payables,
        true_available_cash,
        missing_evidence_count,
        unreconciled_count: unreconciledByEntity[entity.id] ?? 0,
        monthly_close_status: closeStatusByEntity[entity.id] ?? null,
      };
    });

    // Recent transactions — enriched with vendor names
    const recentTx = await db.select().from(transactions).orderBy(desc(transactions.created_at)).limit(10);
    const vendorIds = [...new Set(recentTx.map(t => t.vendor_id).filter(Boolean))] as string[];
    const vendorMap: Record<string, string> = {};
    if (vendorIds.length) {
      const vs = await db.select().from(vendors).where(inArray(vendors.id, vendorIds));
      vs.forEach(v => { vendorMap[v.id] = v.name; });
    }
    const recentEnriched = recentTx.map(t => ({
      ...t,
      vendor_name: t.vendor_id ? (vendorMap[t.vendor_id] ?? null) : null,
      line_count: 0,
      allocation_count: 0,
    }));

    // Totals
    const monthStart = currentMonth;
    const allTx = await db.select({ transaction_date: transactions.transaction_date }).from(transactions);
    const thisMonthCount = allTx.filter(t => t.transaction_date >= monthStart).length;

    const total_pending_reimbursements = allReimbursements
      .filter(r => r.status === "pending")
      .reduce((s, r) => s + parseFloat(String(r.amount)), 0);

    const total_open_intercompany = allIntercompany
      .filter(l => l.status === "open")
      .reduce((s, l) => s + parseFloat(String(l.amount)), 0);

    res.json({
      entities: entityCards,
      total_transactions_this_month: thisMonthCount,
      total_pending_reimbursements,
      total_open_intercompany,
      recent_transactions: recentEnriched,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
