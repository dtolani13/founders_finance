import { db } from "@workspace/db";
import {
  entities, accounts, categories, vendors,
  allocation_presets, allocation_preset_lines,
  transactions, expense_allocations,
  intercompany_links, reimbursement_requests,
  owner_contributions, tax_reserve_rules,
  reconciliation_matches,
} from "@workspace/db/schema";

async function seed() {
  console.log("Seeding database...");

  // Clear existing data in dependency order
  await db.delete(reconciliation_matches);
  await db.delete(expense_allocations);
  await db.delete(intercompany_links);
  await db.delete(reimbursement_requests);
  await db.delete(owner_contributions);
  await db.delete(transactions);
  await db.delete(allocation_preset_lines);
  await db.delete(allocation_presets);
  await db.delete(tax_reserve_rules);
  await db.delete(accounts);
  await db.delete(vendors);
  await db.delete(categories);
  await db.delete(entities);

  // Entities
  const [sm, rcl, personal] = await db.insert(entities).values([
    {
      legal_name: "Studio Maestro LLC",
      display_name: "Studio Maestro",
      short_code: "SM",
      entity_type: "LLC",
      purpose: "Creative production and client services",
      tax_classification_note: "Single-member LLC disregarded for federal tax",
      primary_color: "#7C3AED",
      secondary_color: "#EDE9FE",
      accent_color: "#A78BFA",
      is_active: true,
    },
    {
      legal_name: "Recursive Chaos Labs LLC",
      display_name: "Recursive Chaos Labs",
      short_code: "RCL",
      entity_type: "LLC",
      purpose: "Software and AI product development",
      tax_classification_note: "Single-member LLC disregarded for federal tax",
      primary_color: "#111827",
      secondary_color: "#F3F4F6",
      accent_color: "#8B5CF6",
      is_active: true,
    },
    {
      legal_name: "Personal / Founder",
      display_name: "Personal",
      short_code: "PERSONAL",
      entity_type: "individual",
      purpose: "Personal finances and owner account",
      primary_color: "#6B7280",
      secondary_color: "#F9FAFB",
      accent_color: "#9CA3AF",
      is_active: true,
    },
  ]).returning();

  console.log("✓ Entities seeded:", sm.short_code, rcl.short_code, personal.short_code);

  // Accounts
  await db.insert(accounts).values([
    { entity_id: sm.id, name: "SM Checking", account_type: "checking", institution_name: "Mercury", last_four: "4821", opening_balance: "0", current_balance: "28450.00", is_tax_reserve: false, is_active: true },
    { entity_id: sm.id, name: "SM Tax Reserve", account_type: "savings", institution_name: "Mercury", last_four: "9203", opening_balance: "0", current_balance: "12000.00", is_tax_reserve: true, is_active: true },
    { entity_id: rcl.id, name: "RCL Checking", account_type: "checking", institution_name: "Mercury", last_four: "7744", opening_balance: "0", current_balance: "15820.00", is_tax_reserve: false, is_active: true },
    { entity_id: rcl.id, name: "RCL Tax Reserve", account_type: "savings", institution_name: "Mercury", last_four: "5519", opening_balance: "0", current_balance: "7500.00", is_tax_reserve: true, is_active: true },
    { entity_id: personal.id, name: "Personal Checking", account_type: "checking", institution_name: "Chase", last_four: "1138", opening_balance: "0", current_balance: "9200.00", is_tax_reserve: false, is_active: true },
    { entity_id: sm.id, name: "SM Business Card", account_type: "credit_card", institution_name: "Chase Ink", last_four: "6677", opening_balance: "0", current_balance: "-2340.00", is_tax_reserve: false, is_active: true },
  ]);

  console.log("✓ Accounts seeded");

  // Categories
  const catRows = await db.insert(categories).values([
    { name: "Software & Subscriptions", category_type: "expense", description: "SaaS tools, cloud services", is_active: true },
    { name: "Meals & Entertainment", category_type: "expense", description: "Client meals, team lunches", is_active: true },
    { name: "Travel", category_type: "expense", description: "Flights, hotels, ground transport", is_active: true },
    { name: "Home Office", category_type: "expense", description: "Desk, chair, equipment, utilities", is_active: true },
    { name: "Professional Services", category_type: "expense", description: "Legal, accounting, consulting", is_active: true },
    { name: "Marketing & Advertising", category_type: "expense", description: "Ads, design, content", is_active: true },
    { name: "Equipment & Hardware", category_type: "expense", description: "Computers, peripherals, electronics", is_active: true },
    { name: "Owner Draw", category_type: "equity", description: "Owner distributions", is_active: true },
    { name: "Revenue", category_type: "revenue", description: "Client revenue, project income", is_active: true },
    { name: "Personal (Non-Deductible)", category_type: "personal", description: "Personal expenses paid through business", is_active: true },
  ]).returning();

  const catMap: Record<string, string> = {};
  catRows.forEach(c => { catMap[c.name] = c.id; });

  console.log("✓ Categories seeded");

  // Vendors
  const vendorRows = await db.insert(vendors).values([
    { name: "GitHub", default_category_id: catMap["Software & Subscriptions"] },
    { name: "Linear", default_category_id: catMap["Software & Subscriptions"] },
    { name: "Figma", default_category_id: catMap["Software & Subscriptions"] },
    { name: "AWS", default_category_id: catMap["Software & Subscriptions"] },
    { name: "OpenAI", default_category_id: catMap["Software & Subscriptions"] },
    { name: "Notion", default_category_id: catMap["Software & Subscriptions"] },
    { name: "Adobe Creative Cloud", default_category_id: catMap["Software & Subscriptions"] },
    { name: "developer tools", default_category_id: catMap["Software & Subscriptions"] },
    { name: "1Password", default_category_id: catMap["Software & Subscriptions"] },
    { name: "Anthropic", default_category_id: catMap["Software & Subscriptions"] },
  ]).returning();

  const vendorMap: Record<string, string> = {};
  vendorRows.forEach(v => { vendorMap[v.name] = v.id; });

  console.log("✓ Vendors seeded");

  // Allocation presets
  const [preset50_50, preset_smRcl, preset_all_sm] = await db.insert(allocation_presets).values([
    { name: "50/50 SM & RCL", description: "Equal split between Studio Maestro and Recursive Chaos Labs", is_active: true },
    { name: "70/30 SM/RCL", description: "70% Studio Maestro, 30% Recursive Chaos Labs", is_active: true },
    { name: "100% Studio Maestro", description: "Fully allocated to Studio Maestro", is_active: true },
  ]).returning();

  await db.insert(allocation_preset_lines).values([
    { preset_id: preset50_50.id, entity_id: sm.id, percent: "50" },
    { preset_id: preset50_50.id, entity_id: rcl.id, percent: "50" },
    { preset_id: preset_smRcl.id, entity_id: sm.id, percent: "70" },
    { preset_id: preset_smRcl.id, entity_id: rcl.id, percent: "30" },
    { preset_id: preset_all_sm.id, entity_id: sm.id, percent: "100" },
  ]);

  console.log("✓ Allocation presets seeded");

  // Tax reserve rules
  await db.insert(tax_reserve_rules).values([
    { entity_id: sm.id, reserve_percent: "30", rule_basis: "revenue", is_active: true, notes: "Federal + state estimated taxes" },
    { entity_id: rcl.id, reserve_percent: "30", rule_basis: "revenue", is_active: true, notes: "Federal + state estimated taxes" },
  ]);

  console.log("✓ Tax reserve rules seeded");

  // Sample transactions
  const today = new Date();
  const fmtDate = (d: Date) => d.toISOString().split("T")[0];
  const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmtDate(d); };

  const txs = await db.insert(transactions).values([
    { transaction_date: daysAgo(2), transaction_type: "business_expense", description: "GitHub Teams subscription", vendor_id: vendorMap["GitHub"], total_amount: "16.00", status: "posted", is_balanced: true, business_purpose: "Version control for SM + RCL repos" },
    { transaction_date: daysAgo(5), transaction_type: "business_expense", description: "OpenAI API usage - April", vendor_id: vendorMap["OpenAI"], total_amount: "142.50", status: "posted", is_balanced: true, business_purpose: "AI features in RCL product" },
    { transaction_date: daysAgo(7), transaction_type: "business_expense", description: "AWS - compute + storage", vendor_id: vendorMap["AWS"], total_amount: "89.20", status: "posted", is_balanced: true, business_purpose: "Production infrastructure - split" },
    { transaction_date: daysAgo(10), transaction_type: "business_expense", description: "Adobe Creative Cloud - annual", vendor_id: vendorMap["Adobe Creative Cloud"], total_amount: "599.88", status: "posted", is_balanced: true, business_purpose: "Design tools for SM client work" },
    { transaction_date: daysAgo(12), transaction_type: "business_expense", description: "Figma Professional", vendor_id: vendorMap["Figma"], total_amount: "45.00", status: "posted", is_balanced: true, business_purpose: "UI design - both entities" },
    { transaction_date: daysAgo(15), transaction_type: "owner_contribution", description: "Initial capital contribution to SM", total_amount: "10000.00", status: "posted", is_balanced: true },
    { transaction_date: daysAgo(15), transaction_type: "owner_contribution", description: "Initial capital contribution to RCL", total_amount: "5000.00", status: "posted", is_balanced: true },
    { transaction_date: daysAgo(3), transaction_type: "business_expense", description: "Developer tools subscription", vendor_id: vendorMap["developer tools"], total_amount: "20.00", status: "draft", is_balanced: false, business_purpose: "Development environment" },
    { transaction_date: daysAgo(1), transaction_type: "business_expense", description: "1Password Teams", vendor_id: vendorMap["1Password"], total_amount: "19.95", status: "needs_review", is_balanced: false, business_purpose: "Password manager - all entities" },
    { transaction_date: daysAgo(20), transaction_type: "business_expense", description: "Anthropic Claude API", vendor_id: vendorMap["Anthropic"], total_amount: "78.30", status: "posted", is_balanced: true, business_purpose: "RCL AI product features" },
  ]).returning();

  // Allocations
  await db.insert(expense_allocations).values([
    // GitHub 50/50
    { transaction_id: txs[0].id, target_entity_id: sm.id, allocation_amount: "8.00", allocation_percent: "50", creates_intercompany_balance: false },
    { transaction_id: txs[0].id, target_entity_id: rcl.id, allocation_amount: "8.00", allocation_percent: "50", creates_intercompany_balance: false },
    // OpenAI 100% RCL
    { transaction_id: txs[1].id, target_entity_id: rcl.id, allocation_amount: "142.50", allocation_percent: "100", creates_intercompany_balance: false },
    // AWS 60/40
    { transaction_id: txs[2].id, target_entity_id: sm.id, allocation_amount: "53.52", allocation_percent: "60", creates_intercompany_balance: false },
    { transaction_id: txs[2].id, target_entity_id: rcl.id, allocation_amount: "35.68", allocation_percent: "40", creates_intercompany_balance: false },
    // Adobe 100% SM
    { transaction_id: txs[3].id, target_entity_id: sm.id, allocation_amount: "599.88", allocation_percent: "100", creates_intercompany_balance: false },
    // Figma 50/50 — SM paid, RCL owes SM
    { transaction_id: txs[4].id, target_entity_id: sm.id, allocation_amount: "22.50", allocation_percent: "50", creates_intercompany_balance: false },
    { transaction_id: txs[4].id, target_entity_id: rcl.id, allocation_amount: "22.50", allocation_percent: "50", creates_intercompany_balance: true },
    // Anthropic 100% RCL
    { transaction_id: txs[9].id, target_entity_id: rcl.id, allocation_amount: "78.30", allocation_percent: "100", creates_intercompany_balance: false },
  ]);

  // Owner contributions
  await db.insert(owner_contributions).values([
    { transaction_id: txs[5].id, entity_id: sm.id, amount: "10000.00", contribution_type: "capital_contribution", memo: "Initial capital for SM ops", contribution_date: daysAgo(15) },
    { transaction_id: txs[6].id, entity_id: rcl.id, amount: "5000.00", contribution_type: "capital_contribution", memo: "Initial capital for RCL ops", contribution_date: daysAgo(15) },
  ]);

  // Intercompany balance: SM paid Figma on behalf of RCL
  await db.insert(intercompany_links).values([
    {
      source_transaction_id: txs[4].id,
      owing_entity_id: rcl.id,
      owed_entity_id: sm.id,
      amount: "22.50",
      status: "open",
      memo: "Figma Professional - RCL portion paid by SM",
    },
  ]);

  // Pending reimbursement
  await db.insert(reimbursement_requests).values([
    {
      original_transaction_id: txs[4].id,
      owed_to_entity_id: sm.id,
      owed_by_entity_id: rcl.id,
      amount: "22.50",
      status: "pending",
      memo: "Figma - RCL owes SM for their half",
    },
  ]);

  console.log("✓ Transactions, allocations, intercompany, reimbursements seeded");
  console.log("✓ Seed complete!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
