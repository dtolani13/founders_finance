import { accounts, db, entities } from "@workspace/db";
import { eq } from "drizzle-orm";
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
    await tx.update(accounts).set({ is_active: active, updated_at: now }).where(eq(accounts.entity_id, companyId));
    await writeAuditLog({
      tableName: "entities",
      recordId: companyId,
      action: targetStatus === "active" ? "reopen" : targetStatus === "closed" ? "close" : "archive",
      previousValue: existing,
      newValue: updated,
      memo: active
        ? "Company reopened and company accounts reactivated."
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
