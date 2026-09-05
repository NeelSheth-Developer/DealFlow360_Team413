-- Governance configuration and sales territories.
--
-- These rows are policy, not sample data: the risk engine reads them on every score,
-- and an empty `category_config` or `approval_rules` would make routing undefined.
-- Every statement is idempotent so a re-run against a partly-seeded database is safe.

-- ---------------------------------------------------------------------------
-- Tier ceilings — the values named in the problem statement.
-- ---------------------------------------------------------------------------
INSERT INTO "tier_config" ("tier", "max_discount_pct") VALUES
  ('bronze',  5.00),
  ('silver', 10.00),
  ('gold',   15.00)
ON CONFLICT ("tier") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Category ceilings — the other half of the binding ceiling.
-- Hardware carries healthy margin so it gets the widest discretion; service is
-- thin-margin and capped hardest. A line is measured against MIN(category, tier).
-- ---------------------------------------------------------------------------
INSERT INTO "category_config" ("category", "max_discount_pct") VALUES
  ('hardware',     15.00),
  ('service',      10.00),
  ('subscription', 12.00),
  ('accessories',  20.00)
ON CONFLICT ("category") DO NOTHING;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Approval chain.
--
-- A rule matches when score > min_score AND score <= coalesce(max_score, inf),
-- or when any single line is more than `single_line_trip` points over its own
-- ceiling. When several match, the one with MORE approvers wins — routing never
-- steps down.
--
-- min_score = -1 on the auto rule so a score of exactly 0 (every line inside its
-- ceiling) matches it: the comparison is strictly greater-than.
-- ---------------------------------------------------------------------------
INSERT INTO "approval_rules" ("min_score", "max_score", "approvers", "single_line_trip", "note", "sort_order")
SELECT * FROM (VALUES
  (-1.00,  0.00, ARRAY[]::text[],                          NULL::numeric, 'Every line inside its ceiling.', 0),
  ( 0.00,  5.00, ARRAY['sales_manager']::text[],            5.00::numeric, 'Mild blended overage.',         1),
  ( 5.00,  NULL, ARRAY['sales_manager','finance']::text[], 12.00::numeric, 'Finance must co-sign.',         2)
) AS seed(min_score, max_score, approvers, single_line_trip, note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "approval_rules");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Deal-health thresholds. Singleton row, pinned to id = 1.
-- ---------------------------------------------------------------------------
INSERT INTO "dashboard_config" ("id", "stall_threshold_days", "anomaly_sensitivity", "approval_sla_hours")
VALUES (1, 5, 1.80, 24)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

ALTER TABLE "dashboard_config" DROP CONSTRAINT IF EXISTS "dashboard_config_singleton";
--> statement-breakpoint
ALTER TABLE "dashboard_config" ADD CONSTRAINT "dashboard_config_singleton" CHECK ("id" = 1);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Sales territories. A rep never picks their own — `users.team_id` starts null
-- and an admin or manager assigns it from the staff directory.
-- ---------------------------------------------------------------------------
INSERT INTO "teams" ("name")
SELECT * FROM (VALUES ('Enterprise West'), ('Enterprise North'), ('Enterprise South'))
  AS seed(name)
WHERE NOT EXISTS (SELECT 1 FROM "teams");
