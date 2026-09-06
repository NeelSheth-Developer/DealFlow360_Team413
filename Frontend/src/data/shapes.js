/**
 * JSDoc typedefs for every entity in the app. There is no TypeScript here —
 * these exist purely so editors give autocomplete and so the data contract is
 * documented in one place.
 *
 * Derived-not-stored is a hard rule: totals, margins, risk scores, invoice
 * balances and approval requirements are always recomputed from primitives by
 * functions in src/lib/. Storing them invites the classic bug where a badge
 * disagrees with the table next to it.
 */

/**
 * @typedef {'sales_rep'|'sales_manager'|'finance'|'admin'} Role
 * @typedef {'hardware'|'service'|'subscription'|'accessories'} Category
 * @typedef {'bronze'|'silver'|'gold'} Tier
 * @typedef {'draft'|'sent'|'under_negotiation'|'pending_approval'|'approved'
 *           |'fulfillment'|'billed'|'confirmed'|'lost'} Stage
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {Role} role
 * @property {string} team
 * @property {string} [avatarColor] derived by avatarGradient(), never stored
 * // No password field: credentials live server-side only, behind POST /auth/login.
 */

/**
 * @typedef {Object} Customer
 * @property {string} id
 * @property {string} name
 * @property {Tier} tier
 * @property {string} contactName
 * @property {string} email
 * @property {string} currency
 * @property {string} industry
 */

/**
 * @typedef {Object} ProductVariant
 * @property {string} attribute e.g. "Memory"
 * @property {string} value e.g. "32GB"
 * @property {number} extraPrice added on top of basePrice
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {string} sku
 * @property {Category} category
 * @property {number} basePrice
 * @property {number} costPrice
 * @property {string} unit
 * @property {number} taxPct
 * @property {string} description
 * @property {ProductVariant[]} variants
 * @property {boolean} active
 * // marginPct is DERIVED: (basePrice - costPrice) / basePrice * 100
 */

/**
 * @typedef {Object} PriceListEntry
 * @property {string} productId
 * @property {Tier} tier
 * @property {string} currency
 * @property {number} price
 */

/**
 * @typedef {Object} LineComment
 * @property {string} id
 * @property {string} author
 * @property {Role|'customer'} role
 * @property {string} message
 * @property {string} at ISO timestamp
 */

/**
 * @typedef {Object} QuoteLine
 * @property {string} id
 * @property {string} productId
 * @property {string} productName
 * @property {Category} category
 * @property {number} qty
 * @property {number} unitPrice
 * @property {number} costPrice
 * @property {number} discountPct
 * @property {number} taxPct
 * @property {boolean} isSubscription
 * @property {string|null} planId
 * @property {string|null} subscriptionStartDate
 * @property {'active'|'cancelled'} subscriptionStatus
 * @property {LineComment[]} comments
 * // lineSubtotal, lineTotal, marginAmount are DERIVED by src/lib/pricing.js
 */

/**
 * @typedef {Object} ApprovalStep
 * @property {Role} role
 * @property {'pending'|'approved'|'rejected'|'returned'|'skipped'} status
 * @property {string|null} reviewerId
 * @property {string|null} reviewerName
 * @property {string|null} at
 * @property {string|null} reason
 */

/**
 * @typedef {Object} Quotation
 * @property {string} id e.g. "Q-1042"
 * @property {string} customerId
 * @property {string} customerName
 * @property {Tier} tier
 * @property {string} currency
 * @property {string} ownerId
 * @property {string} ownerName
 * @property {Stage} stage
 * @property {QuoteLine[]} lines
 * @property {number} orderDiscountPct
 * @property {ApprovalStep[]} approvalSteps
 * @property {string} createdById who raised it
 * @property {string} createdByName
 * @property {string|null} sharedAt when it became visible to the customer
 * @property {'none'|'sent'|'under_negotiation'|'pending_reapproval'|'confirmed'} negotiationStatus
 * @property {boolean} awaitingSeller customer submitted a request, seller hasn't replied
 * @property {number|null} counterDiscountPct
 * @property {string|null} counterJustification
 * @property {string[]} dismissedSuggestions productIds the rep dismissed
 * @property {string} createdAt
 * @property {string} lastActivityAt
 * @property {string|null} promisedDeliveryDate
 * @property {string} validUntil
 * @property {string} internalNotes
 * @property {string} customerTerms
 * // riskScore, totals and requiresManager/Finance are ALL DERIVED
 */

/**
 * @typedef {Object} Warehouse
 * @property {string} id
 * @property {string} name
 * @property {string} location
 * @property {Record<string, number>} stock productId -> qty on hand
 * @property {number} shippingCostWeight higher = system prefers cheaper warehouses
 * @property {number} baseShipCost
 * @property {number} replenishThreshold
 * @property {number} replenishQty
 * @property {number} replenishLeadDays
 */

/**
 * @typedef {Object} SubscriptionPlan
 * @property {string} id
 * @property {string} name
 * @property {'monthly'|'quarterly'|'yearly'} cadence
 * @property {string[]} productIds
 * @property {'daily_prorate'|'full_period'|'next_cycle_adjust'} prorationRule
 * @property {'refund_unused'|'no_refund'|'credit_note_only'} cancellationRule
 * @property {number} minCommitmentMonths
 * @property {number} trialDays
 * @property {number} billingDayOfCycle
 * @property {boolean} active
 */

/**
 * @typedef {Object} UpsellRule
 * @property {string} id
 * @property {string} triggerProductId
 * @property {string} suggestedProductId
 * @property {number} coPurchaseScore 0-100
 * @property {boolean} promoted
 * @property {number} minMarginPct
 * @property {boolean} active
 */

/**
 * @typedef {Object} ApprovalRule
 * @property {string} id
 * @property {number} minScore exclusive lower bound
 * @property {number|null} maxScore inclusive upper bound, null = unbounded
 * @property {Role[]} approvers empty array means auto-approve
 * @property {number|null} singleLineTrip force-escalate if any line is this many points over
 */

/**
 * @typedef {Object} Allocation
 * @property {string} lineId
 * @property {string} warehouseId
 * @property {number} qty
 */

/**
 * @typedef {Object} Backorder
 * @property {string} lineId
 * @property {string} productId
 * @property {string} productName
 * @property {number} qty
 * @property {string|null} etaDate
 */

/**
 * @typedef {Object} FulfillmentPlan
 * @property {string} quotationId
 * @property {Allocation[]} allocations
 * @property {Backorder[]} backorders
 * @property {number} shipmentCount
 * @property {number} estimatedCost
 * @property {string[]} warehousesUsed
 * @property {boolean} isOverride
 * @property {string|null} acceptedAt
 */

/**
 * @typedef {Object} BillingOccurrence
 * @property {string} id
 * @property {string} lineId
 * @property {string|null} planId
 * @property {string} date
 * @property {number} amount
 * @property {'scheduled'|'invoiced'|'paid'|'refunded'|'cancelled'} status
 * @property {number} cycleIndex
 */

/**
 * @typedef {Object} Payment
 * @property {string} id
 * @property {string} invoiceId
 * @property {number} amount
 * @property {'card'|'bank_transfer'|'cheque'|'upi'|'other'} method
 * @property {string} reference
 * @property {string} recordedById
 * @property {string} recordedByName
 * @property {string} date
 */

/**
 * @typedef {Object} InvoiceLine
 * @property {string} lineId
 * @property {string} productName
 * @property {number} qty
 * @property {number} unitPrice
 * @property {number} discountPct
 * @property {number} total
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id
 * @property {string} quotationId
 * @property {string} customerName
 * @property {string} currency
 * @property {'draft'|'sent'|'partially_paid'|'paid'} status
 * @property {InvoiceLine[]} lines one-time lines only
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} total
 * @property {Payment[]} payments
 * @property {string} issueDate
 * @property {string} dueDate
 * // amountPaid and balanceRemaining are DERIVED from payments
 */

/**
 * @typedef {Object} CreditNote
 * @property {string} id
 * @property {string} quotationId
 * @property {string|null} lineId
 * @property {number} amount
 * @property {'refund'|'credit_note'} type
 * @property {string} reason
 * @property {string} createdAt
 * @property {string} createdById
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} id
 * @property {string} entityType
 * @property {string} entityId
 * @property {string} action
 * @property {string} actorId
 * @property {string} actorName
 * @property {Role|'customer'|'system'} actorRole
 * @property {string|null} reason
 * @property {Object|null} meta
 * @property {string} at
 */

/**
 * @typedef {Object} AnomalyAlert
 * @property {string} id
 * @property {'stalled'|'discount_anomaly'|'delivery_slippage'|'approval_bottleneck'} type
 * @property {'low'|'medium'|'high'} severity
 * @property {string} quotationId
 * @property {string} title
 * @property {string} detail
 * @property {Object} meta
 * @property {string} detectedAt
 */

/**
 * @typedef {Object} AppNotification
 * @property {string} id
 * @property {string} userId recipient
 * @property {'approval_request'|'approval_result'|'negotiation'|'nudge'|'escalation'|'system'} type
 * @property {string} title
 * @property {string} body
 * @property {string|null} link
 * @property {boolean} read
 * @property {string} at
 */

export {};
