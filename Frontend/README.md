# DealFlow360

An intelligent, self-governing sales operations platform. Quote → approval → fulfillment → billing → payment, with discount governance, multi-warehouse splitting, hybrid billing and a real customer negotiation area.

React 18 + Vite, plain JavaScript. Discount risk scoring is **server-authoritative**; everything else runs on local seed data until a backend is wired in.

---

## Quick start

```bash
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, zero-warning policy |
| `npm run format` | Prettier |

---

## Two separate identity spaces

Staff and customers are completely distinct: different routes, different sign-up forms, different sessions. Signing into one clears the other, so nobody can hold both at once.

| | Staff | Customer |
|---|---|---|
| Sign in | `/login` | `/customer/login` |
| Sign up | `/signup` | `/customer/signup` |
| Home | `/app/dashboard` | `/customer/quotations` |
| Layout | `WorkspaceLayout` | `CustomerLayout` |
| Guard | `RequireStaffAuth` | `RequireCustomerAuth` |

`CustomerLayout` and everything under `src/pages/customer/` import nothing from the workspace. That isolation is what makes the customer area a genuinely separate restricted surface rather than an internal screen with different labels.

### Nobody can create accounts for anyone else

Accounts exist **only** through self-registration. Not even an Admin can provision a user — there is no `createUser` action in the store, and `/app/backend/directory` is read-only. This keeps every account traceable to a person who consented to it and removes the whole class of privilege-escalation bugs that comes with admin-provisioned users.

The one exception is a customer's **pricing tier**, which is commercial configuration rather than account data. It is never self-selected at signup — new customers start at Bronze, and only a Sales Manager or Admin can promote them, because tier decides the price list and the discount ceiling every line is measured against.

### Seeded logins

Password for every demo account: `demo1234`

**Staff** — `priya.sharma@` (Sales Rep) · `rahul.mehta@` (Sales Rep) · `kiran.nair@` (Sales Rep) · `anita.desai@` (Sales Manager) · `vikram.rao@` (Finance) · `neha.gupta@` (Admin), all `@dealflow360.com`. The login screen also has one-click role cards.

**Customers** — `arjun.bose@cygnusretail.example` (has a live negotiation), `sundar.iyer@acmecorp.example`, `meera.kapoor@betaind.example`, and others.

**Unclaimed customers** — Forge Analytics and Gemini Healthcare exist commercially but have no login yet. Register at `/customer/signup` with `ritu.malhotra@forgeanalytics.example` to demonstrate the *claim your existing account* path: the signup attaches to the existing record instead of creating a duplicate, and their quotation history is immediately visible.

---

## Risk scoring is fetched, not computed

The UI never decides a discount risk score or an approval route. It asks a service and renders the answer.

```
component → useRisk(quoteId) → riskSlice.refreshRisk()
                                    ↓
                        services/riskService.js
                                    ↓
              VITE_API_BASE_URL set?  ──yes──→  POST /risk/score
                                    │
                                    └──no───→  local fallback mirror
```

`src/lib/riskEngine.js` still contains the algorithm, but purely as a **fallback mirror** so the app stays demoable with no API configured. Whenever `VITE_API_BASE_URL` is set, the server's answer is what renders. If the scoring service errors mid-session the UI falls back and labels the number *provisional* rather than blocking the rep.

Scores are cached in `riskCache`, keyed by a fingerprint of the scoring inputs, so a stale answer refetches automatically when a line or a ceiling changes. Lists and boards use one batched request (`/risk/score-batch`) rather than one per row. Actions that must not act on a stale number — submitting for approval, customer confirmation — call `ensureRisk()` and await a fresh score first.

### To point it at your backend

```bash
cp .env.example .env
# then set VITE_API_BASE_URL=https://your-api.example.com/api
```

Expected contract:

```
POST /risk/score
  { quotationId, tier, tierCeiling, categoryCeilings, orderDiscountPct,
    lines: [{ id, productId, productName, category, qty, unitPrice, discountPct }] }
→ { score, worstSingleOverage, violationCount, totalValue, weightedOverage,
    lineBreakdown: [...], approvers: ['sales_manager','finance'], ruleId, label }

POST /risk/score-batch
  { quotations: [ ...same payload... ] }
→ { results: [ { quotationId, ...same response... } ] }
```

`approvers` is optional. Return it and the frontend trusts your routing; omit it and it resolves the route from the configured approval chain.

### The formula

Every line is checked against **its own ceiling** — the stricter of its product category's limit and the customer tier's limit — then overages are weighted by **gross line value**:

```
score = Σ (line value × points over ceiling) ÷ Σ line value
```

A ₹1,000 line inside its ceiling and a ₹2,000 line 8 points over:

```
(1000 × 0 + 2000 × 8) ÷ (1000 + 2000) = 16,000 ÷ 3,000 = 5.33 points
```

Two independent triggers:

- **Blended score** catches many lines each only 2–3 points over. Individually unremarkable, collectively a real margin give-away.
- **Single-line trip** force-escalates one badly-over line even when the blend looks mild. When several rules match, whichever demands *more* approvers wins — routing never goes down.

The interactive version is on the landing page and in the backend risk sandbox.

---

## Who can do what

| Action | Sales Rep | Sales Manager | Finance | Admin |
|---|:---:|:---:|:---:|:---:|
| Build quotations, apply discounts | ● | ● | | ● |
| Assign a quotation to a customer | ● | ● | | ● |
| Reassign the owning rep | | ● | | ● |
| Approve at the manager step | | ● | | ● |
| Approve at the finance step | | | ● | ● |
| Accept / override warehouse split | ● | ● | ● | ● |
| **Issue an invoice** | | | ● | ● |
| **Record a payment** | | | ● | ● |
| Promote a customer's tier | | ● | | ● |
| Backend configuration | | ● | ● | ● |
| Create an account for someone else | — | — | — | — |

Payments are deliberately restricted: whoever sold the deal is not the person who confirms the cash arrived. A rep viewing an invoice sees the balance and a clear explanation of why the form is locked, not a dead button. Every payment records who confirmed it, and the invoice must be issued before a payment can be logged against it.

---

## Demo script

**1. Backend config** — Sign in as **Admin** → `Go to Back-end`. Gold tier caps at 15%, Services at 10%, three warehouses, five subscription plans. The **Risk sandbox** on the discount screen exercises the live scoring path.

**2. Build a quotation** — Switch to **Sales Rep** → open **Q-1042 (Acme Corp)**: `Laptop Pro 14 × 8 @ 12%` (fine) and `Onboarding Setup Service @ 18%` (over its 10% ceiling). The ceiling hint turns red.

**3. Approval routes itself** — The primary button reads **"Send for Manager Approval"**, decided by the fetched score, with no manual request step.

**4. Accept an upsell** — Open **Suggestions** and add the promoted docking station. Total, margin and risk update immediately.

**5. Approve, then split** — Switch to **Sales Manager** → per-line breakdown shows the service line 8 points over → Approve → **Fulfillment** auto-suggests a split across two warehouses (Main has 6 laptops, East has 4).

**6. Hybrid billing** — Accept the split → **Billing**. One-time and recurring lines in separate sections with their own totals and a 12-occurrence schedule.

**7. Customer negotiation** — Open a new tab, go to `/customer/login`, sign in as `arjun.bose@cygnusretail.example` / `demo1234`. Open the quotation, submit a **25% counter-discount** and confirm. Because Bronze caps at 5%, the final terms are re-scored and it **automatically re-enters approval** with the audit reason "Re-approval triggered by customer-negotiated terms".

**8. Invoice and payment** — Back in the staff tab, approve. As a **Sales Rep** open **Invoice** — the payment form is locked with an explanation. Switch to **Finance** → `Send Invoice` → `Record Payment`. Pay part to reach **Partially Paid**, then the rest to reach **Paid**, which moves the order to **Confirmed**.

### Also worth showing

- **Deal Health** — four live alert types on seed data: stalled deal (11 days idle), discount anomaly (~20% from a rep averaging ~9%), approval bottleneck (4 days waiting), delivery slippage from an open backorder.
- **Auto-approve** — Q-1033 has every line inside its ceiling, so its approval chain is empty.
- **Backorder consolidation** — Q-1032 (12 laptops, 10 in network) → `Simulate Restock` → consolidation prompt with the shipment and cost saving.
- **Kanban guards** — drag a Draft card to Billed; it snaps back with a toast explaining why.
- **Claim-account path** — register at `/customer/signup` as `ritu.malhotra@forgeanalytics.example`.

---

## Architecture

```
src/data/seed/*.js         static seed data
        ↓ buildInitialState()
src/store/useAppStore.js   Zustand store, composed from slices
        ↓ actions call
src/lib/*.js               pure business logic, no React
src/services/*.js          backend-facing services (risk scoring today)
        ↓ results back into store
components read via src/store/selectors.js
```

**Derived, never stored.** Totals, margins, approval requirements and invoice balances are recomputed from primitives. Risk scores live in `riskCache` because they belong to the server. Nothing is cached onto the quotation, so a badge can never disagree with the table beside it.

**Every mutation goes through a store action**, and every action that changes business state writes an audit entry with actor, timestamp and reason.

| Module | Responsibility |
|---|---|
| `services/apiClient.js` | HTTP client, auth token, timeouts |
| `services/riskService.js` | Server-authoritative scoring + fallback mirror |
| `lib/riskEngine.js` | The algorithm (fallback only) and approval routing |
| `lib/pricing.js` | Line and order rollups, tier pricing, margin impact |
| `lib/warehouseSplit.js` | Allocation, override validation, consolidation |
| `lib/billingEngine.js` | Schedules, proration, cancellation, invoices, payments |
| `lib/upsellEngine.js` | Suggestion ranking with margin floors |
| `lib/anomalyEngine.js` | Four alert types, per-rep discount baselines |
| `lib/stageMachine.js` | Transition table and `canTransition` guard |
| `lib/customerView.js` | Allow-list projection for the customer area |

---

## Data persistence

State lives in `sessionStorage` under `dealflow360`. Risk scores are deliberately **not** persisted — they are the server's answer and get refetched on boot. **Reset demo data** in the user menu wipes and re-seeds.

---

## Deployment

Static SPA, no server runtime. `vercel.json` and `netlify.toml` are included; both carry the SPA rewrite so deep links like `/customer/quotations/Q-1042` don't 404 on a cold open.

- **Vercel** — root directory `Frontend`, build `npm run build`, output `dist`.
- **Netlify** — base `Frontend`, build `npm run build`, publish `dist`.

Set `VITE_API_BASE_URL` in the platform's environment variables to enable server-side scoring.

---

## Security notes before going live

This build has no server, so a few things are demo-shaped and must change:

- **Passwords are plain text in seed data and compared client-side.** Move authentication server-side with hashed credentials and real sessions.
- **Customer field-filtering is presentation scoping, not access control.** `toCustomerView()` defines exactly what a customer may see — re-apply it server-side, because the whole store is readable in devtools.
- **Role checks are client-side.** `canRecordPayments()` and friends must be enforced by the API too; a client check only shapes the UI.

---

## What we'd build next

- Move `src/lib/*` server-side (dependency-free JS, runs on Node as-is) behind the same service interfaces.
- Real authentication with hashed passwords, email verification and password reset.
- Approval delegation and out-of-office routing so one absent approver can't stall the pipeline.
- Co-purchase scores learned from order history instead of configured by hand.
- Multi-company support and live FX rather than a maintained USD price book.
- Contract lifecycle: renewals, uplift schedules, churn signals on the deal health dashboard.
- E-signature on customer confirmation.
