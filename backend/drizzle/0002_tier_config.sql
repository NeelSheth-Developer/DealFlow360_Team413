CREATE TABLE "tier_config" (
	"tier" "tier" PRIMARY KEY NOT NULL,
	"max_discount_pct" numeric(5, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ceilings from the problem statement. ON CONFLICT so re-running is harmless.
INSERT INTO "tier_config" ("tier", "max_discount_pct") VALUES
  ('bronze', 5.00),
  ('silver', 10.00),
  ('gold',   15.00)
ON CONFLICT ("tier") DO NOTHING;
