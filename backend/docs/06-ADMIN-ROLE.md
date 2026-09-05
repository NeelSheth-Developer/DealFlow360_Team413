# DealFlow360 — The Admin Role

> Everything an Admin sets up, as one tree, in depth.
>
> **Source marking throughout:**
> 📕 = quoted from `DealFlow360.pdf` · 📘 = from the structure doc ·
> 🔧 = our implementation choice, not in either
>
> Companion documents: [`01-PROJECT-OVERVIEW.md`](./01-PROJECT-OVERVIEW.md) ·
> [`02-API-REFERENCE.md`](./02-API-REFERENCE.md) · [`03-AUTH-API.md`](./03-AUTH-API.md) ·
> [`04-ROLES-API.md`](./04-ROLES-API.md) · [`05-CUSTOMERS-API.md`](./05-CUSTOMERS-API.md)

---

## Contents

| § | Section |
|---|---|
| 1 | [Admin in one line](#1-admin-in-one-line) |
| 2 | [The complete tree](#2-the-complete-tree) |
| 3 | [A2 · Catalog](#3-a2--catalog) |
| 4 | [A3 · Discount governance](#4-a3--discount-governance) ⭐ |
| 5 | [A4 · Warehouses & inventory](#5-a4--warehouses--inventory) |
| 6 | [A5 · Subscription plans](#6-a5--subscription-plans) |
| 7 | [A6 · Upsell rules](#7-a6--upsell-rules) |
| 8 | [A7 · Reporting](#8-a7--reporting) |
| 9 | [Users & roles](#9-users--roles) |
| 10 | [What Admin cannot do](#10-what-admin-cannot-do) |
| 11 | [Source table](#11-source-table) |

---

## 1. Admin in one line

> **Admin writes the rules. Everyone else works inside them.**

📕 *"Manages backend setup: products, price lists, discount tiers, warehouses,
subscription plans"*
📕 *"Views platform wide analytics and reporting"*

Admin never touches a deal — no quotations, no approvals, no negotiations. They
configure the system once, and it enforces those rules on every deal afterwards
without anyone deciding case by case.

```
        ADMIN                          EVERYONE ELSE
   ─────────────────              ────────────────────────
   sets the rules       ────►     works inside them
   never sees a deal              never changes the rules
```

---

## 2. The complete tree

```
ADMIN
│
├── 📊 DASHBOARD & REPORTING ................................. A7
│   ├── Platform-wide analytics (every rep, every team)
│   ├── Filters
│   │   ├── Period ............... today · week · custom range
│   │   ├── Sales Team / Rep ..... individual or team
│   │   ├── Approval Status ...... pending · approved · rejected
│   │   └── Product / Category ... best selling · most discounted
│   └── Export ................... PDF · XLS
│
├── 📦 CATALOG ............................................... A2
│   ├── Products
│   │   ├── Name
│   │   ├── Category ............. hardware · service · subscription
│   │   ├── Price (base)
│   │   ├── Cost price ........... 🔧 needed for the margin indicator
│   │   ├── Unit ................. piece · hour · licence
│   │   ├── Tax %
│   │   ├── Description
│   │   └── Active / archived
│   │
│   ├── Variants ................. one product, several versions
│   │   ├── Attribute ............ "Size", "Pack", "RAM"
│   │   ├── Value ................ "16GB", "32GB", "64GB"
│   │   └── Extra price .......... +₹0 · +₹12,000 · +₹28,000
│   │
│   └── Price Lists .............. what each tier pays
│       ├── by customer tier ..... bronze · silver · gold
│       └── by currency .......... INR · USD
│
├── ⚖️  DISCOUNT GOVERNANCE ................................... A3  ⭐
│   ├── Tier ceilings ............ how much a CUSTOMER TYPE may get
│   │   ├── bronze ............... 5%
│   │   ├── silver ............... 10%
│   │   └── gold ................. 15%
│   │
│   ├── Category ceilings ........ how much a PRODUCT TYPE may take
│   │   ├── hardware ............. 15%   "healthy margins"
│   │   └── service .............. 10%   "thin margins"
│   │
│   └── Approval chain ........... who signs off on what
│       ├── low risk ............. nobody, auto-approve
│       ├── medium ............... Sales Manager
│       └── high ................. Sales Manager → Finance
│
├── 🏭 WAREHOUSES & INVENTORY ................................ A4
│   ├── Warehouses
│   │   ├── Name ................. "Main Warehouse", "East Depot"
│   │   ├── Location
│   │   └── Shipping cost weight . the auto-split dial
│   │
│   ├── Stock .................... per warehouse, per product
│   │
│   └── Replenishment rules
│       ├── Threshold ............ reorder below this
│       ├── Quantity ............. how many to add
│       └── Lead days ............ drives the backorder ETA
│
├── 🔁 SUBSCRIPTION PLANS .................................... A5
│   ├── Name
│   ├── Cadence .................. monthly · quarterly · yearly
│   ├── Attached products ........ "products OR services"
│   ├── Proration rule ........... what a mid-cycle change costs
│   └── Cancellation rule ........ refund · credit note · nothing
│
├── 🎯 UPSELL RULES ................................. A6 (optional)
│   ├── Trigger product .......... "if this is in the cart…"
│   ├── Suggested product ........ "…suggest this"
│   ├── Co-purchase score ........ from historical data
│   ├── Promoted flag ............ push it harder right now
│   └── Minimum margin ........... never suggest below this  ⭐
│
└── 👥 USERS & ROLES ......................................... 🔧
    ├── View the staff list
    ├── Promote / demote ......... sales_rep · sales_manager · finance
    └── Deactivate ............... blocks login immediately
```

---

## 3. A2 · Catalog

📕 *"General Info: Name, Category, Price, Unit, Tax, Product Description ·
Variants: Attribute (example: Size or Pack), Values, Extra prices ·
Price Lists: Customer tier based pricing, currency specific rules"*

### 3.1 Products

```
Laptop Pro 14
├── name          Laptop Pro 14
├── category      hardware          ← decides its discount ceiling
├── basePrice     ₹95,000
├── costPrice     ₹68,000           🔧 internal, NEVER leaves the API
├── unit          piece
├── taxPct        18
├── description   14-inch business laptop
└── active        true              archived products stay on old quotes
```

**On `costPrice`** 🔧 — the PDF's field list does not include it. But §13 requires a
live margin indicator, and margin is impossible without cost. The PDF resolves this
itself: *"internal cost can be entered as business configuration."* So it is a
necessity, not an invention. It must never reach the customer portal.

### 3.2 Categories — a field, not a thing Admin creates

This is the part people get wrong. 📕 mentions "category" only three times:

```
1. as a FIELD on a product ......... "Name, Category, Price, Unit, Tax"
2. as something with a CEILING ..... "category specific discount ceilings"
3. as a filter in the builder ...... "pick products across categories"
```

**"Categories" is not in Admin's setup list.** Admin does not create categories —
they set the **ceiling** for each one, which lives under *discount tiers* (§4).

```
❌  Admin creates a "Consulting" category
✅  Admin sets  service = 10%
```

🔧 A category with no ceiling would be silently unbounded — a discount hole nobody
set. That is why the list is fixed rather than user-editable.

### 3.3 Variants

One product, several versions — not three products.

```
Laptop Pro 14        base ₹95,000
   ├── RAM  16GB      +₹0
   ├── RAM  32GB      +₹12,000
   └── RAM  64GB      +₹28,000
```

The extra is added **on top of the tier price**:

```
Gold price       ₹87,400
+ 32GB variant   ₹12,000
──────────────────────────
resolved         ₹99,400
```

### 3.4 Price lists

Same product, one price per tier:

| Tier | Price | Off base |
|---|---|---|
| bronze | ₹95,000 | 0% |
| silver | ₹91,200 | ≈4% |
| gold | ₹87,400 | ≈8% |

**What this achieves:** the rep never types a price. They pick a product and the
customer's tier resolves it automatically.

> **Price list ≠ discount.** A Gold customer gets a better *starting price* **and**
> more *discount headroom*. Two separate mechanisms, both set by Admin.

---

## 4. A3 · Discount governance

The most consequential thing Admin configures. Three parts.

### 4.1 Tier ceilings — by customer type

📕 *"Define discount ceilings per customer tier (example: **Bronze up to 5 percent,
Silver up to 10 percent, Gold up to 15 percent**)"*

```
bronze    5%
silver   10%
gold     15%
```

### 4.2 Category ceilings — by product type

📕 *"Define **category specific** discount ceilings (some product categories allow
higher discretion than others)"*

📕 names two, in its worked example:

```
hardware  15%    "since they have healthy margins"
service   10%    "since they have thin margins"
```

🔧 Any further category needs a ceiling chosen by you.

### 4.3 The stricter one binds

```
tier says      15%  ─┐
                     ├──►  MIN  ──►  the real limit on that line
category says  10%  ─┘
```

### 4.4 Approval chain

📕 *"Configure approval chain: which discount range needs **Sales Manager only**, and
which range needs **Sales Manager followed by Finance**"*

```
low risk    →  nobody, auto-approve
medium      →  Sales Manager
high        →  Sales Manager, THEN Finance
```

🔧 The PDF gives the three-level *shape* but no numeric boundaries. Ours are
`0` / `0–5` / `>5`.

### 4.5 What Admin's settings produce — 📕's own example

```
Admin sets:   Gold 15%   ·   hardware 15%   ·   service 10%

Rep builds:   Laptop         hardware   12% given
              Setup Service  service    18% given

Each line vs ITS OWN ceiling:
   Laptop         12  vs  15   ✅
   Setup Service  18  vs  10   🔴  8 points over

→ whole quotation flagged → routed to Sales Manager
```

📕 *"Even though the customer is Gold and 15 percent sounds fine on paper, the Service
line broke its own stricter limit. So the whole quotation gets flagged for approval,
because of that one line."*

**Admin produced that outcome without seeing the deal.** Set service to 20% and the
same quote sails through untouched.

### 4.6 And the rule that ties it together

📕 *"When a quote mixes categories with different ceilings, the system must compute a
**blended risk score** and route to the **highest required level**"*

📕 *"All approvals, rejections, and edits must be **logged with user, timestamp, and
reason**"*

---

## 5. A4 · Warehouses & inventory

📕 *"Create and manage warehouses (example: **"Main Warehouse", "East Depot"**) ·
Configure **stock levels and replenishment rules** per warehouse · Define **shipping
cost weighting** used by the auto split logic to **minimize number of shipments**"*

```
Main Warehouse
├── location              Mumbai
├── shipping weight       1.0        ← lower = preferred
├── stock
│   ├── Laptop Pro 14     6
│   └── Docking Station   14
└── replenishment
    ├── threshold         5          reorder below this
    ├── quantity          40         how many to add
    └── lead days         7          → the backorder ETA
```

### Product vs inventory — different things

```
PRODUCT     "what do we sell?"       →  Laptop Pro 14 exists, once
INVENTORY   "how many, and where?"   →  Mumbai 6 · Kolkata 4 · Pune 0
```

That separation is what lets one order split across two warehouses.

### The shipping weight is the interesting dial

It tells the splitter which warehouse to prefer when several could serve a line.
📕 is explicit that the objective is **minimising shipment count**, not merely finding
stock.

```
20 laptops needed, nobody has 20
        ↓
Mumbai 6 (weight 1.0) + Kolkata 4 (weight 1.4)
        ↓
10 shipped in 2 shipments · 10 backordered, ETA +7 days
```

---

## 6. A5 · Subscription plans

📕 *"Define recurring plans (**monthly, quarterly, yearly**) that can be attached to
specific **products or services** · Configure **proration rules** for mid cycle
quantity or plan changes · Configure **cancellation and partial refund** rules"*

```
PLAN  "Monthly Standard"
├── cadence          monthly
├── attached to      Cloud Standard · Security Add-on · Analytics Module
├── proration        what a mid-cycle qty change costs
└── cancellation     refund unused · credit note · nothing
```

### A plan is not a category

```
CATEGORY                    PLAN
a field on the product      a separate object
sets the DISCOUNT CEILING   sets HOW IT BILLS
one word                    cadence + proration + cancellation
one per product             one plan → many products
```

📕 says plans attach to *"products **or services**"* — so a service can recur. A
monthly support retainer is `category: service` **with a plan on it**.

```
❌  isRecurring = (category === "subscription")
✅  isRecurring = (the line has a plan attached)
```

### Proration — 📕's own example

📕 *"Monthly plan ₹3,000/month. Customer upgrades halfway through month. System should
charge only the appropriate partial amount for the remainder of the cycle."*

```
Day 0 ─────────── Day 15 ─────────── Day 30
│◄── already paid ──►│◄─ 15 days left ─►│
                     ▲  customer adds 2 seats

charge now = 2 × ₹3,000 × (15 ÷ 30) = ₹3,000
```

### Cancellation

📕 *"If a subscription is cancelled, reduced, or changed and a refund is applicable,
system should trigger: **Partial Refund or Credit Note**"*

```
Cancels on day 12 of 30 → 18 unused days, worth ₹1,800

refund unused     →  ₹1,800 returned
credit note only  →  ₹1,800 as credit          ← cash stays in the business
no refund         →  ₹0, runs to the cycle end
```

---

## 7. A6 · Upsell rules

📕 marks this **"Optional"** — but it is one of the demo checkpoints.

📕 *"Define product pairings based on **historical co purchase data** · Mark products
as currently **promoted** so they rank higher in suggestions · Set **minimum margin
thresholds** so only healthy margin suggestions surface"*

```
RULE
├── trigger product      Laptop Pro 14      "if this is in the cart…"
├── suggested product    Docking Station    "…suggest this"
├── co-purchase score    82                 from history
├── promoted             yes                push it this quarter
└── minimum margin       20%                never suggest below  ⭐
```

### Why each setting exists

```
CO-PURCHASE SCORE    what actually sells together — grounded in data,
                     not someone's guess

PROMOTED             what the business wants pushed NOW — overstock,
                     a launch, a supplier deal. Temporary.

MINIMUM MARGIN  ⭐   the guard rail. Without it the engine pushes cheap
                     low-profit items to inflate deal size — the rep looks
                     good, the company is poorer.
```

### What the rep sees

📕 *"Ranked suggestion list … Displays: **Suggested product · Margin delta if added ·
Promotion tag**"*

```
┌───────────────────────────────────────────────┐
│ Docking Station                    [PROMOTED] │
│ "Frequently bought with Laptop Pro 14"        │
│ Margin delta   +₹4,200                        │
│        [ Add to Quote ]    [ Dismiss ]        │
└───────────────────────────────────────────────┘
```

📕 *"After adding a suggestion, the margin indicator on the quotation **updates
immediately**."*

---

## 8. A7 · Reporting

📕 *"Dashboard plus reporting menu for sales performance · Export options: **PDF /
XLS**"*

Filters 📕 names explicitly:

```
Period ............ today · week · custom range
Sales Team / Rep .. analyse individual or team performance
Approval Status ... pending · approved · rejected
Product / Category  best selling · most discounted
```

Admin is the only role that sees **everything** — every rep, every team, every deal.

---

## 9. Users & roles

🔧 Not in 📕's Admin list, but implied: someone has to make the first Sales Manager.

```
ADMIN can
├── view the staff list and who holds which role
├── promote / demote ...... sales_rep · sales_manager · finance
└── deactivate ............ blocks login on the very next request
```

**Admin cannot grant `admin`.** Every signup produces a `sales_rep`, and the
assignable-role list excludes `admin`. The first one comes only from
`npm run seed:admin`, run from the backend by someone with database access.

Two self-targeting guards: an admin may rename themselves, but not change their own
role or deactivate themselves — both are one-way doors that need a second admin to
undo. See [`04-ROLES-API.md`](./04-ROLES-API.md).

---

## 10. What Admin cannot do

```
❌  build a quotation ............. Sales Rep
❌  approve a discount ............ Sales Manager / Finance
❌  decide a warehouse split ...... Finance / Operations
❌  talk to a customer ............ Sales Rep, via the portal
❌  create a customer ............. customers register themselves
❌  create a category ............. fixed list; Admin sets the ceilings
❌  grant themselves admin ........ seed script only
```

**Admin has no role inside a deal — deliberately.** If Admin approved things case by
case, the rules would be negotiable and the system would stop being self-governing.

### And who approves Admin?

**Nobody.**

```
Rep gives a discount      →  needs approval
Manager approves it       →  logged with a reason
Admin changes a ceiling   →  no approval, only an audit entry
```

Admin moving `service` from 10% to 20% would quietly double what every future service
line may take. The controls on that are:

1. **Very few admins** — the role cannot be self-assigned
2. **Every change is audited** — who, when, old value, new value
3. **Not retroactive** — existing approvals stand; only future scoring changes

That is a genuine trust boundary: the system governs *deals* automatically, but it
trusts whoever holds `admin`. Which is exactly why that role is hard to obtain.

---

## 11. Source table

What is quoted, and what is ours.

| Setting | Value | Source |
|---|---|---|
| Roles — all five named | Rep · Manager · Finance · Customer · Admin | 📕 |
| Admin's setup list | products, price lists, discount tiers, warehouses, subscription plans | 📕 |
| Tier ceilings | bronze 5 · silver 10 · gold 15 | 📕 *(called an "example")* |
| Category ceiling — hardware | 15% | 📕 |
| Category ceiling — service | 10% | 📕 |
| Category ceiling — subscription | 12% | 🔧 **ours** |
| Category `accessories` and its 20% | — | 🔧 **ours** — the word never appears in 📕 |
| Approval chain shape | three levels: none → Manager → Manager+Finance | 📕 |
| Approval band numbers | `0` / `0–5` / `>5` | 🔧 **ours** |
| Product fields | Name, Category, Price, Unit, Tax, Description | 📕 |
| `costPrice` | — | 🔧 required by the margin indicator; 📕 permits it as "business configuration" |
| Variants | Attribute, Values, Extra prices | 📕 |
| Warehouse names | "Main Warehouse", "East Depot" | 📕 |
| Shipping cost weighting | minimise shipment count | 📕 |
| Plan cadences | monthly, quarterly, yearly | 📕 |
| Proration / cancellation are configurable | yes | 📕 |
| The three specific proration strategies | daily_prorate · full_period · next_cycle_adjust | 🔧 **ours** |
| Upsell: pairings, promoted, margin floor | all three | 📕 |
| Reporting filters and PDF/XLS export | all named | 📕 |
| Users & roles management | — | 🔧 **ours** |

---

## The way to remember it

> **Admin is the rule-writer, not the referee.**

They decide *"a service line may never exceed 10%"*.

They do **not** decide *"this particular 18% is acceptable"* — that is the Manager's
call, and the system only asks the Manager because Admin's rule flagged it.

That separation is what the project title means by **self-governing**: the rules are
set once, then enforced by the system on every deal, without anyone deciding case by
case.
