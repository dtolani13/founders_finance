import { accounts, db, documents, entities, intercompany_links, reimbursement_requests, statement_lines, statements } from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import { writeAuditLog } from "../lib/audit";

export class CompanyLifecycleError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 409,
    public readonly code = "COMPANY_LIFECYCLE_CONFLICT",
  ) {
    super(message);
    this.name = "CompanyLifecycleError";
  }
}

async function getCompanyOrThrow(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: string,
) {
  const rows = await tx.select().from(entities).where(eq(entities.id, companyId));
  if (!rows.length) throw new CompanyLifecycleError("Company not found.", 404, "COMPANY_NOT_FOUND");
  return rows[0];
}

export async function createCompany(input: {
  legal_name: string;
  display_name: string;
  short_code: string;
  entity_type: string;
  purpose?: string | null;
  tax_classification_note?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
}, hooks: { afterCompanyCreated?: () => void | Promise<void> } = {}) {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: entities.id }).from(entities).where(eq(entities.short_code, input.short_code));
    if (existing.length) {
      throw new CompanyLifecycleError("A company already uses that short code.", 409, "SHORT_CODE_EXISTS");
    }
    const [company] = await tx.insert(entities).values({
      legal_name: input.legal_name,
      display_name: input.display_name,
      short_code: input.short_code,
      entity_type: input.entity_type,
      purpose: input.purpose ?? null,
      tax_classification_note: input.tax_classification_note ?? null,
      primary_color: input.primary_color ?? "#00AEEF",
      secondary_color: input.secondary_color ?? "#0B1726",
      accent_color: input.accent_color ?? "#7DD3FC",
      lifecycle_status: "active",
      is_active: true,
    }).returning();
    await hooks.afterCompanyCreated?.();
    await tx.insert(accounts).values([
      {
        entity_id: company.id,
        name: `${company.short_code} Checking`,
        account_type: "checking",
        opening_balance: "0",
        current_balance: "0",
        is_tax_reserve: false,
        is_active: true,
      },
      {
        entity_id: company.id,
        name: `${company.short_code} Tax Reserve`,
        account_type: "savings",
        opening_balance: "0",
        current_balance: "0",
        is_tax_reserve: true,
        is_active: true,
      },
    ]);
    await writeAuditLog({
      tableName: "entities",
      recordId: company.id,
      action: "create",
      newValue: company,
      memo: "Company created with default checking and tax reserve accounts.",
    }, tx);
    return company;
  });
}

export async function assessCompanyClosure(companyId: string) {
  const companyRows = await db.select().from(entities).where(eq(entities.id, companyId));
  const company = companyRows[0];
  if (!company) throw new CompanyLifecycleError("Company not found.", 404, "COMPANY_NOT_FOUND");
  const companyAccounts = await db.select().from(accounts).where(eq(accounts.entity_id, companyId));
  const nonzeroAccounts = companyAccounts.filter((account) => Math.abs(Number(account.current_balance)) >= 0.01);
  const openIntercompany = await db.select().from(intercompany_links).where(and(
    or(eq(intercompany_links.owing_entity_id, companyId), eq(intercompany_links.owed_entity_id, companyId)),
    inArray(intercompany_links.status, ["open", "partially_paid"]),
  ));
  const openReimbursements = await db.select().from(reimbursement_requests).where(and(
    or(eq(reimbursement_requests.owed_by_entity_id, companyId), eq(reimbursement_requests.owed_to_entity_id, companyId)),
    inArray(reimbursement_requests.status, ["pending", "partially_paid"]),
  ));
  const accountIds = companyAccounts.map((account) => account.id);
  const companyStatements = accountIds.length
    ? await db.select().from(statements).where(inArray(statements.account_id, accountIds))
    : [];
  const statementIds = companyStatements.filter((statement) => !statement.archived_at).map((statement) => statement.id);
  const unreconciledLines = statementIds.length
    ? await db.select().from(statement_lines).where(and(
      inArray(statement_lines.statement_id, statementIds),
      inArray(statement_lines.status, ["unmatched", "needs_review"]),
    ))
    : [];
  const evidenceIssues = await db.select().from(documents).where(and(
    eq(documents.entity_id, companyId),
    inArray(documents.evidence_status, ["missing", "needs_review", "metadata_only"]),
  ));
  const warnings = [
    nonzeroAccounts.length ? `${nonzeroAccounts.length} account${nonzeroAccounts.length === 1 ? " has" : "s have"} a non-zero balance.` : null,
    openIntercompany.length ? `${openIntercompany.length} intercompany balance${openIntercompany.length === 1 ? " is" : "s are"} still open.` : null,
    openReimbursements.length ? `${openReimbursements.length} reimbursement${openReimbursements.length === 1 ? " is" : "s are"} still pending.` : null,
    unreconciledLines.length ? `${unreconciledLines.length} statement line${unreconciledLines.length === 1 ? " needs" : "s need"} reconciliation.` : null,
    evidenceIssues.length ? `${evidenceIssues.length} evidence record${evidenceIssues.length === 1 ? " needs" : "s need"} attention.` : null,
  ].filter((warning): warning is string => Boolean(warning));
  return {
    company_id: companyId,
    can_close: true,
    warnings,
    nonzero_accounts: nonzeroAccounts.map((account) => ({ id: account.id, name: account.name, balance: Number(account.current_balance) })),
    open_intercompany_count: openIntercompany.length,
    open_reimbursement_count: openReimbursements.length,
    unreconciled_line_count: unreconciledLines.length,
    evidence_issue_count: evidenceIssues.length,
  };
}

async function transitionCompany(
  companyId: string,
  targetStatus: "closed" | "archived" | "active",
  input: { archive_until?: Date | null; archive_reason?: string | null } = {},
) {
  return db.transaction(async (tx) => {
    const existing = await getCompanyOrThrow(tx, companyId);
    if (existing.short_code === "PERSONAL" && targetStatus !== "active") {
      throw new CompanyLifecycleError(
        "The Personal / Founder record cannot be closed or archived.",
        400,
        "PERSONAL_LIFECYCLE_PROTECTED",
      );
    }
    const now = new Date();
    const active = targetStatus === "active";
    const [updated] = await tx.update(entities).set({
      lifecycle_status: targetStatus,
      is_active: active,
      closed_at: active ? null : (existing.closed_at ?? now),
      archive_until: input.archive_until === undefined ? existing.archive_until : input.archive_until,
      archive_reason: targetStatus === "archived"
        ? (input.archive_reason ?? existing.archive_reason ?? "Archived for recordkeeping.")
        : (input.archive_reason === undefined ? existing.archive_reason : input.archive_reason),
      updated_at: now,
    }).where(eq(entities.id, companyId)).returning();
    if (active && existing.closed_at) {
      await tx.update(accounts)
        .set({ is_active: true, updated_at: now })
        .where(and(
          eq(accounts.entity_id, companyId),
          eq(accounts.is_active, false),
          eq(accounts.updated_at, existing.closed_at),
        ));
    } else if (!active) {
      await tx.update(accounts)
        .set({ is_active: false, updated_at: now })
        .where(and(eq(accounts.entity_id, companyId), eq(accounts.is_active, true)));
    }
    await writeAuditLog({
      tableName: "entities",
      recordId: companyId,
      action: targetStatus === "active" ? "reopen" : targetStatus === "closed" ? "close" : "archive",
      previousValue: existing,
      newValue: updated,
      memo: active
        ? "Company reopened and accounts active at closure reactivated."
        : `Company ${targetStatus}; records preserved and company accounts deactivated.`,
    }, tx);
    return updated;
  });
}

export function closeCompany(
  companyId: string,
  input: { archive_until?: Date | null; archive_reason?: string | null },
) {
  return transitionCompany(companyId, "closed", input);
}

export function archiveCompany(
  companyId: string,
  input: { archive_until?: Date | null; archive_reason?: string | null },
) {
  return transitionCompany(companyId, "archived", input);
}

export function reopenCompany(companyId: string) {
  return transitionCompany(companyId, "active");
}

export async function updateCompany(
  companyId: string,
  input: {
    display_name?: string;
    purpose?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
    logo_path?: string | null;
    tax_classification_note?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const existing = await getCompanyOrThrow(tx, companyId);
    const [updated] = await tx.update(entities)
      .set({ ...input, updated_at: new Date() })
      .where(eq(entities.id, companyId))
      .returning();
    await writeAuditLog({
      tableName: "entities",
      recordId: companyId,
      action: "update",
      previousValue: existing,
      newValue: updated,
      memo: "Company settings updated.",
    }, tx);
    return updated;
  });
}
