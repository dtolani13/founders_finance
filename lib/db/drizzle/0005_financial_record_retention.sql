ALTER TABLE "vendors" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "statements" ADD COLUMN "archived_at" timestamp with time zone;
