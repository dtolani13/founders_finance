import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactions, transaction_lines, expense_allocations, owner_contributions, owner_draws, reimbursement_requests,
  intercompany_links, tax_reserve_rules, documents, entities, categories,
  monthly_close_periods, statements, statement_lines, accounts, vendors
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

const router = Router();

router.get("/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const { entity_id, period_month } = req.query as Record<string, string | undefined>;
    const now = new Date().toISOString();

    let records: Record<string, unknown>[] = [];

    switch (type) {
      case "all_transactions": {
        const rows = await db.select().from(transactions).orderBy(desc(transactions.transaction_date));
        const transactionIds = rows.map((row) => row.id);
        const vendorIds = [...new Set(rows.map(r => r.vendor_id).filter(Boolean))] as string[];
        const vendorMap: Record<string, string> = {};
        if (vendorIds.length) {
          const vs = await db.select().from(vendors).where(inArray(vendors.id, vendorIds));
          vs.forEach(v => { vendorMap[v.id] = v.name; });
        }
        const transactionEntityMap: Record<string, Map<string, string | null>> = {};
        if (transactionIds.length) {
          const entityRows = await db.select({
            transaction_id: transaction_lines.transaction_id,
            entity_id: transaction_lines.entity_id,
            entity_short_code: entities.short_code,
          }).from(transaction_lines)
            .leftJoin(entities, eq(transaction_lines.entity_id, entities.id))
            .where(inArray(transaction_lines.transaction_id, transactionIds));
          for (const row of entityRows) {
            if (!row.entity_id) continue;
            transactionEntityMap[row.transaction_id] ??= new Map();
            transactionEntityMap[row.transaction_id].set(row.entity_id, row.entity_short_code);
          }
        }
        records = rows
          .filter(r => !period_month || r.transaction_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            id: r.id,
            entity_ids: [...(transactionEntityMap[r.id]?.keys() ?? [])].join("|"),
            entity_short_codes: [...(transactionEntityMap[r.id]?.values() ?? [])].filter(Boolean).join("|"),
            date: r.transaction_date,
            type: r.transaction_type,
            description: r.description,
            vendor: r.vendor_id ? (vendorMap[r.vendor_id] ?? null) : null,
            amount: r.total_amount,
            status: r.status,
            business_purpose: r.business_purpose,
          }));
        break;
      }
      case "expenses_by_entity": {
        const rowsWithTransactions = await db.select({
          alloc: expense_allocations,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
          transaction_date: transactions.transaction_date,
          transaction_status: transactions.status,
        }).from(expense_allocations)
          .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
          .leftJoin(transactions, eq(expense_allocations.transaction_id, transactions.id));
        records = rowsWithTransactions
          .filter(r => !entity_id || r.alloc.target_entity_id === entity_id)
          .filter(r => !period_month || r.transaction_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            transaction_id: r.alloc.transaction_id,
            transaction_date: r.transaction_date,
            transaction_status: r.transaction_status,
            entity_id: r.alloc.target_entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            amount: r.alloc.allocation_amount,
            percent: r.alloc.allocation_percent,
            memo: r.alloc.memo,
          }));
        break;
      }
      case "expenses_by_category": {
        const rows = await db.select({
          alloc: expense_allocations,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
          category_name: categories.name,
          transaction_date: transactions.transaction_date,
          transaction_status: transactions.status,
        })
          .from(expense_allocations)
          .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
          .leftJoin(categories, eq(expense_allocations.category_id, categories.id))
          .leftJoin(transactions, eq(expense_allocations.transaction_id, transactions.id));
        records = rows
          .filter(r => !entity_id || r.alloc.target_entity_id === entity_id)
          .filter(r => !period_month || r.transaction_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            transaction_id: r.alloc.transaction_id,
            transaction_date: r.transaction_date,
            transaction_status: r.transaction_status,
            entity_id: r.alloc.target_entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            category_id: r.alloc.category_id,
            category: r.category_name ?? "Uncategorized",
            amount: r.alloc.allocation_amount,
            memo: r.alloc.memo,
          }));
        break;
      }
      case "owner_contributions": {
        const rows = await db.select({
          contrib: owner_contributions,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
          transaction_status: transactions.status,
        }).from(owner_contributions)
          .leftJoin(entities, eq(owner_contributions.entity_id, entities.id))
          .leftJoin(transactions, eq(owner_contributions.transaction_id, transactions.id));
        records = rows
          .filter(r => !entity_id || r.contrib.entity_id === entity_id)
          .filter(r => !period_month || r.contrib.contribution_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            id: r.contrib.id,
            transaction_id: r.contrib.transaction_id,
            transaction_status: r.transaction_status,
            entity_id: r.contrib.entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            amount: r.contrib.amount,
            type: r.contrib.contribution_type,
            date: r.contrib.contribution_date,
            memo: r.contrib.memo,
          }));
        break;
      }
      case "owner_draws": {
        const rows = await db.select({
          draw: owner_draws,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
          transaction_status: transactions.status,
        })
          .from(owner_draws)
          .leftJoin(entities, eq(owner_draws.entity_id, entities.id))
          .leftJoin(transactions, eq(owner_draws.transaction_id, transactions.id))
          .orderBy(desc(owner_draws.draw_date));
        records = rows
          .filter(r => !entity_id || r.draw.entity_id === entity_id)
          .filter(r => !period_month || r.draw.draw_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({ id: r.draw.id, transaction_id: r.draw.transaction_id, transaction_status: r.transaction_status, entity_id: r.draw.entity_id, entity: r.entity_display_name, entity_short_code: r.entity_short_code, amount: r.draw.amount, date: r.draw.draw_date, memo: r.draw.memo }));
        break;
      }
      case "company_retention": {
        const rows = await db.select().from(entities).orderBy(entities.display_name);
        records = rows.filter((entity) => entity.lifecycle_status !== "active").map((entity) => ({
          id: entity.id,
          legal_name: entity.legal_name,
          display_name: entity.display_name,
          short_code: entity.short_code,
          lifecycle_status: entity.lifecycle_status,
          closed_at: entity.closed_at,
          archive_until: entity.archive_until,
          archive_reason: entity.archive_reason,
        }));
        break;
      }
      case "reimbursements": {
        const reimbRows = await db.select({
          reimb: reimbursement_requests,
          owed_to_name: entities.display_name,
          owed_to_short_code: entities.short_code,
        })
          .from(reimbursement_requests)
          .leftJoin(entities, eq(reimbursement_requests.owed_to_entity_id, entities.id))
          .orderBy(desc(reimbursement_requests.created_at));
        const owedByIds = [...new Set(reimbRows.map(r => r.reimb.owed_by_entity_id).filter(Boolean))] as string[];
        const owedByMap: Record<string, { name: string; short_code: string | null }> = {};
        if (owedByIds.length) {
          const owedByEnts = await db.select().from(entities).where(inArray(entities.id, owedByIds));
          owedByEnts.forEach(e => { owedByMap[e.id] = { name: e.display_name, short_code: e.short_code }; });
        }
        records = reimbRows
          .filter(r => !entity_id || r.reimb.owed_to_entity_id === entity_id || r.reimb.owed_by_entity_id === entity_id)
          .map(r => ({
            id: r.reimb.id,
            original_transaction_id: r.reimb.original_transaction_id,
            paid_transaction_id: r.reimb.paid_transaction_id,
            amount: r.reimb.amount,
            status: r.reimb.status,
            memo: r.reimb.memo,
            owed_to_entity_id: r.reimb.owed_to_entity_id,
            owed_to: r.owed_to_name,
            owed_to_short_code: r.owed_to_short_code,
            owed_by_entity_id: r.reimb.owed_by_entity_id,
            owed_by: r.reimb.owed_by_entity_id ? (owedByMap[r.reimb.owed_by_entity_id]?.name ?? r.reimb.owed_by_entity_id) : null,
            owed_by_short_code: r.reimb.owed_by_entity_id ? (owedByMap[r.reimb.owed_by_entity_id]?.short_code ?? null) : null,
          }));
        break;
      }
      case "intercompany_balances": {
        const icRows = await db.select({
          link: intercompany_links,
          owing_name: entities.display_name,
          owing_short_code: entities.short_code,
        })
          .from(intercompany_links)
          .leftJoin(entities, eq(intercompany_links.owing_entity_id, entities.id));
        const owedEntityIds = [...new Set(icRows.map(r => r.link.owed_entity_id).filter(Boolean))] as string[];
        const owedEntityMap: Record<string, { name: string; short_code: string | null }> = {};
        if (owedEntityIds.length) {
          const owedEnts = await db.select().from(entities).where(inArray(entities.id, owedEntityIds));
          owedEnts.forEach(e => { owedEntityMap[e.id] = { name: e.display_name, short_code: e.short_code }; });
        }
        records = icRows
          .filter(r => !entity_id || r.link.owing_entity_id === entity_id || r.link.owed_entity_id === entity_id)
          .map(r => ({
            id: r.link.id,
            source_transaction_id: r.link.source_transaction_id,
            settlement_transaction_id: r.link.reimbursement_transaction_id,
            amount: r.link.amount,
            status: r.link.status,
            owing_entity_id: r.link.owing_entity_id,
            owing_entity: r.owing_name,
            owing_short_code: r.owing_short_code,
            owed_entity_id: r.link.owed_entity_id,
            owed_entity: r.link.owed_entity_id ? (owedEntityMap[r.link.owed_entity_id]?.name ?? r.link.owed_entity_id) : null,
            owed_short_code: r.link.owed_entity_id ? (owedEntityMap[r.link.owed_entity_id]?.short_code ?? null) : null,
            memo: r.link.memo,
          }));
        break;
      }
      case "tax_reserve_activity": {
        const rows = await db.select({
          rule: tax_reserve_rules,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
        }).from(tax_reserve_rules).leftJoin(entities, eq(tax_reserve_rules.entity_id, entities.id));
        records = rows
          .filter(r => !entity_id || r.rule.entity_id === entity_id)
          .map(r => ({
            id: r.rule.id,
            entity_id: r.rule.entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            percent: r.rule.reserve_percent,
            basis: r.rule.rule_basis,
            is_active: r.rule.is_active,
            notes: r.rule.notes,
          }));
        break;
      }
      case "document_index": {
        const rows = await db.select({
          doc: documents,
          entity_display_name: entities.display_name,
        }).from(documents).leftJoin(entities, eq(documents.entity_id, entities.id));
        records = rows
          .filter(r => !entity_id || r.doc.entity_id === entity_id)
          .filter(r => !period_month || r.doc.period_month?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            id: r.doc.id,
            entity_id: r.doc.entity_id,
            account_id: r.doc.account_id,
            type: r.doc.document_type,
            file_name: r.doc.file_name,
            entity: r.entity_display_name,
            status: r.doc.evidence_status,
            transaction_id: r.doc.transaction_id,
            statement_id: r.doc.statement_id,
            period_month: r.doc.period_month,
            description: r.doc.description,
            file_sha256: r.doc.file_sha256,
            archived_at: r.doc.archived_at,
          }));
        break;
      }
      case "personal_non_deductible": {
        const personalEntities = await db.select().from(entities).where(eq(entities.short_code, "PERSONAL"));
        const personalIds = personalEntities.map(e => e.id);
        const rows = await db.select({
          alloc: expense_allocations,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
          transaction_date: transactions.transaction_date,
          transaction_status: transactions.status,
        }).from(expense_allocations)
          .leftJoin(entities, eq(expense_allocations.target_entity_id, entities.id))
          .leftJoin(transactions, eq(expense_allocations.transaction_id, transactions.id));
        records = rows
          .filter(r => personalIds.includes(r.alloc.target_entity_id))
          .filter(r => !period_month || r.transaction_date?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            transaction_id: r.alloc.transaction_id,
            transaction_date: r.transaction_date,
            transaction_status: r.transaction_status,
            entity_id: r.alloc.target_entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            amount: r.alloc.allocation_amount,
            memo: r.alloc.memo,
          }));
        break;
      }
      case "monthly_close_summary": {
        const rows = await db.select({
          period: monthly_close_periods,
          entity_display_name: entities.display_name,
          entity_short_code: entities.short_code,
        })
          .from(monthly_close_periods)
          .leftJoin(entities, eq(monthly_close_periods.entity_id, entities.id))
          .orderBy(desc(monthly_close_periods.period_month));
        records = rows
          .filter(r => !entity_id || r.period.entity_id === entity_id)
          .filter(r => !period_month || r.period.period_month?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            id: r.period.id,
            entity_id: r.period.entity_id,
            entity: r.entity_display_name,
            entity_short_code: r.entity_short_code,
            period_month: r.period.period_month,
            status: r.period.status,
            statements_uploaded: r.period.all_statements_uploaded,
            transactions_reconciled: r.period.all_transactions_reconciled,
            receipts_attached: r.period.all_receipts_attached,
            allocations_complete: r.period.all_allocations_complete,
            intercompany_reviewed: r.period.intercompany_reviewed,
            tax_reserve_reviewed: r.period.tax_reserve_reviewed,
            export_generated: r.period.export_generated,
            closed_at: r.period.closed_at,
          }));
        break;
      }
      case "statement_reconciliation_summary": {
        const stmtRows = await db.select({
          stmt: statements,
          account_name: accounts.name,
          entity_id: accounts.entity_id,
        })
          .from(statements)
          .leftJoin(accounts, eq(statements.account_id, accounts.id))
          .orderBy(desc(statements.statement_month));

        const stmtIds = stmtRows.map(r => r.stmt.id);
        const lineMap: Record<string, { total: number; matched: number; unmatched: number; ignored: number }> = {};
        if (stmtIds.length) {
          const allLines = await db.select().from(statement_lines).where(inArray(statement_lines.statement_id, stmtIds));
          for (const l of allLines) {
            if (!lineMap[l.statement_id]) lineMap[l.statement_id] = { total: 0, matched: 0, unmatched: 0, ignored: 0 };
            lineMap[l.statement_id].total++;
            if (l.status === "matched") lineMap[l.statement_id].matched++;
            else if (l.status === "unmatched") lineMap[l.statement_id].unmatched++;
            else if (l.status === "ignored") lineMap[l.statement_id].ignored++;
          }
        }

        records = stmtRows
          .filter(r => !entity_id || r.entity_id === entity_id)
          .filter(r => !period_month || r.stmt.statement_month?.startsWith(period_month.slice(0, 7)))
          .map(r => ({
            id: r.stmt.id,
            account_id: r.stmt.account_id,
            entity_id: r.entity_id,
            account: r.account_name,
            month: r.stmt.statement_month,
            status: r.stmt.status,
            opening_balance: r.stmt.opening_balance,
            closing_balance: r.stmt.closing_balance,
            total_lines: lineMap[r.stmt.id]?.total ?? 0,
            matched_lines: lineMap[r.stmt.id]?.matched ?? 0,
            unmatched_lines: lineMap[r.stmt.id]?.unmatched ?? 0,
            ignored_lines: lineMap[r.stmt.id]?.ignored ?? 0,
          }));
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown export type: ${type}` });
    }

    res.json({
      export_type: type,
      period_month: period_month ?? null,
      entity_id: entity_id ?? null,
      record_count: records.length,
      records,
      generated_at: now,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to generate export");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
