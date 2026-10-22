/** Synthetic screenshot fixtures. This refuses every database except the isolated review instance. */
import { db, pool, entities, accounts, categories, statements, monthly_close_periods } from "@workspace/db";
import { createOwnerContribution } from "../services/financial-operations";
import { createManualExpense, postTransaction } from "../services/accounting";

const target = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (target.hostname !== "127.0.0.1" || target.port !== "55442" || target.pathname !== "/finance_rcl_review") throw new Error("Only the isolated finance_rcl_review database on loopback port 55442 is allowed.");
try {
  if ((await db.select().from(entities)).length) throw new Error("Review database already contains companies. Refusing to overwrite.");
  const companies = await db.insert(entities).values([
    { legal_name: "Northstar Studio LLC (Sample)", display_name: "Northstar Studio", short_code: "NORTH", entity_type: "llc", primary_color: "#CD945F", purpose: "Synthetic product design studio for website screenshots." },
    { legal_name: "Orbit Works LLC (Sample)", display_name: "Orbit Works", short_code: "ORBIT", entity_type: "llc", primary_color: "#A7AAAF", purpose: "Synthetic technology company for website screenshots." },
    { legal_name: "Atelier Ventures LLC (Sample)", display_name: "Atelier Ventures", short_code: "ATELIER", entity_type: "llc", primary_color: "#887D72", purpose: "Synthetic advisory business for website screenshots." },
  ]).returning();
  const checking: Array<{ id: string }> = [];
  for (const [index, entity] of companies.entries()) {
    const [account] = await db.insert(accounts).values({ entity_id: entity.id, name: `${entity.display_name} · Sample Checking`, account_type: "checking", institution_name: "Example Bank", last_four: `${1100 + index}`, opening_balance: "0", current_balance: "0" }).returning();
    checking.push(account);
    await db.insert(accounts).values({ entity_id: entity.id, name: `${entity.display_name} · Sample Reserve`, account_type: "savings", is_tax_reserve: true, opening_balance: `${[4800, 3250, 7200][index]}`, current_balance: `${[4800, 3250, 7200][index]}` });
    await createOwnerContribution({ entity_id: entity.id, amount: [32000, 24500, 48000][index], contribution_type: "capital_contribution", contribution_date: "2026-10-01", memo: "Synthetic opening capital — screenshot fixture" });
    await db.insert(monthly_close_periods).values({ entity_id: entity.id, period_month: "2026-10-01", status: index === 2 ? "review" : "open" });
  }
  const [category] = await db.insert(categories).values({ name: "Software & services", category_type: "expense" }).returning();
  const expenses = [
    { index: 0, amount: 2400, date: "2026-10-06", description: "Shared research workspace", vendor: "Example Workspace", share: true },
    { index: 1, amount: 480, date: "2026-10-12", description: "Cloud infrastructure", vendor: "Example Cloud", share: false },
    { index: 2, amount: 1850, date: "2026-10-15", description: "Quarterly planning workshop", vendor: "Example Consulting", share: false },
    { index: 0, amount: 129.99, date: "2026-10-18", description: "Design software subscription", vendor: "Example Design Tools", share: false },
  ];
  for (const expense of expenses) {
    const entity = companies[expense.index];
    const result = await createManualExpense({ transaction_date: expense.date, description: expense.description, business_purpose: "Synthetic demo expense", vendor_name: expense.vendor, total_amount: expense.amount, paying_entity_id: entity.id, paying_account_id: checking[expense.index].id, category_id: category.id, allocations: expense.share ? [
      { target_entity_id: companies[0].id, category_id: category.id, allocation_amount: 1440, allocation_percent: 60, creates_intercompany_balance: false },
      { target_entity_id: companies[1].id, category_id: category.id, allocation_amount: 960, allocation_percent: 40, creates_intercompany_balance: true },
    ] : [{ target_entity_id: entity.id, category_id: category.id, allocation_amount: expense.amount, allocation_percent: 100, creates_intercompany_balance: false }] });
    await postTransaction(result.transaction.id);
  }
  const [statement] = await db.insert(statements).values({ account_id: checking[0].id, statement_month: "2026-10-01", opening_balance: "32000", closing_balance: "29470.01", status: "uploaded" }).returning();
  console.log(JSON.stringify({ synthetic: true, company_count: companies.length, statement_id: statement.id }));
} finally { await pool.end(); }
