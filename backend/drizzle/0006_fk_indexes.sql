CREATE INDEX "alert_states_quotation_idx" ON "alert_states" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "approval_steps_reviewer_idx" ON "approval_steps" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "backorders_line_idx" ON "backorders" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "backorders_product_idx" ON "backorders" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "credit_notes_line_idx" ON "credit_notes" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "credit_notes_created_by_idx" ON "credit_notes" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "fulfillment_allocations_line_idx" ON "fulfillment_allocations" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "fulfillment_allocations_warehouse_idx" ON "fulfillment_allocations" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_line_idx" ON "invoice_lines" USING btree ("line_id");--> statement-breakpoint
CREATE INDEX "payments_recorded_by_idx" ON "payments" USING btree ("recorded_by_id");--> statement-breakpoint
CREATE INDEX "quotation_lines_product_idx" ON "quotation_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "quotation_lines_plan_idx" ON "quotation_lines" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "quotations_created_by_idx" ON "quotations" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_products_product_idx" ON "subscription_plan_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "upsell_rules_suggested_idx" ON "upsell_rules" USING btree ("suggested_product_id");