import { accounts } from "@workspace/db";
import { getTableColumns, sql } from "drizzle-orm";

// Read the ledger at query time. The legacy current_balance column is not
// maintained by posting, contribution, settlement, or reversal workflows.
// Numeric arithmetic stays in PostgreSQL; drafts and voids have no effect.
export const accountFieldsWithBalance = {
  ...getTableColumns(accounts),
  current_balance: sql<string>`(
    accounts.opening_balance + coalesce((
      select sum(case when accounts.account_type in ('credit_card', 'loan')
        then line.credit - line.debit else line.debit - line.credit end)
      from transaction_lines line
      inner join transactions entry on entry.id = line.transaction_id
      where line.account_id = accounts.id and entry.status = 'posted'
    ), 0)
  )::text`,
};
