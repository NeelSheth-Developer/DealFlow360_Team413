-- Replaces the sequential `seq` identity (and the CUST-0001 code derived from it)
-- with a single public identifier: customer_id, e.g. DF-CMC827.
--
-- Written to be re-runnable: parts of this were applied by hand before the migration
-- existed, so every statement guards against already being done.

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_id" varchar(12);
--> statement-breakpoint
-- Back-fill any row that predates the column so NOT NULL can be enforced.
-- A window function cannot live in SET, so number the rows in a subquery and join.
UPDATE "customers" AS c
   SET "customer_id" = 'DF-LEG' || LPAD(t.rn::text, 3, '0')
  FROM (
    SELECT "id", row_number() OVER (ORDER BY "created_at") AS rn
      FROM "customers" WHERE "customer_id" IS NULL
  ) AS t
 WHERE c."id" = t."id";
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "customer_id" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "customers_customer_id_key" ON "customers" ("customer_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "customers_seq_key";
--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "seq";
