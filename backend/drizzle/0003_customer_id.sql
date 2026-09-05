ALTER TABLE "customers" ADD COLUMN "customer_id" varchar(12);
--> statement-breakpoint
-- Back-fill existing rows with a placeholder derived from their seq so NOT NULL can be enforced.
UPDATE "customers" SET "customer_id" = 'DF-XXX' || LPAD(seq::text, 3, '0') WHERE "customer_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "customer_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "customers_customer_id_key" ON "customers" ("customer_id");
