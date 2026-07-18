CREATE UNIQUE INDEX "reconciliation_statement_line_unique" ON "reconciliation_matches" USING btree ("statement_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statements_account_month_unique" ON "statements" USING btree ("account_id","statement_month");
