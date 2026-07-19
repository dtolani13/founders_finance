ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "file_sha256" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_file_path_unique" ON "documents" USING btree ("file_path");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_type_check" CHECK ("documents"."document_type" in ('receipt', 'invoice', 'screenshot', 'contract', 'bank_statement', 'subscription_receipt', 'tax_document', 'note', 'other'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_evidence_status_check" CHECK ("documents"."evidence_status" in ('metadata_only', 'attached', 'missing', 'needs_review', 'archived'));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_size_nonnegative" CHECK ("documents"."file_size_bytes" is null or "documents"."file_size_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_file_metadata_consistent" CHECK (("documents"."file_path" is null and "documents"."mime_type" is null and "documents"."file_size_bytes" is null and "documents"."file_sha256" is null) or ("documents"."file_path" is not null and "documents"."mime_type" is not null and "documents"."file_size_bytes" is not null and "documents"."file_sha256" is not null));
