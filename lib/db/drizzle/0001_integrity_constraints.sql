ALTER TABLE "accounts" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_close_entity_period_unique" ON "monthly_close_periods" USING btree ("entity_id","period_month");--> statement-breakpoint
ALTER TABLE "allocation_preset_lines" ADD CONSTRAINT "allocation_preset_lines_percent_range" CHECK ("allocation_preset_lines"."percent" >= 0 and "allocation_preset_lines"."percent" <= 100);--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_lifecycle_status_check" CHECK ("entities"."lifecycle_status" in ('active', 'closed', 'archived'));--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_lifecycle_active_check" CHECK (("entities"."lifecycle_status" = 'active') = "entities"."is_active");--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_amount_positive" CHECK ("expense_allocations"."allocation_amount" > 0);--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_percent_range" CHECK ("expense_allocations"."allocation_percent" is null or ("expense_allocations"."allocation_percent" >= 0 and "expense_allocations"."allocation_percent" <= 100));--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_total_amount_positive" CHECK ("transactions"."total_amount" > 0);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_status_check" CHECK ("transactions"."status" in ('draft', 'needs_review', 'posted', 'voided'));--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_nonnegative" CHECK ("transaction_lines"."debit" >= 0 and "transaction_lines"."credit" >= 0);--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_one_sided" CHECK (("transaction_lines"."debit" > 0 and "transaction_lines"."credit" = 0) or ("transaction_lines"."credit" > 0 and "transaction_lines"."debit" = 0));--> statement-breakpoint
ALTER TABLE "intercompany_links" ADD CONSTRAINT "intercompany_links_amount_positive" CHECK ("intercompany_links"."amount" > 0);--> statement-breakpoint
ALTER TABLE "intercompany_links" ADD CONSTRAINT "intercompany_links_distinct_entities" CHECK ("intercompany_links"."owing_entity_id" <> "intercompany_links"."owed_entity_id");--> statement-breakpoint
ALTER TABLE "intercompany_links" ADD CONSTRAINT "intercompany_links_status_check" CHECK ("intercompany_links"."status" in ('open', 'partially_paid', 'paid', 'waived'));--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_amount_positive" CHECK ("reimbursement_requests"."amount" > 0);--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_distinct_entities" CHECK ("reimbursement_requests"."owed_to_entity_id" <> "reimbursement_requests"."owed_by_entity_id");--> statement-breakpoint
ALTER TABLE "reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_status_check" CHECK ("reimbursement_requests"."status" in ('pending', 'partially_paid', 'paid', 'waived', 'converted'));--> statement-breakpoint
ALTER TABLE "owner_contributions" ADD CONSTRAINT "owner_contributions_amount_positive" CHECK ("owner_contributions"."amount" > 0);--> statement-breakpoint
ALTER TABLE "owner_draws" ADD CONSTRAINT "owner_draws_amount_positive" CHECK ("owner_draws"."amount" > 0);--> statement-breakpoint
ALTER TABLE "tax_reserve_rules" ADD CONSTRAINT "tax_reserve_rules_percent_range" CHECK ("tax_reserve_rules"."reserve_percent" >= 0 and "tax_reserve_rules"."reserve_percent" <= 100);--> statement-breakpoint
ALTER TABLE "monthly_close_periods" ADD CONSTRAINT "monthly_close_status_check" CHECK ("monthly_close_periods"."status" in ('open', 'review', 'closed', 'reopened'));