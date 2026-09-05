# DealFlow360 — Project Overview

> **An Intelligent, Self-Governing Sales Operations Platform**
>
> Source of truth: `backend/DealFlow360.pdf` (hackathon problem statement).
> Mockup: <https://app.excalidraw.com/l/65VNwvy7c4X/7Fb5SR3WKu2>
>
> This document explains **what** the system is and **how every part connects**.
> For endpoint contracts see [`02-API-REFERENCE.md`](./02-API-REFERENCE.md).

---

## Table of Contents

| §  | Section |
|----|---------|
| 1  | [What DealFlow360 Is](#1-what-dealflow360-is) |
| 2  | [The Problem It Solves](#2-the-problem-it-solves) |
| 3  | [Goals & Key Outcomes](#3-goals--key-outcomes) |
| 4  | [User Roles](#4-user-roles) |
| 5  | [System Architecture](#5-system-architecture) |
| 6  | [Module Map (A1–A7, B1–B10)](#6-module-map-a1a7-b1b10) |
| 7  | [Data Model](#7-data-model) |
| 8  | [Blended Discount Risk Score](#8-blended-discount-risk-score) |
| 9  | [Approval Routing](#9-approval-routing) |
| 10 | [Live Margin Indicator](#10-live-margin-indicator) |
| 11 | [Upsell & Cross-Sell Engine](#11-upsell--cross-sell-engine) |
| 12 | [Multi-Warehouse Fulfillment](#12-multi-warehouse-fulfillment) |
| 13 | [Backorders & Consolidation](#13-backorders--consolidation) |
| 14 | [Hybrid Billing](#14-hybrid-billing) |
| 15 | [Proration, Cancellation & Credit Notes](#15-proration-cancellation--credit-notes) |
| 16 | [Customer Portal Negotiation](#16-customer-portal-negotiation) |
| 17 | [Automatic Re-Approval Loop](#17-automatic-re-approval-loop) |
| 18 | [Invoice & Payment](#18-invoice--payment) |
| 19 | [Deal Health & Anomaly Detection](#19-deal-health--anomaly-detection) |
| 20 | [Reporting](#20-reporting) |
| 21 | [Audit Trail](#21-audit-trail) |
| 22 | [Quotation Stage Machine](#22-quotation-stage-machine) |
| 23 | [Complete End-to-End Flow](#23-complete-end-to-end-flow) |
| 24 | [Quick Test Flow (PDF §9)](#24-quick-test-flow-pdf-9) |
| 25 | [Technical Guidelines & Deliverables](#25-technical-guidelines--deliverables) |
| 26 | [Glossary](#26-glossary) |

---

## 1. What DealFlow360 Is

DealFlow360 is a **B2B Sales Operations Platform**. It is not a quote-to-invoice form.
It is a **self-governing deal engine** that enforces pricing discipline, reacts to
inventory reality, reconciles subscriptions with one-time sales on a single order,
and gives both reps and customers a living, negotiable document instead of a static PDF.

```
                        ┌─────────────────────────────┐
                        │        DEALFLOW360          │
                        │  Self-Governing Deal Engine │
                        └──────────────┬──────────────┘
                                       │
     ┌──────────────┬──────────────────┼──────────────────┬──────────────┐
     │              │                  │                  │              │
     ▼              ▼                  ▼                  ▼              ▼
┌─────────┐   ┌───────────┐     ┌────────────┐    ┌────────────┐  ┌───────────┐
│ DISCOUNT│   │  UPSELL   │     │ MULTI-WH   │    │  HYBRID    │  │   DEAL    │
│GOVERNANCE│   │  ENGINE   │     │FULFILLMENT │    │  BILLING   │  │  HEALTH   │
├─────────┤   ├───────────┤     ├────────────┤    ├────────────┤  ├───────────┤
│ ceilings│   │co-purchase│     │ auto-split │    │ one-time + │  │ stalled   │
│ blended │   │ promotion │     │ backorder  │    │ recurring  │  │ anomaly   │
│  risk   │   │ margin    │     │consolidate │    │ proration  │  │ slippage  │
│ routing │   │  floor    │     │            │    │            │  │bottleneck │
└─────────┘   └───────────┘     └────────────┘    └────────────┘  └───────────┘
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │   CUSTOMER PORTAL (separate)│
                        │ negotiate · counter · confirm│
                        └─────────────────────────────┘
```

### The seven capabilities named in the PDF

| # | Capability | Why it exists |
|---|-----------|---------------|
| 1 | Multi-tier discount governance + automated approval routing | Stop margin leaking without making managers review every quote |
| 2 | Live upsell / cross-sell while building a quotation | Grow deal size at the moment of composition, with margin impact visible |
| 3 | Multi-warehouse fulfillment splitting + backorder handling | Real stock is fragmented across locations |
| 4 | Hybrid billing (one-time mixed with recurring lines) | Real orders contain hardware *and* subscriptions |
| 5 | Deal health monitoring and anomaly alerts | Managers find out a deal is stuck *before* it dies |
| 6 | Customer-facing portal negotiation | Replace the email back-and-forth with a live document |
| 7 | Sales backend configuration + reporting dashboards | The rules must be configurable, not hardcoded |

---

## 2. The Problem It Solves

Most sales tools handle the happy path. Real B2B sales is messier.

```
        SIMPLE SALES TOOL                     REAL B2B CONDITIONS
    ─────────────────────────            ────────────────────────────────
                                          multi-level discount approvals
    Create Quote                          partial stock across warehouses
         ↓                                subscriptions bundled with hardware
    Confirm Order          ✗ ignores →    customers negotiating in email threads
         ↓                                managers learning too late a deal stalled
    Invoice                               small over-limit discounts spread thin
                                          mid-cycle plan changes needing proration


                  DEALFLOW360 CLOSES EACH GAP
    ────────────────────────────────────────────────────────────
    discount approvals  ──→  blended risk score + auto-routed chain
    fragmented stock    ──→  auto-split engine + backorder ETA
    bundled billing     ──→  one order, two billing streams
    email negotiation   ──→  restricted customer portal
    late stall discovery──→  deal-health alerts with nudge/escalate
    spread-thin discount──→  value-weighted blended score
    mid-cycle changes   ──→  configurable proration strategies
```

---

## 3. Goals & Key Outcomes

**Main goal.** Build a complete sales flow: backend configuration **plus** a frontend
quotation-to-cash experience.

```
                          KEY OUTCOMES (PDF §2)
   ┌──────────────────────────────────────────────────────────────────┐
   │ 1. Rep logs in, builds a quotation, and it AUTO-ROUTES for the    │
   │    correct approval based on discount + customer tier            │
   │ 2. Rep receives live upsell/cross-sell suggestions with REAL-TIME │
   │    margin impact while building                                  │
   │ 3. Order AUTO-SPLITS across warehouses by stock, manual override  │
   │ 4. ONE order mixes one-time + recurring lines, correct proration  │
   │    and billing schedules                                         │
   │ 5. Dashboard shows deal health, stalled quotes, discount          │
   │    anomalies in real time                                        │
   │ 6. Customer views + negotiates from a portal, no email round-trip │
   └──────────────────────────────────────────────────────────────────┘
```

### In scope vs bonus

| Required (PDF §7–8) | Bonus |
|---|---|
| Login / role access, products, price lists, customer-tier pricing | Multi-currency |
| Discount ceilings, approval chains | Multi-company support |
| Warehouses, stock, subscription plans | Advanced recommendation logic |
| Sales workspace, quotation builder, live margin | Advanced analytics / forecasting |
| Approval screen, warehouse split, hybrid billing | |
| Customer portal + negotiation, Deal Health dashboard, reporting | |
| **Core business rules in application logic — not faked** | |
| **Separate restricted customer view** | |
| Audit trail, sample seed data, working backend + frontend | |

---

## 4. User Roles

Five roles: four internal, one external.

```
                            DEALFLOW360
                                 │
              ┌──────────────────┴──────────────────┐
              │                                     │
        INTERNAL USERS                        EXTERNAL USER
              │                                     │
    ┌─────────┼─────────┬──────────┐                │
    ▼         ▼         ▼          ▼                ▼
┌───────┐ ┌───────┐ ┌────────┐ ┌────────┐   ┌──────────────┐
│ ADMIN │ │ SALES │ │ SALES  │ │FINANCE │   │  CUSTOMER /  │
│       │ │  REP  │ │MANAGER │ │  OPS   │   │ PORTAL USER  │
├───────┤ ├───────┤ ├────────┤ ├────────┤   ├──────────────┤
│config │ │create │ │approve │ │2nd-lvl │   │view own quote│
│catalog│ │ deals │ │reject  │ │approval│   │ask questions │
│rules  │ │discnt │ │return  │ │wh split│   │request change│
│wh/stok│ │upsell │ │tiers   │ │backordr│   │counter disc. │
│plans  │ │track  │ │chains  │ │billing │   │confirm quote │
│reports│ │negot. │ │health  │ │credits │   │              │
└───────┘ └───────┘ └────────┘ └────────┘   └──────────────┘
    │         │         │          │                │
    └─────────┴─────────┴──────────┘                │
         INTERNAL APPLICATION                 CUSTOMER PORTAL
         (full workspace + backend)          (restricted view only)
```

### 4.1 What each role does

| Role | Primary job | Owns |
|---|---|---|
| **Admin** | Set up the rules the business runs on | Products, categories, variants, price lists, tiers, discount ceilings, approval chains, warehouses, stock, replenishment, shipping weights, subscription plans, proration/cancellation rules, upsell rules, users, reporting access |
| **Sales Rep** | Create and manage deals | Customers, quotations, lines, discounts, upsell decisions, negotiation replies |
| **Sales Manager** | Protect pricing discipline | Approve / reject / return quotations over threshold, configure tiers + chains, monitor Deal Health |
| **Finance / Ops** | High-risk approval, fulfillment, billing control | Second-level approvals, warehouse splits, backorder decisions, recurring billing reconciliation, credit notes / partial refunds |
| **Customer** | Review and negotiate | Own quotation only — questions, change requests, counter-discount, confirmation |

### 4.2 Permission matrix

| Capability | Admin | Manager | Finance | Rep | Customer |
|---|:---:|:---:|:---:|:---:|:---:|
| Configure catalog & price lists | ✅ | ➖ | ➖ | ➖ | ❌ |
| Configure discount tiers / chains | ✅ | ✅ | ➖ | ❌ | ❌ |
| Configure warehouses & stock | ✅ | ➖ | ✅ | ❌ | ❌ |
| Configure subscription plans | ✅ | ➖ | ✅ | ❌ | ❌ |
| Create / edit quotation | ✅ | ✅ | ➖ | ✅ | ❌ |
| Submit for approval | ✅ | ✅ | ➖ | ✅ | ❌ |
| Approve step (manager) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve step (finance) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Accept / override warehouse split | ✅ | ✅ | ✅ | ✅ | ❌ |
| Record payment / credit note | ✅ | ➖ | ✅ | ❌ | ❌ |
| View Deal Health dashboard | ✅ | ✅ | ✅ | own only | ❌ |
| View reports | ✅ | ✅ | ✅ | own only | ❌ |
| View own quotation | ✅ | ✅ | ✅ | ✅ | ✅ |
| See cost / margin / risk / ceilings | ✅ | ✅ | ✅ | ✅ | **❌ never** |
| See other customers' data | ✅ | ✅ | ✅ | ✅ | **❌ never** |

✅ full · ➖ read-only or partial · ❌ denied

### 4.3 Why Rep and Customer must be different

```
   SALES REP  "I work for the seller"     CUSTOMER  "I am buying"
   ────────────────────────────────      ──────────────────────────
   many customers                        one quotation (their own)
   many quotations                       questions
   pipeline, discounts, approvals        change requests
   fulfillment status, margins           counter discount
   internal cost + risk visibility       confirmation
                                          ─────────────────────────
                                          NO cost, NO margin,
                                          NO risk score, NO ceilings,
                                          NO other customers
```

> **Hard requirement (PDF §7).** The customer-facing negotiation screen must be a
> **real, separate, restricted view** — not another internal screen with a different
> label. Field-stripping happens server-side before the response leaves the API.

---

## 5. System Architecture

One codebase, three shells, strict separation at the data layer.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                            PRESENTATION                                  │
│                                                                          │
│  ┌────────────────┐   ┌────────────────────┐   ┌────────────────────┐   │
│  │ MarketingLayout│   │  WorkspaceLayout   │   │   PortalLayout     │   │
│  │ landing, login │   │ internal app +     │   │ customer only      │   │
│  │                │   │ nested Backend     │   │ imports NOTHING    │   │
│  │                │   │ config area        │   │ from workspace     │   │
│  └────────────────┘   └────────────────────┘   └────────────────────┘   │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │  guards: RequireAuth · RequireRole
                                │          RequirePortalToken
┌───────────────────────────────▼──────────────────────────────────────────┐
│                          API  /api/v1                                    │
│                                                                          │
│   INTERNAL SURFACE                      PORTAL SURFACE                   │
│   JWT kind:"staff" · role-scoped        JWT kind:"customer" · no role    │
│   /auth /products /quotations           /portal/quotations/:id           │
│   /approvals /fulfillment /billing      scoped to that customer's own    │
│   /invoices /reports /audit-log         quotes · passes toPortalView()   │
│                                                                          │
│   Every route checks `kind` server-side. A customer token on an internal  │
│   route is 403, and a staff token on a portal route is 403.              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                       BUSINESS LOGIC  (pure, testable)                   │
│                                                                          │
│  pricing · riskEngine · stageMachine · upsellEngine                      │
│  warehouseSplit · billingEngine · anomalyEngine · portalView             │
│                                                                          │
│  No framework imports. Same functions power the builder gauge,           │
│  the approval breakdown, the risk sandbox and the detector.              │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────────┐
│                           PERSISTENCE                                    │
│  users · customers · products · variants · price_lists                   │
│  discount_config · approval_rules · quotations · quotation_lines         │
│  approval_steps · warehouses · inventory · fulfillment_allocations       │
│  backorders · subscription_plans · subscriptions · billing_schedules     │
│  invoices · payments · credit_notes · negotiation_requests               │
│  deal_alerts · audit_log · notifications                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 The one rule that keeps it coherent

```
   DERIVED, NEVER STORED
   ─────────────────────────────────────────────────────
   totals · margins · risk score · approval requirement
   invoice balance · effective discount %
                        ↓
   always recomputed from primitives by src/lib functions
                        ↓
   the badge can never disagree with the table
```

---

## 6. Module Map (A1–A7, B1–B10)

The PDF splits the system into a **backend configuration area (A)** and a
**sales frontend experience (B)**.

```
╔═══════════════════════════════════════════════════════════════════════╗
║  A · SALES BACKEND CONFIGURATION AREA          (Admin / Manager / Fin) ║
╠═══════════════════════════════════════════════════════════════════════╣
║ A1  Authentication (Login / Signup)   email+password + OTP verify ·   ║
║                                       forgot/reset password          ║
║ A2  Product & Price List Management   general · variants · price lists ║
║ A3  Discount Tier & Approval Chain    tier ceilings · category         ║
║                                       ceilings · chain rules          ║
║ A4  Warehouse & Fulfillment Setup     stock · replenishment · ship wt  ║
║ A5  Subscription / Recurring Plans    cadence · proration · cancel     ║
║ A6  Upsell / Cross-Sell Rules (opt.)  pairings · promoted · margin min ║
║ A7  Reporting & Dashboard Config      filters · PDF / XLS export       ║
╚═══════════════════════════════════════════════════════════════════════╝
                                   │
                    configuration feeds the workspace
                                   ▼
╔═══════════════════════════════════════════════════════════════════════╗
║  B · SALES FRONTEND — REP WORKSPACE EXPERIENCE                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║ B1  Sales Workspace / Top Menu        Quotations · Pipeline ·         ║
║                                       Reload Data · Go to Back-end ·  ║
║                                       Close Workspace                 ║
║ B2  Quotation List / Pipeline View    cards: customer · amount · stage ║
║ B3  Quotation Builder (Products+Cart) qty ± · line & order discount ·  ║
║                                       LIVE MARGIN indicator           ║
║ B4  Discount Approval Screen          blended risk · steps · audit     ║
║ B5  Upsell & Cross-Sell Panel         ranked · margin delta · promo    ║
║ B6  Fulfillment & Warehouse Split     split · shipments · cost ·       ║
║                                       accept / manual override        ║
║ B7  Subscription & Billing Screen     one-time vs recurring · schedule ║
║                                       · proration · cancel / refund   ║
║ B8  Customer Portal Negotiation       SEPARATE restricted view        ║
║ B9  Deal Health & Anomaly Dashboard   stalled · anomaly · slippage     ║
║ B10 Invoice & Payment                 send · record payment · status   ║
║     (implied by Quick Test Flow §9 step 8)                            ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### 6.1 Dashboards by audience

| Dashboard | For | Shows |
|---|---|---|
| **Sales Rep Workspace** | Rep | My pipeline value, active deals, pending approval, waiting on customer, my quotations by stage |
| **Deal Health** (B9) | Manager | Team pipeline, active deals, pending approvals, at-risk deals, alert feed |
| **Operations** | Finance / Ops | Finance approvals, pending fulfillment, backorders, billing exceptions |
| **Customer Portal** | Customer | Their quotation(s) and status only — *not* an analytics dashboard |

```
   SALES REP DASHBOARD              DEAL HEALTH DASHBOARD        OPERATIONS
   ────────────────────             ─────────────────────        ──────────
   My Pipeline    ₹18.4L            Team Pipeline    ₹82L        Fin Appr.  5
   Active Deals       12            Active Deals       54        Pending WH 8
   Pending Approval    3            Pending Approval    7        Backorders 3
   Waiting Customer    2            At-Risk Deals       5        Billing Ex 2

   Draft                            ALERTS
     ABC Corp    ₹2.4L              ──────────────────────
   Pending Approval                 Q-1044  Discount anomaly
     Beta Ltd    ₹5.1L              Q-1031  Stalled 8 days
   Sent to Customer                 Q-1061  Delivery risk
     Nova Tech   ₹3.6L
```

---

## 7. Data Model

### 7.1 Entity relationships

```
   CUSTOMER ──1:N──> QUOTATION ──1:N──> QUOTATION_LINE ──N:1──> PRODUCT
      │                  │                     │                   │
      │                  │                     │                   ├─N:1─> CATEGORY
   CUSTOMER_TIER         │                     │                   └─1:N─> VARIANT
      │                  │                     │
      └──influences──────┤                     ├──N:1──> SUBSCRIPTION_PLAN
                         │                     │              │
   PRICE_LIST ───────────┤                     │              └─1:N─> BILLING_SCHEDULE
   (product × tier ×     │                     │
    currency)            │                     ├──1:N──> FULFILLMENT_ALLOCATION ──N:1──> WAREHOUSE
                         │                     │                                            │
   DISCOUNT_RULES        │                     └──1:N──> BACKORDER              INVENTORY ──┘
   (tier + category      │                                                     (product×warehouse)
    ceilings) ───checks──┤
                         │
   APPROVAL_POLICY ──────┼──creates──> APPROVAL_REQUEST ──1:N──> APPROVAL_STEP
   (chain rules)         │                                            │
                         │                                       APPROVAL_HISTORY
                         │
                         ├──1:N──> NEGOTIATION_REQUEST  (from portal)
                         │
                         ├──1:1──> INVOICE ──1:N──> PAYMENT
                         │            └──1:N──> CREDIT_NOTE
                         │
                         └──1:N──> DEAL_ALERT

   USER ──N:1──> ROLE          AUDIT_LOG ──> (entityType, entityId, actor, action, reason, at)
```

### 7.2 Core entity fields

| Entity | Key fields |
|---|---|
| **User** | id, name, email, role (`sales_rep`\|`sales_manager`\|`finance`\|`admin`), active |
| **Customer** | id, name, tier (`bronze`\|`silver`\|`gold`), contactName, email, currency |
| **Product** | id, name, sku, category, basePrice, **costPrice**, unit, taxPct, description, variants[], active |
| **PriceListEntry** | productId, tier, currency, price |
| **Quotation** | id, customerId, tier, ownerId, **stage**, lines[], orderDiscountPct, approvalSteps[], negotiationStatus, createdAt, lastActivityAt, promisedDeliveryDate, validUntil, internalNotes, customerTerms |
| **QuoteLine** | id, productId, category, qty, unitPrice, **costPrice**, discountPct, taxPct, isSubscription, planId, comments[] |
| **ApprovalStep** | role, status (`pending`\|`approved`\|`rejected`\|`returned`\|`skipped`), reviewerId, at, reason |
| **Warehouse** | id, name, location, stock{productId→qty}, **shippingCostWeight**, baseShipCost, replenishThreshold, replenishQty, replenishLeadDays |
| **SubscriptionPlan** | id, name, cadence, productIds[], **prorationRule**, **cancellationRule**, minCommitmentMonths, trialDays |
| **UpsellRule** | id, triggerProductId, suggestedProductId, coPurchaseScore (0–100), promoted, minMarginPct |
| **FulfillmentPlan** | quotationId, allocations[{lineId, warehouseId, qty}], backorders[{lineId, qty, etaDate}], shipmentCount, estimatedCost, isOverride |
| **Invoice** | id, quotationId, status (`draft`\|`sent`\|`partially_paid`\|`paid`), lines[], subtotal, tax, total, payments[], issueDate, dueDate |
| **AuditEntry** | id, entityType, entityId, action, actorId, actorRole, reason, meta, at |
| **DealAlert** | id, type, severity, quotationId, title, detail, meta, detectedAt |

> **Product vs Inventory are different things.**
> `PRODUCT` answers *"what do we sell?"*. `INVENTORY` answers
> *"how many units exist in each warehouse?"* One product exists in many warehouses.

---

## 8. Blended Discount Risk Score

This is the platform's differentiator, and PDF §10 is dedicated to it.

### 8.1 The idea

Every line is checked against **its own category ceiling**, not one blanket
order-level limit.

```
   NAIVE CHECK                        DEALFLOW360 CHECK
   ───────────────────────            ─────────────────────────────────
   order discount = 13%               Line 1  hardware  12% vs 15%  → OK
   tier allows 15%                    Line 2  service   18% vs 10%  → 8 over
   → "fine, approve"                  Line 3  subscr.    9% vs 12%  → OK
                                                    ↓
   ✗ misses the service line          value-weight the overages
     that broke a stricter                          ↓
     limit                            blended score → approval level
```

### 8.2 Why "blended"

Sometimes no single line is badly over, but many are each a little over:

```
   Line 1  →  2 points over
   Line 2  →  3 points over          none alarming alone…
   Line 3  →  2 points over
                    ↓
   …but added across the order the rep quietly gave away a lot of margin.

   The blended score looks at the TOTAL PATTERN across the order,
   so small violations spread across many lines cannot slip through.
```

### 8.3 The algorithm

```
FOR each line:
    effectivePct = line.discountPct + orderDiscountPct × (1 − line.discountPct/100)
    ceiling      = MIN(categoryCeiling[line.category], tierCeiling)     ← stricter wins
    overBy       = MAX(0, effectivePct − ceiling)
    lineValue    = qty × unitPrice × (1 − line.discountPct/100)

    weightedOverage += overBy × lineValue
    totalValue      += lineValue
    worstSingle      = MAX(worstSingle, overBy)

score = weightedOverage / totalValue          ← value-weighted avg overage, in points
```

```
   ┌──────────────────────────────────────────────────────────┐
   │  score  == 0        →  LOW     green   Auto-approve       │
   │  score  <= 5        →  MEDIUM  amber   Manager approval    │
   │  score  >  5        →  HIGH    red     Manager + Finance   │
   │                                                            │
   │  worstSingleOverage > singleLineTrip → force escalation     │
   │  (one badly-over line trips approval regardless of blend)   │
   └──────────────────────────────────────────────────────────┘
```

### 8.4 The PDF's worked example

> A Gold customer is normally allowed up to 15%. Hardware items are allowed up to 15%
> (healthy margins); Service items only up to 10% (thin margins).

```
  ┌─────────────────┬──────────┬──────────┬─────────┬─────────┬───────────┬──────────┐
  │ Line            │ Category │  Value   │  Given  │ Allowed │  Over by  │ Weighted │
  ├─────────────────┼──────────┼──────────┼─────────┼─────────┼───────────┼──────────┤
  │ Laptop          │ hardware │ ₹ 88,000 │   12 %  │   15 %  │     0     │        0 │
  │ Setup Service   │ service  │ ₹ 16,400 │   18 %  │   10 %  │   ⚠ 8     │  131,200 │
  ├─────────────────┴──────────┼──────────┼─────────┴─────────┴───────────┼──────────┤
  │                      TOTAL │ ₹104,400 │                               │  131,200 │
  └────────────────────────────┴──────────┴───────────────────────────────┴──────────┘

        blended score = 131,200 / 104,400  =  1.26 points
        worst single overage               =  8 points
                            ↓
        1.26 > 0            →  Manager approval required
        8 > singleLineTrip(5) → escalation confirmed
                            ↓
                  ROUTE TO: Sales Manager
```

> **Even though the customer is Gold and 15% sounds fine on paper, the Service line
> broke its own stricter limit — so the whole quotation gets flagged, because of
> that one line.** That is exactly the behaviour the PDF describes.

### 8.5 Why this matters

```
   ┌────────────────────────────────────────────────────────────────┐
   │ • Decides WHO reviews the deal, so managers are not stuck       │
   │   reviewing every single quotation by hand                     │
   │ • Stops a rep keeping every line technically within limits      │
   │   while still discounting the order more than intended overall  │
   └────────────────────────────────────────────────────────────────┘
```

---

## 9. Approval Routing

The rep **never chooses the approver**. The system decides.

```
                       Rep clicks "Submit"
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │ 1. compute blended risk      │
                 │    (§8, on CURRENT lines)    │
                 └──────────────┬───────────────┘
                                ▼
                 ┌──────────────────────────────┐
                 │ 2. match approval-chain rule │
                 │    by score range            │
                 │ 3. also check singleLineTrip │
                 │    → whichever demands MORE  │
                 │      approvers wins          │
                 └──────────────┬───────────────┘
                                ▼
                    ┌───────────┴───────────┐
                    │                       │
            approvers == []          approvers = [...]
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────────────┐
        │ stage = approved  │   │ stage = pending_approval   │
        │ audit:            │   │ build ordered steps        │
        │ "Auto-approved    │   │ notify approver #1 only    │
        │  (within all      │   └────────────┬──────────────┘
        │   ceilings)"      │                │
        └───────────────────┘                ▼
                                 ┌───────────────────────────┐
                                 │  STEP 1 · Sales Manager   │◄── only the FIRST
                                 └────────────┬──────────────┘    pending step is
                          ┌───────────────────┼──────────────┐    actionable.
                          ▼                   ▼              ▼    Finance CANNOT
                    ┌──────────┐      ┌─────────────┐  ┌──────────┐  approve before
                    │ APPROVE  │      │   RETURN    │  │  REJECT  │  the Manager.
                    └────┬─────┘      │ reason req. │  │reason req│
                         │            └──────┬──────┘  └────┬─────┘
                         │                   ▼              ▼
                         │           stage = draft    stage = lost
                         │           steps cleared    steps skipped
                         │           rep notified     rep notified
                         ▼
              ┌──────────────────────┐
              │ next pending step?   │
              └──────┬────────┬──────┘
                 yes │        │ no
                     ▼        ▼
        ┌────────────────┐  ┌─────────────────────────────┐
        │ STEP 2 ·       │  │ stage = approved            │
        │ FINANCE        │  │ notify rep                  │
        │ (only if       │  │ fulfillment split computed  │
        │  required)     │  └─────────────────────────────┘
        └────────────────┘
```

### 9.1 Seeded approval chain

| Rule | Score range | Single-line trip | Approvers | Label |
|---|---|---|---|---|
| 1 | `= 0` | — | *(none)* | Auto-approve |
| 2 | `> 0` and `≤ 5` | `> 5` | Sales Manager | Manager approval |
| 3 | `> 5` | — | Sales Manager → Finance | Manager + Finance |

### 9.2 Anti-gaming rule

```
   A returned quote that is edited and resubmitted
   RECOMPUTES RISK FROM SCRATCH against the current chain.

   A rep cannot sneak a worse quote through on a stale approval.
```

Every approval, rejection, and edit is logged with **user, timestamp, and reason** (PDF §4 A3).

---

## 10. Live Margin Indicator

Required by PDF §4 B3 — visible while building, updating on every change.

```
     Selling Price          Final Selling Price (after discount)
          −                            −
     Internal Cost                Internal Cost
          =                            =
     Gross Profit              POST-DISCOUNT PROFIT
                                        │
                                        ▼
                          marginPct = profit / netRevenue × 100
```

```
   ┌───────────────── SUMMARY RAIL ──────────────────┐
   │  Subtotal              ₹ 1,20,000               │
   │  Line discounts       −₹   15,600               │
   │  Order discount       −₹    2,000               │
   │  Tax                   ₹   18,432               │
   │  ───────────────────────────────                │
   │  GRAND TOTAL           ₹ 1,20,832               │
   │                                                 │
   │  MARGIN  14.2 %  ████████░░░░░░░  ▼ was 16.8%   │  ← pulses on change
   │  RISK    1.26    ◐ Manager approval             │  ← recomputes live
   └─────────────────────────────────────────────────┘
```

For **services**, "internal cost" represents the company's estimated cost to deliver
the service. Full payroll/accounting is explicitly **out of scope** — cost price is
business configuration entered on the product.

---

## 11. Upsell & Cross-Sell Engine

Shown alongside the cart while the rep builds (PDF §4 B5).

```
   Cart contains "Laptop Pro 14"
                │
                ▼
   ┌────────────────────────────────────────────────────────┐
   │ FOR each active upsell rule                            │
   │   ✗ skip if trigger product not in cart                │
   │   ✗ skip if suggested product already in cart          │
   │   ✗ skip if margin% < rule.minMarginPct   ← margin floor│
   │                                                        │
   │   rankScore = coPurchaseScore                          │
   │             + (promoted ? 25 : 0)      ← promotion boost│
   │             + marginPct × 0.3          ← margin weight  │
   │                                                        │
   │ de-duplicate by product, keep best score, sort desc    │
   └────────────────────────────┬───────────────────────────┘
                                ▼
   ┌────────────────── SUGGESTIONS (3) ─────────────────────┐
   │ ┌────────────────────────────────────────────────────┐ │
   │ │ Docking Station              [PROMOTED]  score 92  │ │
   │ │ "Frequently bought with Laptop Pro 14"             │ │
   │ │ Margin delta  +₹4,200   ·   +38.4% margin          │ │
   │ │ co-purchase ████████████████░░░░  82               │ │
   │ │            [ Add to Quote ]   [ Dismiss ]          │ │
   │ └────────────────────────────────────────────────────┘ │
   └────────────────────────────────────────────────────────┘
                                │  Add to Quote
                                ▼
        line inserted → totals, MARGIN and RISK all update IMMEDIATELY
        (PDF calls this out as an explicit demo checkpoint)
```

Ranking inputs, per the PDF: **historical co-purchase data**, **active promotions**,
and a **minimum healthy margin** threshold.

---

## 12. Multi-Warehouse Fulfillment

### 12.1 The ranking algorithm

```
FOR each shippable line (subscriptions/services are not shipped):

   rank candidate warehouses by:
     1. can it fulfil the ENTIRE line?      ← fewest shipments
     2. is it already used by this order?   ← consolidation
     3. lower shippingCostWeight            ← cheaper first
     4. more stock on hand                  ← tie-break

   greedily allocate from the best, then the next for the remainder
   any unallocated qty → BACKORDER with ETA from replenishLeadDays

shipmentCount = distinct warehouses used
estimatedCost = Σ (baseShipCost × shippingCostWeight) per warehouse used
```

### 12.2 Worked example (PDF §16)

```
   Customer needs: 50 Laptops

   INVENTORY                        SUGGESTED SPLIT
   ─────────────────                ────────────────────────────
   Ahmedabad  → 40                  Ahmedabad  → 40   ██████████████████
   Mumbai     → 25                  Mumbai     → 10   ████
   Delhi      → 15                  ─────────────────────────────
                                    Shipments: 2   Est. cost: ₹960

                              [ Accept Suggested Split ]  [ Manual Override ]
```

### 12.3 Manual override

```
   ┌──────────────────────────────────────────────────────────────┐
   │ Line          │ Ordered │ Ahmedabad │ Mumbai │ Delhi │ Alloc │
   ├───────────────┼─────────┼───────────┼────────┼───────┼───────┤
   │ Laptop Pro 14 │   50    │   [ 30 ]  │ [ 20 ] │ [ 0 ] │ 50 ✓  │
   │ Monitor 27"   │   10    │   [  4 ]  │ [ 12 ]❌│ [ 0 ] │ 16 ✗  │
   └───────────────┴─────────┴───────────┴────────┴───────┴───────┘
        ❌ "Only 8 available at Mumbai"        ✗ "Over-allocated: 16 of 10"

        Shipments 2 → 2      Cost ₹960 → ₹1,380     [ +₹420 vs suggested ]
        [ Reset to suggestion ]   [ Save Override ]  ← blocked while invalid
```

Validation runs on every cell: `qty ≤ warehouse stock` and `Σ per line ≤ qty ordered`.
The **cost delta vs the suggestion** is shown, so the price of a manual override is visible.

---

## 13. Backorders & Consolidation

```
   Customer needs 100          Available: Ahmedabad 40 + Mumbai 25 + Delhi 15 = 80
                                                    ↓
                              ┌─────────────────────────────────────┐
                              │  Fulfil now  =  80                  │
                              │  Backorder   =  20   ETA +7 days    │
                              └─────────────────────────────────────┘
                                                    ↓
                        ┌───────────────────────────┴────────────────┐
                        ▼                                            ▼
        ┌──────────────────────────────┐         ┌──────────────────────────────┐
        │ Ship available now,          │         │ Hold entire order until      │
        │ backorder the rest           │         │ complete                     │
        └──────────────────────────────┘         └──────────────────────────────┘

   ──────────────────────────────────────────────────────────────────────────
   LATER: stock arrives while the backorder is still open
                                    ↓
        ┌────────────────────────────────────────────────────────┐
        │  ⚡ CONSOLIDATE REMAINING BACKORDER                     │
        │                                                        │
        │  New stock at Ahmedabad (+40) can cover the open 20.    │
        │  Merging saves  1 shipment  and  ₹560.                  │
        │                                                        │
        │            [ Consolidate ]    [ Keep separate ]         │
        └────────────────────────────────────────────────────────┘
```

The prompt appears **automatically** when stock increases against an open backorder
(PDF §4 B6). `Simulate Restock` in the warehouse screen is the deterministic demo trigger.

---

## 14. Hybrid Billing

One order, two billing streams, kept reconciled (PDF §4 B7).

```
                         ORDER  Q-1042
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
   ┌────────────────────────┐       ┌────────────────────────────┐
   │   ONE-TIME CHARGES     │       │    RECURRING CHARGES       │
   │   (brand purple)       │       │    (accent indigo)         │
   ├────────────────────────┤       ├────────────────────────────┤
   │ Laptop Pro 14  × 20    │       │ Support Plan   × 20        │
   │ Setup Service  × 20    │       │ cadence: monthly           │
   │                        │       │ ₹3,000 / cycle             │
   │ Total billed once      │       │ start 2026-03-01           │
   │        ₹ 18,40,000     │       │ next  2026-04-01           │
   └───────────┬────────────┘       └─────────────┬──────────────┘
               ▼                                  ▼
   ┌────────────────────────┐       ┌────────────────────────────┐
   │   INVOICE (B10)        │       │  BILLING SCHEDULE          │
   │   draft → sent →       │       │  Mar 01  ₹3,000  invoiced  │
   │   partially_paid →paid │       │  Apr 01  ₹3,000  scheduled │
   │                        │       │  May 01  ₹3,000  scheduled │
   │                        │       │  … 12 occurrences          │
   └────────────────────────┘       │  Annual contract ₹36,000   │
                                    └────────────────────────────┘

   ⓘ  The invoice screen carries a callout:
      "This invoice covers one-time charges. N recurring lines are billed
       on their own schedule."   → link to the billing screen
```

---

## 15. Proration, Cancellation & Credit Notes

### 15.1 Mid-cycle change — three configurable strategies

```
   Monthly plan ₹3,000 · 30-day cycle · customer adds +2 units on DAY 12

   ├─ daily_prorate ──────────────────────────────────────────────┐
   │    charge = unitPrice × qtyDelta × (daysRemaining/daysInCycle)│
   │    = ₹1,200 × 2 × 18/30  =  ₹1,440 charged NOW                │
   │    (negative result → credit note)                            │
   ├─ full_period ─────────────────────────────────────────────────┤
   │    ₹0 now. New quantity applies from the NEXT cycle.          │
   ├─ next_cycle_adjust ───────────────────────────────────────────┤
   │    ₹0 now. The ₹2,400 delta folds into the next occurrence.   │
   └───────────────────────────────────────────────────────────────┘

   Timeline
   Day 0 ─────────── Day 12 ─────────────────── Day 30
   │◄──── used 12 ────►│◄──── remaining 18 ────►│
                       ▲
                    change
```

> The preview is shown to the user **before** committing, in plain language *and*
> numbers: *"Day 12 of 30 · +2 units × ₹1,200 × 18/30 days = ₹1,440 charged now."*

### 15.2 Cancellation — three configurable rules

```
   Cancel on day 12 of a 30-day cycle · unused value ₹1,800

   ├─ refund_unused    → ₹1,800  PARTIAL REFUND  record created
   ├─ no_refund        → ₹0      service runs to end of paid cycle
   └─ credit_note_only → ₹1,800  CREDIT NOTE issued instead of cash

   In every case: all future 'scheduled' occurrences → 'cancelled'
```

Both refunds and credit notes land in a **ledger** on the billing screen:
id · date · related line · amount · reason · type.

---

## 16. Customer Portal Negotiation

A **real, separate, restricted view** (PDF §7 — hard requirement).

```
   ╔═══════════════════════════════════════════════════════════════╗
   ║  [logo]   Quotation Q-1042 for Acme Corp     ● Under Negotiation║
   ║                                            valid until Mar 30  ║
   ╠═══════════════════════════════════════════════════════════════╣
   ║  Laptop Pro 14        20 × ₹95,000    You save ₹2,28,000  💬  ║
   ║  Setup Service        20 × ₹20,000    You save ₹72,000    💬  ║
   ║  Support Plan   ↻ billed every month  20 × ₹3,000         💬  ║
   ║  ───────────────────────────────────────────────────────────  ║
   ║  Subtotal ₹23,00,000 · You save ₹3,00,000 · Tax ₹3,60,000     ║
   ║  TOTAL  ₹23,60,000                                            ║
   ╟───────────────────────────────────────────────────────────────╢
   ║  COUNTER DISCOUNT                                             ║
   ║  Current effective discount: 13.0 %                           ║
   ║  Discount you'd like:  [ 25 ] %                               ║
   ║  Justification: [                                    ]        ║
   ╟───────────────────────────────────────────────────────────────╢
   ║        [ Submit Request ]         [ Confirm Quotation ]       ║
   ╚═══════════════════════════════════════════════════════════════╝

   ┌─────────────── NEVER PRESENT IN THE RESPONSE ────────────────┐
   │  ✗ costPrice     ✗ marginAmount    ✗ risk score              │
   │  ✗ ceilingPct    ✗ internalNotes   ✗ approval details        │
   │  ✗ ownerId       ✗ other customers' data                     │
   │                                                              │
   │  Stripped SERVER-SIDE by toPortalView() before the response  │
   │  leaves the API. Hiding fields in the UI is NOT access control.│
   └──────────────────────────────────────────────────────────────┘
```

### Statuses the customer sees

`Sent` → `Under Negotiation` → `Pending Re-approval` → `Confirmed` (or `Expired`)

---

## 17. Automatic Re-Approval Loop

The single most important branch in the platform (PDF §4 B8, §28).

```
      Rep: "Send to Customer"  →  link to /portal/quotations/Q-1042 emailed
                                          │
                                          ▼
                          ╔═══════════════════════════════╗
                          ║   CUSTOMER OPENS PORTAL       ║
                          ╚═══════════════╤═══════════════╝
                       ┌──────────────────┴──────────────────┐
                       ▼                                     ▼
        ┌──────────────────────────────┐      ┌──────────────────────────┐
        │  SUBMIT REQUEST              │      │  CONFIRM QUOTATION       │
        │  comments + counter discount │      └────────────┬─────────────┘
        └──────────────┬───────────────┘                   │
                       ▼                                    ▼
        negotiationStatus = under_negotiation   ┌───────────────────────────┐
        notification → owning rep               │ RECOMPUTE BLENDED RISK    │
        audit entry (actor = customer)          │ on the FINAL agreed terms │
                       │                        └────────────┬──────────────┘
                       ▼                            ┌────────┴────────┐
        ┌──────────────────────────────┐            ▼                 ▼
        │ Rep sees "Customer Requests" │    within limits       EXCEEDS limits
        │ replies / applies discount   │            │                 │
        │ → risk recomputed → re-sends │            ▼                 ▼
        └──────────────┬───────────────┘   ┌──────────────┐  ┌──────────────────┐
                       │                   │ stage =      │  │ stage =          │
                       └──── loops ────────┤ confirmed    │  │ pending_approval │
                                           │              │  │ steps REBUILT +  │
                                           │ → /confirmed │  │ RESET            │
                                           └──────────────┘  │ audit: "Re-      │
                                                             │ approval trig-   │
                                                             │ gered by customer│
                                                             │ -negotiated      │
                                                             │ terms"           │
                                                             │                  │
                                                             │ customer sees    │
                                                             │ "Pending Re-     │
                                                             │  approval"       │
                                                             └────────┬─────────┘
                                                                      │
                                                    ┌─────────────────┘
                                                    ▼
                                    RE-ENTERS THE APPROVAL FLOW AT §9
                                    ⚠ AUTOMATIC — no rep action required
```

---

## 18. Invoice & Payment

```
   STATUS STEPPER
   ┌────────┐   ┌────────┐   ┌──────────────────┐   ┌────────┐
   │ Draft  │──▶│  Sent  │──▶│ Partially Paid   │──▶│  Paid  │
   └────────┘   └────────┘   └──────────────────┘   └────────┘
      ▓▓▓▓▓        ▓▓▓▓▓          ▒▒▒▒▒ amber            ░░░░░

   INVOICE  INV-2041   ·   Quote Q-1042   ·   Acme Corp
   ────────────────────────────────────────────────────────
   Laptop Pro 14   20 × ₹95,000  −12%   ₹16,72,000
   Setup Service   20 × ₹20,000  −18%   ₹ 3,28,000
   ────────────────────────────────────────────────────────
   Subtotal ₹20,00,000 · Tax ₹3,60,000 · TOTAL DUE ₹23,60,000
   Amount paid                             ₹10,00,000
   BALANCE REMAINING                       ₹13,60,000   ← red until 0

   ⓘ This invoice covers one-time charges. 1 recurring line is billed
     on its own schedule.  → View billing schedule

   RECORD PAYMENT
   amount [ 13,60,000 ]  method [ Bank transfer ▾ ]  ref [ TXN-8891 ]
                        [ Record Payment ]
                                 ↓
   amountPaid + balanceRemaining RECOMPUTED (derived, never stored)
   balance == 0  →  status = paid  →  quotation stage = confirmed
   overpayment   →  BLOCKED with an inline message
```

---

## 19. Deal Health & Anomaly Detection

Four detectors run on boot, on every quotation mutation, and on `Reload Data`.

```
 ┌──────────────────────┬────────────────────────────────────────────────────┐
 │ STALLED              │ now − lastActivityAt > stallThresholdDays          │
 │                      │ AND stage ∈ {draft, sent, under_negotiation,       │
 │                      │              pending_approval}                     │
 │                      │ severity: 1–2× low · 2–3× medium · 3×+ high        │
 │                      │ "Quotation inactive for 7 days → Stalled"          │
 ├──────────────────────┼────────────────────────────────────────────────────┤
 │ DISCOUNT ANOMALY     │ repAvg = mean discount % over that rep's last 90d   │
 │                      │ if quote.effectiveDiscount > repAvg × sensitivity   │
 │                      │ "22% discount vs this rep's 8.4% average (2.6×)"    │
 │                      │ ← computed from real history, never a fixed string  │
 ├──────────────────────┼────────────────────────────────────────────────────┤
 │ DELIVERY SLIPPAGE    │ backorder restock ETA > promisedDeliveryDate        │
 │                      │ "Promised Sep 10, expected Sep 14 → 4 days late"    │
 ├──────────────────────┼────────────────────────────────────────────────────┤
 │ APPROVAL BOTTLENECK  │ a pending approval step older than approvalSlaHours │
 │                      │ "Waiting on Finance for 3 days"                     │
 └──────────────────────┴────────────────────────────────────────────────────┘
                                    ▼
   ╔══════════════════ ALERT FEED · severity-sorted ══════════════════════╗
   ║ ● HIGH   Discount anomaly  Q-1044  Acme   22% vs 8.4% avg    2h  ⋯  ║
   ║ ● MED    Stalled 8 days    Q-1031  Beta   stage: draft       1d  ⋯  ║
   ║ ● MED    Delivery risk     Q-1061  Nova   ETA 7 days late    3h  ⋯  ║
   ║ ● LOW    Approval bottleneck Q-1052 Delta waiting Finance 3d  1d  ⋯  ║
   ║                                                                      ║
   ║              [ Open ]      [ Nudge Rep ]      [ Escalate ]           ║
   ╚══════════════════════════════════════════════════════════════════════╝
        │                │                 │
        │                │                 └─ notify manager + raise severity + audit
        │                └─ notify owning rep + audit + toast
        └─ navigate to the relevant screen (builder / approval / fulfillment)
```

Thresholds (`stallThresholdDays`, `anomalySensitivity`, `approvalSlaHours`) are
**configurable** and feed the real detection functions.

---

## 20. Reporting

```
   ┌──────────────────────── FILTER BAR (sticky) ────────────────────────┐
   │ Period [This month ▾] [from]–[to]   Rep [Priya ×][Rahul ×]          │
   │ Approval [Draft][Pending][Approved][Rejected]  Product/Category [▾] │
   │                                                    [ Clear filters ]│
   └─────────────────────────────────────────────────────────────────────┘

   KPI ROW
   ┌──────────┬──────────┬──────────┬──────────┬───────────┬───────────┐
   │ Quotes   │ Value    │ Win rate │ Avg disc │ Avg appr. │ Avg cycle │
   │   142    │ ₹8.2 Cr  │  38.4 %  │  11.2 %  │  6.4 hrs  │ 12.8 days │
   └──────────┴──────────┴──────────┴──────────┴───────────┴───────────┘

   CHARTS
   ├─ Quotation value by rep ........... horizontal bar
   ├─ Discount % distribution .......... histogram + tier-ceiling reference lines
   ├─ Approval funnel .................. Draft → Approved → Confirmed → Billed
   ├─ Revenue mix over time ............ stacked area: one-time vs recurring
   └─ Top products ..................... by value and by discount given

   EXPORT   [ PDF ]  [ XLS ]   ← operate on the CURRENTLY FILTERED set,
                                 not the whole dataset
```

| Filter (PDF §4 A7) | Purpose |
|---|---|
| **Period** | Quotations/orders in a date range (today, week, custom) |
| **Sales Team / Rep** | Analyze individual or team performance |
| **Approval Status** | Pending, approved, or rejected |
| **Product / Category** | Track best-selling or most-discounted items |

---

## 21. Audit Trail

Every meaningful action records **who, what, when, why**.

```
   ┌────────────────── AUDIT TRAIL · Q-1024 ───────────────────┐
   │ 10:32  Neel (sales_rep)   submitted quotation             │
   │        risk 1.26 · routed to Sales Manager                │
   │                                                            │
   │ 10:34  Anita (sales_manager)  approved step 1              │
   │        "Strategic account — service overage acceptable"    │
   │                                                            │
   │ 11:10  Acme Corp (customer)   requested 18% discount       │
   │                                                            │
   │ 11:10  SYSTEM                 reopened approval            │
   │        "Re-approval triggered by customer-negotiated terms"│
   └────────────────────────────────────────────────────────────┘
```

**Required by the PDF:** all approvals, rejections, and edits must be logged with
user, timestamp, and reason. The log is **append-only and read-only** in the UI.

---

## 22. Quotation Stage Machine

A single transition table is the source of truth. Buttons, Kanban drags, and portal
confirmations all pass through it.

```
                        ┌─────────┐
                        │  DRAFT  │◄──────────── returned for revision
                        └────┬────┘◄──────────── rep pulls back to edit
              ┌──────────────┼──────────────┐
   risk == 0  │   risk > 0   │              │ sent to customer
              ▼              ▼              ▼
      ┌────────────┐  ┌──────────────┐  ┌────────┐
      │  APPROVED  │  │   PENDING    │  │  SENT  │
      │            │  │   APPROVAL   │  └───┬────┘
      └──────┬─────┘  └───┬──────┬───┘      │
             │            │      │          ├── customer submits request
             │  all steps │      │ rejected ▼
             │  approved  │      │    ┌──────────────────┐
             │◄───────────┘      │    │ UNDER NEGOTIATION│
             │                   │    └────────┬─────────┘
             │                   ▼             │
             │              ┌────────┐         │ confirm:
             │              │  LOST  │◄────────┼─ within limits → CONFIRMED
             │              └────────┘  any    └─ exceeds       → PENDING_APPROVAL
             │                        (manual, reason required)
             ▼  split accepted / overridden
      ┌──────────────┐
      │ FULFILLMENT  │
      └──────┬───────┘
             ▼  invoice generated
      ┌──────────────┐
      │    BILLED    │
      └──────┬───────┘
             ▼  invoice fully paid
      ┌──────────────┐
      │  CONFIRMED   │
      └──────────────┘
```

| From | Allowed to | Condition |
|---|---|---|
| `draft` | `pending_approval` | risk requires approval |
| `draft` | `approved` | risk == 0 (auto-approve) |
| `draft` | `sent` | sent to customer |
| `sent` | `under_negotiation` | customer submits a request |
| `sent` | `confirmed` | customer confirms, risk within limits |
| `sent` | `pending_approval` | customer confirms, risk exceeded |
| `under_negotiation` | `draft` | rep pulls it back to edit |
| `under_negotiation` | `pending_approval` / `confirmed` | per confirm logic |
| `pending_approval` | `approved` | all steps approved |
| `pending_approval` | `draft` | returned for revision |
| `pending_approval` | `lost` | rejected |
| `approved` | `fulfillment` | split accepted or overridden |
| `fulfillment` | `billed` | invoice generated |
| `billed` | `confirmed` | invoice fully paid |
| *any* | `lost` | manual mark-lost with a reason |

An invalid Kanban drag **snaps back with a toast explaining exactly why**
("Can't move to Billed — this quote still needs Finance approval").

---

## 23. Complete End-to-End Flow

The full process described in PDF §5.

```
 1  INTERNAL USER LOGIN / SIGNUP
        ↓
 2  ADMIN CONFIGURATION
    products · price lists · discount rules · approval chains
    warehouses · stock · subscription plans · upsell rules
        ↓
 3  SALES REP OPENS WORKSPACE
        ↓
 4  CREATE QUOTATION FOR CUSTOMER          (tier auto-resolved)
        ↓
 5  ADD PRODUCTS   hardware · services · subscriptions
        ↓
 6  APPLY LINE + ORDER DISCOUNTS
        ↓
 7  LIVE MARGIN INDICATOR UPDATES          ← every keystroke
        ↓
 8  UPSELL / CROSS-SELL SUGGESTIONS        ← re-ranked on every cart change
        ↓
 9  SUBMIT QUOTATION
        ↓
10  BLENDED DISCOUNT RISK CHECK
        │
        ├──── within rules ─────────────────────────────┐
        │                                                │
        └──── exceeds rules                             │
                  ↓                                      │
             MANAGER APPROVAL                            │
                  ↓                                      │
             FINANCE APPROVAL (only if required)         │
                  ↓                                      │
             APPROVED ───────────────────────────────────┤
                                                          ↓
11  WAREHOUSE FULFILLMENT SUGGESTION       ← live stock
                                                          ↓
12  ACCEPT SPLIT  /  MANUAL OVERRIDE
                                                          ↓
13  CUSTOMER RECEIVES QUOTATION LINK       → PORTAL
                                                          ↓
14  CUSTOMER NEGOTIATES
        │
        ├── terms unchanged ──────────────┐
        │                                  │
        └── terms exceed limit             │
                  ↓                        │
             RE-APPROVAL (automatic)       │
                  ↓                        │
                  └────────────────────────┤
                                            ↓
15  CUSTOMER CONFIRMS
                                            ↓
16  ORDER PROCEEDS
                                            ↓
17  FULFILLMENT
                                            ↓
18  ONE-TIME INVOICE  +  RECURRING BILLING SCHEDULE
                                            ↓
19  PAYMENT RECORDED
                                            ↓
20  INVOICE STATUS UPDATED
                                            ↓
21  MANAGER MONITORS DEAL HEALTH
                                            ↓
22  REPORTING
```

### 23.1 The two required demo flows

The PDF asks for **at least two full flows end-to-end**.

```
   FLOW A — Discount Approval + Fulfillment
   ─────────────────────────────────────────
   Quotation → high discount → automatic routing → Manager approval
             → warehouse split → fulfillment

   FLOW B — Negotiation + Re-Approval + Billing
   ─────────────────────────────────────────────
   Customer portal → counter discount → automatic re-approval
             → customer confirms → one-time invoice + subscription schedule
             → payment
```

---

## 24. Quick Test Flow (PDF §9)

> *"Use this short walkthrough to check that the core logic actually works, not just
> the screens. Each step should produce a visible, correct result before moving to
> the next one."*

```
 ┌────┬────────────────────────────────────────────┬──────────────────────────────┐
 │ #  │ Step                                       │ Expected visible result      │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 1  │ Sign up / log in; set up a discount tier,   │ Config saved and editable    │
 │    │ a warehouse, and a subscription plan        │                              │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 2  │ Create a quotation; add a product line with │ Ceiling hint turns red       │
 │    │ a discount higher than normally allowed     │ immediately on that line     │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 3  │ Confirm the quotation AUTOMATICALLY asks    │ Primary button reads         │
 │    │ for manager approval — the rep never has    │ "Send for Manager Approval"  │
 │    │ to request it manually                      │ with no manual request step  │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 4  │ Accept one upsell suggestion while building │ Total AND margin update      │
 │    │                                            │ right away (animated)        │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 5  │ Get it approved; confirm stock is pulled    │ Split across TWO warehouses  │
 │    │ from the correct warehouse, splitting       │ because one cannot cover     │
 │    │ across two if needed                       │ the full quantity            │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 6  │ Check a one-time product and a recurring    │ Two separate sections, own   │
 │    │ subscription on the SAME order are billed   │ totals, 12-occurrence        │
 │    │ correctly and separately                   │ schedule for the recurring   │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 7  │ Open the customer portal; request a bigger  │ Quote goes back for approval │
 │    │ discount as the customer                   │ AUTOMATICALLY                │
 ├────┼────────────────────────────────────────────┼──────────────────────────────┤
 │ 8  │ Confirm the order, record a payment         │ Invoice status updates:      │
 │    │                                            │ partially_paid → paid        │
 └────┴────────────────────────────────────────────┴──────────────────────────────┘

   "If all eight steps work smoothly and each result matches what is expected,
    the core flow is solid."
```

---

## 25. Technical Guidelines & Deliverables

### 25.1 Guidelines (PDF §7)

```
 ✔ Any tech stack — any backend language, any frontend framework,
   any relational or document database. The focus is business logic,
   the data model, and the end-to-end workflow.

 ✔ Core business rules MUST be implemented in application logic —
   NOT hardcoded or faked for the demo:
        · approval routing
        · discount governance
        · warehouse splitting
        · billing proration

 ✔ The customer-facing negotiation screen MUST be a real, separate,
   restricted view — not another internal screen with a different label.

 ○ Multi-currency or multi-company support is a BONUS, not a requirement.
```

### 25.2 Deliverables (PDF §8)

| # | Deliverable |
|---|---|
| 1 | A working application (backend **plus** frontend) with sample seed data |
| 2 | A **five-minute live demo** covering at least **two full flows** end-to-end, from quotation to fulfillment or billing |
| 3 | A **one-page architecture diagram** showing the data model and how the major modules connect |
| 4 | A short note on **what the team would build next** with more time |

### 25.3 Why this problem matters (PDF §6)

```
   Real-world business workflow   complete B2B flow end-to-end
   Business logic focus           discount governance, multi-warehouse
                                  fulfillment, hybrid billing — not just UI
   Industry-ready thinking        role-based access, approval chains,
                                  inventory coordination, recurring billing,
                                  audit trails, deal analytics
   Technology agnostic            focus stays on design, data modeling,
                                  and workflow logic
```

---

## 26. Glossary

| Term | Meaning |
|---|---|
| **Product** | What the company sells |
| **Price List** | What price a given customer tier / currency gets |
| **Customer Tier** | Bronze / Silver / Gold classification |
| **Discount Ceiling** | Maximum discount allowed — by tier *and* by category, stricter wins |
| **Blended Risk Score** | Value-weighted average overage across all lines, in discount points |
| **Single-Line Trip** | One badly-over line that forces escalation regardless of the blend |
| **Approval Chain** | Ordered rules deciding who must approve a given risk score |
| **Margin** | Profit remaining after discount, versus internal cost |
| **Upsell / Cross-Sell** | Suggested additional products, ranked by co-purchase + promotion + margin |
| **Warehouse** | Where physical stock is stored |
| **Inventory** | How many units exist in each warehouse |
| **Fulfillment** | Where the order will actually ship from |
| **Warehouse Split** | Allocating one line across multiple warehouses |
| **Backorder** | Quantity not currently in stock |
| **Consolidation** | Merging an open backorder into fewer shipments after restock |
| **Subscription** | Recurring product or service plan |
| **Cadence** | Monthly / quarterly / yearly billing rhythm |
| **Proration** | Partial-cycle billing adjustment after a mid-cycle change |
| **Credit Note** | Non-cash credit issued instead of a refund |
| **Hybrid Billing** | One-time and recurring lines on the same order |
| **Customer Portal** | External restricted view for the customer |
| **Negotiation** | Customer requesting changes or countering a discount |
| **Re-Approval** | Automatic return to the approval flow after negotiated terms exceed limits |
| **Deal Health** | Detection of stuck, anomalous, or slipping deals |
| **Stalled Deal** | Quotation inactive beyond the configured threshold |
| **Discount Anomaly** | Discount well above a rep's historical average |
| **Delivery Slippage** | Expected fulfillment date later than the promised date |
| **Audit Trail** | Append-only history of who did what, when, and why |

---

## The simplest mental model

```
   ADMIN            sets the rules and business data
        ↓
   SALES REP        creates a deal
        ↓
   SYSTEM           checks whether the deal is safe          ← blended risk
        ↓
   MANAGER/FINANCE  approves risky terms                     ← auto-routed
        ↓
   SYSTEM           finds stock and builds the billing plan  ← split + schedule
        ↓
   CUSTOMER         negotiates and confirms                  ← portal
        ↓
   OPERATIONS       fulfills and bills
        ↓
   MANAGEMENT       monitors deal health and reports
```

> DealFlow360 should feel like a **self-governing deal engine**, not a CRUD sales app.
> The differentiators are: automatic discount governance · automatic approval routing ·
> blended risk · live margin · warehouse auto-split · hybrid billing ·
> customer negotiation · automatic re-approval · deal-health alerts.
