import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// =============================================================================
// Enums
// =============================================================================

export const roleEnum = pgEnum('role', ['sales_rep', 'sales_manager', 'finance', 'admin']);
export const tierEnum = pgEnum('tier', ['bronze', 'silver', 'gold']);
export const subjectKindEnum = pgEnum('subject_kind', ['staff', 'customer']);

export const categoryEnum = pgEnum('category', [
  'hardware',
  'service',
  'subscription',
  'accessories',
]);

export const stageEnum = pgEnum('stage', [
  'draft',
  'sent',
  'under_negotiation',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
  'confirmed',
  'lost',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'approved',
  'rejected',
  'returned',
  'skipped',
]);

export const negotiationStatusEnum = pgEnum('negotiation_status', [
  'none',
  'sent',
  'under_negotiation',
  'pending_reapproval',
  'confirmed',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'partially_paid',
  'paid',
]);

export const paymentMethodEnum = pgEnum('payment_method', [
  'card',
  'bank_transfer',
  'cheque',
  'upi',
  'other',
]);

export const cadenceEnum = pgEnum('cadence', ['monthly', 'quarterly', 'yearly']);

export const prorationRuleEnum = pgEnum('proration_rule', [
  'daily_prorate',
  'full_period',
  'next_cycle_adjust',
]);

export const cancellationRuleEnum = pgEnum('cancellation_rule', [
  'refund_unused',
  'no_refund',
  'credit_note_only',
]);

export const occurrenceStatusEnum = pgEnum('occurrence_status', [
  'scheduled',
  'invoiced',
  'paid',
  'refunded',
  'cancelled',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'cancelled']);

export const backorderPolicyEnum = pgEnum('backorder_policy', [
  'ship_available',
  'hold_until_complete',
]);

export const creditNoteTypeEnum = pgEnum('credit_note_type', ['refund', 'credit_note']);

export const alertTypeEnum = pgEnum('alert_type', [
  'stalled',
  'discount_anomaly',
  'delivery_slippage',
  'approval_bottleneck',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'approval_request',
  'approval_result',
  'negotiation',
  'nudge',
  'escalation',
  'system',
]);

/** Audit actors include two non-user principals: the portal customer, and the server. */
export const actorRoleEnum = pgEnum('actor_role', [
  'sales_rep',
  'sales_manager',
  'finance',
  'admin',
  'customer',
  'system',
]);

// =============================================================================
// Identity
// =============================================================================

/**
 * Sales territories. Seeded with three rows and deliberately not editable through
 * the API: the brief lists products, price lists, tiers, warehouses and plans as the
 * admin's configuration surface, and teams are not among them.
 *
 * A rep never picks their own team — `users.teamId` starts null and an admin or
 * manager assigns it from the staff directory. A foreign key rather than a free-text
 * label because team reporting is a GROUP BY: one typo would silently fork a group.
 */
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 80 }).notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Internal staff. Everyone self-registers as `sales_rep`; only an admin promotes.
 * Emails are stored already lower-cased and trimmed (see `lib/sanitize.ts`), so the
 * unique index is a reliable "one account per address" guarantee.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('sales_rep'),
    teamId: uuid('team_id').references(() => teams.id),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email), index('users_team_idx').on(table.teamId)],
);

/**
 * Customers. `customerId` (`DF-CMC827`) is the single public identifier: short enough
 * to read down a phone, and revealing nothing — no sequence, no count, no tier. It is
 * generated from the name and email (see `lib/customer-id.ts`) and made unique by the
 * index below; the generator retries with a new salt on collision.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: varchar('customer_id', { length: 12 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    contactName: varchar('contact_name', { length: 120 }),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    tier: tierEnum('tier').notNull().default('bronze'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    industry: varchar('industry', { length: 80 }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('customers_email_key').on(table.email),
    uniqueIndex('customers_customer_id_key').on(table.customerId),
  ],
);

/**
 * Refresh tokens live here rather than in Redis: they must survive a cache flush,
 * and revoking one has to be durable. Only the SHA-256 hash is stored, so a database
 * leak does not hand out working sessions.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    subjectKind: subjectKindEnum('subject_kind').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: varchar('user_agent', { length: 255 }),
    ip: varchar('ip', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_key').on(table.tokenHash),
    index('refresh_tokens_subject_idx').on(table.subjectId, table.subjectKind),
    // Lets the cleanup job find dead rows without a full scan.
    index('refresh_tokens_expires_idx').on(table.expiresAt),
  ],
);

// =============================================================================
// Catalog & pricing
// =============================================================================

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 200 }).notNull(),
    sku: varchar('sku', { length: 40 }).notNull(),
    category: categoryEnum('category').notNull(),
    basePrice: numeric('base_price', { precision: 14, scale: 2 }).notNull(),
    /** Internal only. Margin derives from it, so it must never reach a portal response. */
    costPrice: numeric('cost_price', { precision: 14, scale: 2 }).notNull(),
    unit: varchar('unit', { length: 24 }).notNull().default('unit'),
    taxPct: numeric('tax_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('products_sku_key').on(table.sku),
    index('products_category_idx').on(table.category),
  ],
);

export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    attribute: varchar('attribute', { length: 60 }).notNull(),
    value: varchar('value', { length: 60 }).notNull(),
    extraPrice: numeric('extra_price', { precision: 14, scale: 2 }).notNull().default('0'),
  },
  (table) => [
    uniqueIndex('product_variants_key').on(table.productId, table.attribute, table.value),
  ],
);

/**
 * Tier pricing is NOT a discount — it is the starting price for that customer, and a
 * rep's discount applies on top of it and is measured against the ceilings. Rows are
 * generated when a product is created so it is immediately quotable, and editable
 * afterwards.
 */
export const priceLists = pgTable(
  'price_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tier: tierEnum('tier').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('price_lists_key').on(table.productId, table.tier, table.currency),
  ],
);

// =============================================================================
// Governance configuration
// =============================================================================

/**
 * Discount ceiling per customer tier. One row per tier, seeded with the values from
 * the problem statement (Bronze 5, Silver 10, Gold 15).
 *
 * A table rather than a constant because these are business policy: a manager moves
 * them, and the change has to survive a redeploy.
 */
export const tierConfig = pgTable('tier_config', {
  tier: tierEnum('tier').primaryKey(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The other half of the binding ceiling. Each line is measured against
 * MIN(category ceiling, tier ceiling) — the stricter of the two — which is what lets
 * a Gold customer's 15% allowance still trip on a thin-margin service line capped
 * at 10%.
 */
export const categoryConfig = pgTable('category_config', {
  category: categoryEnum('category').primaryKey(),
  maxDiscountPct: numeric('max_discount_pct', { precision: 5, scale: 2 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The approval chain. A rule matches when `score > minScore` and
 * `score <= (maxScore ?? Infinity)`, or when any single line is more than
 * `singleLineTrip` points over its own ceiling.
 *
 * When several rules match, the one demanding MORE approvers wins — routing must
 * never step down.
 */
export const approvalRules = pgTable(
  'approval_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    minScore: numeric('min_score', { precision: 6, scale: 2 }).notNull(),
    maxScore: numeric('max_score', { precision: 6, scale: 2 }),
    approvers: text('approvers').array().notNull(),
    singleLineTrip: numeric('single_line_trip', { precision: 6, scale: 2 }),
    note: text('note'),
    sortOrder: integer('sort_order').notNull(),
  },
  (table) => [index('approval_rules_order_idx').on(table.sortOrder)],
);

/** Singleton: the thresholds the deal-health alerts are measured against. */
export const dashboardConfig = pgTable('dashboard_config', {
  id: integer('id').primaryKey().default(1),
  stallThresholdDays: integer('stall_threshold_days').notNull().default(5),
  anomalySensitivity: numeric('anomaly_sensitivity', { precision: 4, scale: 2 })
    .notNull()
    .default('1.80'),
  approvalSlaHours: integer('approval_sla_hours').notNull().default(24),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// Warehouses
// =============================================================================

export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    location: varchar('location', { length: 200 }),
    /** The split algorithm's cost tie-breaker. Higher means "prefer to ship elsewhere". */
    shippingCostWeight: numeric('shipping_cost_weight', { precision: 6, scale: 2 })
      .notNull()
      .default('1.00'),
    baseShipCost: numeric('base_ship_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    replenishThreshold: integer('replenish_threshold').notNull().default(0),
    replenishQty: integer('replenish_qty').notNull().default(0),
    replenishLeadDays: integer('replenish_lead_days').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('warehouses_name_key').on(table.name)],
);

export const warehouseStock = pgTable(
  'warehouse_stock',
  {
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.warehouseId, table.productId] }),
    index('warehouse_stock_product_idx').on(table.productId),
  ],
);

// =============================================================================
// Subscriptions & upsell
// =============================================================================

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 160 }).notNull(),
  cadence: cadenceEnum('cadence').notNull(),
  prorationRule: prorationRuleEnum('proration_rule').notNull().default('daily_prorate'),
  cancellationRule: cancellationRuleEnum('cancellation_rule').notNull().default('refund_unused'),
  minCommitmentMonths: integer('min_commitment_months').notNull().default(0),
  trialDays: integer('trial_days').notNull().default(0),
  billingDayOfCycle: integer('billing_day_of_cycle').notNull().default(1),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Which products a plan may be attached to. Drives default-plan resolution on a line. */
export const subscriptionPlanProducts = pgTable(
  'subscription_plan_products',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.planId, table.productId] })],
);

/**
 * Ranking is `coPurchaseScore + (promoted ? 25 : 0) + marginPct * 0.3`.
 *
 * A suggestion whose margin at the customer's tier price falls below `minMarginPct`
 * is dropped entirely rather than ranked low — the panel must never nudge a rep
 * toward a margin-destructive add-on.
 */
export const upsellRules = pgTable(
  'upsell_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    triggerProductId: uuid('trigger_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    suggestedProductId: uuid('suggested_product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    coPurchaseScore: numeric('co_purchase_score', { precision: 6, scale: 2 })
      .notNull()
      .default('0'),
    promoted: boolean('promoted').notNull().default(false),
    minMarginPct: numeric('min_margin_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('upsell_rules_pair_key').on(table.triggerProductId, table.suggestedProductId),
  ],
);

// =============================================================================
// Quotations
// =============================================================================

/**
 * Totals, tax, margin and effective discount are deliberately NOT stored. They are
 * derived from the lines on read, so a stored total can never disagree with the table
 * beside it. Risk is likewise computed and never persisted — a ceiling change must not
 * silently invalidate an approval someone already gave.
 *
 * `lastActivityAt` drives the stalled-deal alert and is bumped on every mutation,
 * including customer comments.
 */
export const quotations = pgTable(
  'quotations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 16 }).notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    /** Snapshotted from the customer at create, so a later tier move cannot rewrite it. */
    tier: tierEnum('tier').notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    stage: stageEnum('stage').notNull().default('draft'),
    orderDiscountPct: numeric('order_discount_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    negotiationStatus: negotiationStatusEnum('negotiation_status').notNull().default('none'),
    awaitingSeller: boolean('awaiting_seller').notNull().default(false),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    counterDiscountPct: numeric('counter_discount_pct', { precision: 5, scale: 2 }),
    counterJustification: text('counter_justification'),
    dismissedSuggestions: text('dismissed_suggestions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    promisedDeliveryDate: date('promised_delivery_date'),
    validUntil: date('valid_until'),
    /** Never reaches a portal response. */
    internalNotes: text('internal_notes'),
    customerTerms: text('customer_terms'),
    lostReason: text('lost_reason'),
    backorderPolicy: backorderPolicyEnum('backorder_policy').notNull().default('ship_available'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('quotations_reference_key').on(table.reference),
    index('quotations_customer_idx').on(table.customerId),
    index('quotations_owner_idx').on(table.ownerId),
    index('quotations_stage_idx').on(table.stage),
    index('quotations_activity_idx').on(table.lastActivityAt),
  ],
);

/**
 * Price, cost, category and tax are all resolved by the server from the product and
 * the customer's tier price list — a client-supplied price is never trusted. They are
 * snapshotted so a later catalogue price change does not silently rewrite an approved
 * quotation.
 */
export const quotationLines = pgTable(
  'quotation_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    productName: varchar('product_name', { length: 200 }).notNull(),
    category: categoryEnum('category').notNull(),
    qty: integer('qty').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    costPrice: numeric('cost_price', { precision: 14, scale: 2 }).notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    taxPct: numeric('tax_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    isSubscription: boolean('is_subscription').notNull().default(false),
    planId: uuid('plan_id').references(() => subscriptionPlans.id),
    subscriptionStartDate: date('subscription_start_date'),
    subscriptionStatus: subscriptionStatusEnum('subscription_status').notNull().default('active'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('quotation_lines_quotation_idx').on(table.quotationId)],
);

/**
 * `side` is what the portal shows. A customer never learns whether the person replying
 * is a rep, a manager or finance — the internal role names are not exposed.
 */
export const lineComments = pgTable(
  'line_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lineId: uuid('line_id')
      .notNull()
      .references(() => quotationLines.id, { onDelete: 'cascade' }),
    authorName: varchar('author_name', { length: 120 }).notNull(),
    authorId: uuid('author_id'),
    side: subjectKindEnum('side').notNull(),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('line_comments_line_idx').on(table.lineId)],
);

/**
 * Strictly ordered: only the first row still `pending` is actionable, so Finance can
 * never act before the Sales Manager. A "return for revision" deletes every row — a
 * resubmission re-scores from scratch, so a worse quote cannot ride a stale approval.
 */
export const approvalSteps = pgTable(
  'approval_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    status: approvalStatusEnum('status').notNull().default('pending'),
    stepOrder: integer('step_order').notNull(),
    reviewerId: uuid('reviewer_id').references(() => users.id),
    reviewerName: varchar('reviewer_name', { length: 120 }),
    reason: text('reason'),
    actedAt: timestamp('acted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('approval_steps_order_key').on(table.quotationId, table.stepOrder),
    index('approval_steps_status_idx').on(table.status),
  ],
);

// =============================================================================
// Fulfillment
// =============================================================================

/**
 * Only persisted once accepted or overridden. Until then the split is recomputed from
 * live stock on every read — but a rep's manual decision is never silently discarded
 * by a recompute.
 */
export const fulfillmentPlans = pgTable('fulfillment_plans', {
  quotationId: uuid('quotation_id')
    .primaryKey()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  isOverride: boolean('is_override').notNull().default(false),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  estimatedCost: numeric('estimated_cost', { precision: 14, scale: 2 }).notNull().default('0'),
  shipmentCount: integer('shipment_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fulfillmentAllocations = pgTable(
  'fulfillment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => quotationLines.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    qty: integer('qty').notNull(),
  },
  (table) => [index('fulfillment_allocations_quotation_idx').on(table.quotationId)],
);

export const backorders = pgTable(
  'backorders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => quotationLines.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    qty: integer('qty').notNull(),
    etaDate: date('eta_date'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [index('backorders_quotation_idx').on(table.quotationId)],
);

// =============================================================================
// Billing
// =============================================================================

/**
 * The recurring stream. One-time lines produce an invoice instead; the two never
 * merge — that separation is the point of hybrid billing. Twelve forward occurrences
 * are kept per active recurring line.
 */
export const billingOccurrences = pgTable(
  'billing_occurrences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => quotationLines.id, { onDelete: 'cascade' }),
    occursOn: date('occurs_on').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    status: occurrenceStatusEnum('status').notNull().default('scheduled'),
    cycleIndex: integer('cycle_index').notNull(),
  },
  (table) => [
    uniqueIndex('billing_occurrences_cycle_key').on(table.lineId, table.cycleIndex),
    index('billing_occurrences_quotation_idx').on(table.quotationId),
  ],
);

/** Issued automatically on a negative proration or a cancellation, or manually by finance. */
export const creditNotes = pgTable(
  'credit_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 16 }).notNull(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id').references(() => quotationLines.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    type: creditNoteTypeEnum('type').notNull(),
    reason: text('reason').notNull(),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('credit_notes_reference_key').on(table.reference),
    index('credit_notes_quotation_idx').on(table.quotationId),
  ],
);

// =============================================================================
// Invoices & payments
// =============================================================================

/**
 * One-time lines only. `amountPaid` and `balanceRemaining` are derived from `payments`
 * and never stored — a stored balance that drifts from the payment ledger is worse
 * than no balance at all.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reference: varchar('reference', { length: 16 }).notNull(),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    currency: varchar('currency', { length: 3 }).notNull(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull().default('0'),
    tax: numeric('tax', { precision: 14, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 14, scale: 2 }).notNull().default('0'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_reference_key').on(table.reference),
    index('invoices_quotation_idx').on(table.quotationId),
    index('invoices_customer_idx').on(table.customerId),
    index('invoices_status_idx').on(table.status),
  ],
);

/** Snapshot at build time. An invoice is a record; it does not follow later line edits. */
export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => quotationLines.id, { onDelete: 'cascade' }),
    productName: varchar('product_name', { length: 200 }).notNull(),
    qty: integer('qty').notNull(),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2 }).notNull(),
    taxPct: numeric('tax_pct', { precision: 5, scale: 2 }).notNull(),
    total: numeric('total', { precision: 14, scale: 2 }).notNull(),
  },
  (table) => [index('invoice_lines_invoice_idx').on(table.invoiceId)],
);

/**
 * finance / admin only — whoever sold the deal must not be the person who confirms the
 * cash arrived. The unique `idempotencyKey` is what stops a double-click recording a
 * payment twice.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    reference: varchar('reference', { length: 120 }),
    paidOn: date('paid_on').notNull(),
    notes: text('notes'),
    recordedById: uuid('recorded_by_id')
      .notNull()
      .references(() => users.id),
    recordedByName: varchar('recorded_by_name', { length: 120 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 120 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('payments_idempotency_key').on(table.idempotencyKey),
    index('payments_invoice_idx').on(table.invoiceId),
  ],
);

// =============================================================================
// Observability
// =============================================================================

/**
 * Append-only. There is no update or delete endpoint, ever — an editable audit trail
 * is worthless. The actor is always the server's own view of who called; a
 * client-supplied actor id is never trusted.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: uuid('entity_id'),
    /** Kept alongside the id so the trail stays readable after the row is gone. */
    entityRef: varchar('entity_ref', { length: 16 }),
    action: varchar('action', { length: 160 }).notNull(),
    actorId: uuid('actor_id'),
    actorName: varchar('actor_name', { length: 120 }).notNull(),
    actorRole: actorRoleEnum('actor_role').notNull(),
    reason: text('reason'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_entity_idx').on(table.entityType, table.entityId),
    index('audit_log_actor_idx').on(table.actorId),
    index('audit_log_created_idx').on(table.createdAt),
  ],
);

/**
 * Alerts themselves are computed on read from live data and thresholds — they are not
 * a queue. Only the operator actions taken against one need to survive, so only those
 * are stored.
 */
export const alertStates = pgTable('alert_states', {
  alertKey: varchar('alert_key', { length: 80 }).primaryKey(),
  quotationId: uuid('quotation_id')
    .notNull()
    .references(() => quotations.id, { onDelete: 'cascade' }),
  type: alertTypeEnum('type').notNull(),
  escalated: boolean('escalated').notNull().default(false),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),
  nudgedAt: timestamp('nudged_at', { withTimezone: true }),
});

/** In-app notifications stand in for the emails a production deployment would send. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),
    entityRef: varchar('entity_ref', { length: 16 }),
    view: varchar('view', { length: 40 }),
    read: boolean('read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_idx').on(table.userId, table.read),
    index('notifications_created_idx').on(table.createdAt),
  ],
);

// =============================================================================
// Relations
// =============================================================================

export const teamsRelations = relations(teams, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  team: one(teams, { fields: [users.teamId], references: [teams.id] }),
  ownedQuotations: many(quotations),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  quotations: many(quotations),
}));

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  prices: many(priceLists),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const priceListsRelations = relations(priceLists, ({ one }) => ({
  product: one(products, { fields: [priceLists.productId], references: [products.id] }),
}));

export const warehouseStockRelations = relations(warehouseStock, ({ one }) => ({
  warehouse: one(warehouses, {
    fields: [warehouseStock.warehouseId],
    references: [warehouses.id],
  }),
  product: one(products, { fields: [warehouseStock.productId], references: [products.id] }),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  customer: one(customers, { fields: [quotations.customerId], references: [customers.id] }),
  owner: one(users, { fields: [quotations.ownerId], references: [users.id] }),
  lines: many(quotationLines),
  approvalSteps: many(approvalSteps),
}));

export const quotationLinesRelations = relations(quotationLines, ({ one, many }) => ({
  quotation: one(quotations, {
    fields: [quotationLines.quotationId],
    references: [quotations.id],
  }),
  product: one(products, { fields: [quotationLines.productId], references: [products.id] }),
  plan: one(subscriptionPlans, {
    fields: [quotationLines.planId],
    references: [subscriptionPlans.id],
  }),
  comments: many(lineComments),
}));

export const lineCommentsRelations = relations(lineComments, ({ one }) => ({
  line: one(quotationLines, { fields: [lineComments.lineId], references: [quotationLines.id] }),
}));

export const approvalStepsRelations = relations(approvalSteps, ({ one }) => ({
  quotation: one(quotations, {
    fields: [approvalSteps.quotationId],
    references: [quotations.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  quotation: one(quotations, { fields: [invoices.quotationId], references: [quotations.id] }),
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  lines: many(invoiceLines),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
}));

// =============================================================================
// Types
// =============================================================================

/** `true` when the row has completed OTP verification and may sign in. */
export const isVerified = sql<boolean>`email_verified_at is not null`;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type Product = typeof products.$inferSelect;
export type PriceList = typeof priceLists.$inferSelect;
export type TierConfig = typeof tierConfig.$inferSelect;
export type CategoryConfig = typeof categoryConfig.$inferSelect;
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type UpsellRule = typeof upsellRules.$inferSelect;
export type Quotation = typeof quotations.$inferSelect;
export type QuotationLine = typeof quotationLines.$inferSelect;
export type ApprovalStep = typeof approvalSteps.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type CreditNote = typeof creditNotes.$inferSelect;
export type BillingOccurrence = typeof billingOccurrences.$inferSelect;

export type Role = (typeof roleEnum.enumValues)[number];
export type Tier = (typeof tierEnum.enumValues)[number];
export type SubjectKind = (typeof subjectKindEnum.enumValues)[number];
export type Category = (typeof categoryEnum.enumValues)[number];
export type Stage = (typeof stageEnum.enumValues)[number];
export type ApprovalStatus = (typeof approvalStatusEnum.enumValues)[number];
export type NegotiationStatus = (typeof negotiationStatusEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type Cadence = (typeof cadenceEnum.enumValues)[number];
export type ProrationRule = (typeof prorationRuleEnum.enumValues)[number];
export type CancellationRule = (typeof cancellationRuleEnum.enumValues)[number];
export type OccurrenceStatus = (typeof occurrenceStatusEnum.enumValues)[number];
export type BackorderPolicy = (typeof backorderPolicyEnum.enumValues)[number];
export type CreditNoteType = (typeof creditNoteTypeEnum.enumValues)[number];
export type AlertType = (typeof alertTypeEnum.enumValues)[number];
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type ActorRole = (typeof actorRoleEnum.enumValues)[number];
