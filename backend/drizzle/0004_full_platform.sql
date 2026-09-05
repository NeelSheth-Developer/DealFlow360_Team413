CREATE TYPE "public"."actor_role" AS ENUM('sales_rep', 'sales_manager', 'finance', 'admin', 'customer', 'system');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('stalled', 'discount_anomaly', 'delivery_slippage', 'approval_bottleneck');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'returned', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."backorder_policy" AS ENUM('ship_available', 'hold_until_complete');--> statement-breakpoint
CREATE TYPE "public"."cadence" AS ENUM('monthly', 'quarterly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."cancellation_rule" AS ENUM('refund_unused', 'no_refund', 'credit_note_only');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('hardware', 'service', 'subscription', 'accessories');--> statement-breakpoint
CREATE TYPE "public"."credit_note_type" AS ENUM('refund', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partially_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."negotiation_status" AS ENUM('none', 'sent', 'under_negotiation', 'pending_reapproval', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('approval_request', 'approval_result', 'negotiation', 'nudge', 'escalation', 'system');--> statement-breakpoint
CREATE TYPE "public"."occurrence_status" AS ENUM('scheduled', 'invoiced', 'paid', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'bank_transfer', 'cheque', 'upi', 'other');--> statement-breakpoint
CREATE TYPE "public"."proration_rule" AS ENUM('daily_prorate', 'full_period', 'next_cycle_adjust');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('draft', 'sent', 'under_negotiation', 'pending_approval', 'approved', 'fulfillment', 'billed', 'confirmed', 'lost');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "alert_states" (
	"alert_key" varchar(80) PRIMARY KEY NOT NULL,
	"quotation_id" uuid NOT NULL,
	"type" "alert_type" NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"escalated_at" timestamp with time zone,
	"nudged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"min_score" numeric(6, 2) NOT NULL,
	"max_score" numeric(6, 2),
	"approvers" text[] NOT NULL,
	"single_line_trip" numeric(6, 2),
	"note" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"step_order" integer NOT NULL,
	"reviewer_id" uuid,
	"reviewer_name" varchar(120),
	"reason" text,
	"acted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid,
	"entity_ref" varchar(16),
	"action" varchar(160) NOT NULL,
	"actor_id" uuid,
	"actor_name" varchar(120) NOT NULL,
	"actor_role" "actor_role" NOT NULL,
	"reason" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backorders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"eta_date" date,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"occurs_on" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"status" "occurrence_status" DEFAULT 'scheduled' NOT NULL,
	"cycle_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_config" (
	"category" "category" PRIMARY KEY NOT NULL,
	"max_discount_pct" numeric(5, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(16) NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"type" "credit_note_type" NOT NULL,
	"reason" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_config" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"stall_threshold_days" integer DEFAULT 5 NOT NULL,
	"anomaly_sensitivity" numeric(4, 2) DEFAULT '1.80' NOT NULL,
	"approval_sla_hours" integer DEFAULT 24 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fulfillment_plans" (
	"quotation_id" uuid PRIMARY KEY NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"accepted_at" timestamp with time zone,
	"estimated_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"shipment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"product_name" varchar(200) NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_pct" numeric(5, 2) NOT NULL,
	"tax_pct" numeric(5, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(16) NOT NULL,
	"quotation_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"issue_date" date,
	"due_date" date,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "line_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"line_id" uuid NOT NULL,
	"author_name" varchar(120) NOT NULL,
	"author_id" uuid,
	"side" "subject_kind" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"entity_ref" varchar(16),
	"view" varchar(40),
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" varchar(120),
	"paid_on" date NOT NULL,
	"notes" text,
	"recorded_by_id" uuid NOT NULL,
	"recorded_by_name" varchar(120) NOT NULL,
	"idempotency_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"tier" "tier" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"attribute" varchar(60) NOT NULL,
	"value" varchar(60) NOT NULL,
	"extra_price" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"sku" varchar(40) NOT NULL,
	"category" "category" NOT NULL,
	"base_price" numeric(14, 2) NOT NULL,
	"cost_price" numeric(14, 2) NOT NULL,
	"unit" varchar(24) DEFAULT 'unit' NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" varchar(200) NOT NULL,
	"category" "category" NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"cost_price" numeric(14, 2) NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"plan_id" uuid,
	"subscription_start_date" date,
	"subscription_status" "subscription_status" DEFAULT 'active' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(16) NOT NULL,
	"customer_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"tier" "tier" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"stage" "stage" DEFAULT 'draft' NOT NULL,
	"order_discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"negotiation_status" "negotiation_status" DEFAULT 'none' NOT NULL,
	"awaiting_seller" boolean DEFAULT false NOT NULL,
	"shared_at" timestamp with time zone,
	"counter_discount_pct" numeric(5, 2),
	"counter_justification" text,
	"dismissed_suggestions" text[] DEFAULT '{}'::text[] NOT NULL,
	"promised_delivery_date" date,
	"valid_until" date,
	"internal_notes" text,
	"customer_terms" text,
	"lost_reason" text,
	"backorder_policy" "backorder_policy" DEFAULT 'ship_available' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plan_products" (
	"plan_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "subscription_plan_products_plan_id_product_id_pk" PRIMARY KEY("plan_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"cadence" "cadence" NOT NULL,
	"proration_rule" "proration_rule" DEFAULT 'daily_prorate' NOT NULL,
	"cancellation_rule" "cancellation_rule" DEFAULT 'refund_unused' NOT NULL,
	"min_commitment_months" integer DEFAULT 0 NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"billing_day_of_cycle" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upsell_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trigger_product_id" uuid NOT NULL,
	"suggested_product_id" uuid NOT NULL,
	"co_purchase_score" numeric(6, 2) DEFAULT '0' NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"min_margin_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"warehouse_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_stock_warehouse_id_product_id_pk" PRIMARY KEY("warehouse_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"location" varchar(200),
	"shipping_cost_weight" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"base_ship_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"replenish_threshold" integer DEFAULT 0 NOT NULL,
	"replenish_qty" integer DEFAULT 0 NOT NULL,
	"replenish_lead_days" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "industry" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "alert_states" ADD CONSTRAINT "alert_states_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backorders" ADD CONSTRAINT "backorders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backorders" ADD CONSTRAINT "backorders_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backorders" ADD CONSTRAINT "backorders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_occurrences" ADD CONSTRAINT "billing_occurrences_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_occurrences" ADD CONSTRAINT "billing_occurrences_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_allocations" ADD CONSTRAINT "fulfillment_allocations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_plans" ADD CONSTRAINT "fulfillment_plans_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "line_comments" ADD CONSTRAINT "line_comments_line_id_quotation_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."quotation_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_lines" ADD CONSTRAINT "quotation_lines_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_products" ADD CONSTRAINT "subscription_plan_products_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_products" ADD CONSTRAINT "subscription_plan_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upsell_rules" ADD CONSTRAINT "upsell_rules_trigger_product_id_products_id_fk" FOREIGN KEY ("trigger_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upsell_rules" ADD CONSTRAINT "upsell_rules_suggested_product_id_products_id_fk" FOREIGN KEY ("suggested_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_rules_order_idx" ON "approval_rules" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_steps_order_key" ON "approval_steps" USING btree ("quotation_id","step_order");--> statement-breakpoint
CREATE INDEX "approval_steps_status_idx" ON "approval_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "backorders_quotation_idx" ON "backorders" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_occurrences_cycle_key" ON "billing_occurrences" USING btree ("line_id","cycle_index");--> statement-breakpoint
CREATE INDEX "billing_occurrences_quotation_idx" ON "billing_occurrences" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_notes_reference_key" ON "credit_notes" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "credit_notes_quotation_idx" ON "credit_notes" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "fulfillment_allocations_quotation_idx" ON "fulfillment_allocations" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_reference_key" ON "invoices" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "invoices_quotation_idx" ON "invoices" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "line_comments_line_idx" ON "line_comments" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_created_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_key" ON "price_lists" USING btree ("product_id","tier","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_key" ON "product_variants" USING btree ("product_id","attribute","value");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_key" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "quotation_lines_quotation_idx" ON "quotation_lines" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_reference_key" ON "quotations" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "quotations_customer_idx" ON "quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotations_owner_idx" ON "quotations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "quotations_stage_idx" ON "quotations" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "quotations_activity_idx" ON "quotations" USING btree ("last_activity_at");--> statement-breakpoint
CREATE UNIQUE INDEX "upsell_rules_pair_key" ON "upsell_rules" USING btree ("trigger_product_id","suggested_product_id");--> statement-breakpoint
CREATE INDEX "warehouse_stock_product_idx" ON "warehouse_stock" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_name_key" ON "warehouses" USING btree ("name");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_team_idx" ON "users" USING btree ("team_id");