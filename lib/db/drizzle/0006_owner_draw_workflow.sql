ALTER TABLE "owner_draws" ADD COLUMN "draw_date" date;--> statement-breakpoint
UPDATE "owner_draws" AS draw
SET "draw_date" = COALESCE(tx."transaction_date", draw."created_at"::date)
FROM "transactions" AS tx
WHERE tx."id" = draw."transaction_id";--> statement-breakpoint
UPDATE "owner_draws"
SET "draw_date" = "created_at"::date
WHERE "draw_date" IS NULL;--> statement-breakpoint
ALTER TABLE "owner_draws" ALTER COLUMN "draw_date" SET NOT NULL;
