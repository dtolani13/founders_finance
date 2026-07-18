import { db } from "@workspace/db";
import { audit_log } from "@workspace/db";

type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "void"
  | "export"
  | "security";

export async function writeAuditLog(input: {
  tableName: string;
  recordId?: string | null;
  action: AuditAction | string;
  previousValue?: unknown;
  newValue?: unknown;
  memo?: string;
}, executor: Pick<typeof db, "insert"> = db) {
  await executor.insert(audit_log).values({
    table_name: input.tableName,
    record_id: input.recordId ?? null,
    action: input.action,
    previous_value:
      input.previousValue === undefined ? null : JSON.stringify(input.previousValue),
    new_value: input.newValue === undefined ? null : JSON.stringify(input.newValue),
    memo: input.memo ?? null,
  });
}
