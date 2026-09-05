# DealFlow360

An intelligent, self-governing sales operations platform. Quote → approval → fulfillment → billing → payment, with discount governance, multi-warehouse splitting, hybrid billing and a real customer negotiation portal.

Frontend-only build: **React 18 + Vite, plain JavaScript, no backend.** All business logic runs client-side as genuine algorithms in `src/lib/`.

---

## Quick start

```bash
cd Frontend
npm install
npm run dev
```

Open http://localhost:5173 and pick any role card on the login screen.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint, zero-warning policy |
| `npm run format` | Prettier |

---

## Seeded logins

Any password works — there is no auth server. The role cards on the login screen are the fast path.

| Role | User | Email |
|---|---|---|
| Sales Rep | Priya Sharma | `priya.sharma@dealflow360.com` |
| Sales Rep | Rahul Mehta | `rahul.mehta@dealflow360.com` |
| Sales Rep | Kiran Nair | `kiran.nair@dealflow360.com` |
| Sales Manager | Anita Desai | `anita.desai@dealflow360.com` |
| Finance | Vikram Rao | `vikram.rao@dealflow360.com` |
| Admin | Neha Gupta | `neha.gupta@dealflow360.com` |

Once inside, use **Demo: switch role** in the user menu to walk an approval chain without logging out four times.

---

## The 8-step demo script

Everything below is pre-seeded and works click-by-click.

**1. Backend config** — Sign in as **Admin** → `Go to Back-end`. Confirm Gold tier is at 15%, Services cap at 10%, three warehouses exist, and five subscription plans cover all three proration rules. The **Risk sandbox** on the discount screen lets you test the scoring function live.

**2. Build a quotation** — Switch to **Sales Rep** → open **Q-1042 (Acme Corp)**. It already has `Laptop Pro 14 × 8 @ 12%` (fine) and `Onboarding Setup Service @ 18%` (over its 10% ceiling). The ceiling hint next to the service discount is red.

**3. Approval routes itself** — The primary button reads **"Send for Manager Approval"** with no manual request step. Click it.

**4. Accept an upsell** — Before submitting (or after a return), open the **Suggestions** panel and add the promoted *Thunderbolt Docking Station*. Total, margin and risk score all animate-update immediately.

**5. Approve, then split** — Switch to **Sales Manager** → the approval screen shows a per-line breakdown with the Service line 8 points over. Approve. The **Fulfillment** screen auto-suggests a split across **two warehouses** (Main has 6 laptops, East has 4) because no single warehouse can cover 8.

**6. Hybrid billing** — Accept the split → **Billing**. One-time hardware and recurring subscription lines sit in separate, differently-bordered sections with their own totals and a 12-occurrence schedule.

**7. Customer negotiation** — Open **Q-1035 (Cygnus Retail)** and click `Preview` — or go to `/portal/cygnus1035counter`. As the customer, submit a counter-discount of 25% and confirm. Because Bronze caps at 5%, the quote **automatically re-enters approval** with the audit reason "Re-approval triggered by customer-negotiated terms". No rep action required.

**8. Invoice and payment** — Approve again → **Invoice** → `Send Invoice` → `Record Payment`. Pay part of the balance to see **Partially Paid**, then the remainder to reach **Paid** — which moves the order to **Confirmed**. Check **Deal Health** and **Reports** now reflect the closed deal.

### Other things worth showing

- **Deal Health dashboard** — four live alert types on seed data: a stalled deal (11 days idle), a discount anomaly (20.2% from a rep averaging 9.2%), an approval bottleneck (4 days waiting), and delivery slippage from an open backorder.
- **Auto-approve path** — Q-1033 has every line inside its ceiling, so it went straight through with an empty approval chain.
- **Backorder consolidation** — Open Q-1032 (12 laptops, only 10 in the network) → `Simulate Restock`. A consolidation prompt appears with the shipment and cost saving.
- **Kanban guards** — On the Pipeline board, drag a Draft card to Billed. It snaps back with a toast explaining why.

---

## Architecture

```
src/data/seed/*.js      static seed data
        ↓ buildInitialState()
src/store/useAppStore.js  Zustand store — this IS the backend
        ↓ actions call
src/lib/*.js            real business logic (pure functions, no React)
        ↓ results back into store
components read via src/store/selectors.js
```

**Three isolated layout shells.** `MarketingLayout` (public), `WorkspaceLayout` (internal), and `PortalLayout` — which imports nothing from the workspace. That isolation is the mechanism behind the requirement that the customer negotiation view be a genuinely separate restricted view.

**Derived, never stored.** Totals, margins, risk scores, approval requirements and invoice balances are always recomputed from primitives. Nothing is cached onto the quotation, so a badge can never disagree with the table beside it.

**Every mutation goes through a store action**, and every action that changes business state writes an audit entry with actor, timestamp and reason.

### Business logic (`src/lib/`)

| File | Responsibility |
|---|---|
| `riskEngine.js` | Blended discount risk score, approval routing |
| `pricing.js` | Line and order rollups, tier pricing, margin impact |
| `warehouseSplit.js` | Multi-warehouse allocation, override validation, consolidation |
| `billingEngine.js` | Billing schedules, proration, cancellation, invoices, payments |
| `upsellEngine.js` | Suggestion ranking with margin floors |
| `anomalyEngine.js` | Four alert types, per-rep discount baselines |
| `stageMachine.js` | Stage transition table and `canTransition` guard |
| `portalView.js` | Allow-list projection for the customer portal |
| `exporters.js` | PDF and XLS export (lazily imported) |

---

## The blended discount risk score

Every line is checked against **its own ceiling** — the stricter of its product category's limit and the customer tier's limit — not one blanket order-level number.

Worked example (Gold customer, tier allows 15%):

| Line | Category | Value | Given | Allowed | Over by |
|---|---|---|---|---|---|
| Laptop Pro 14 | Hardware | ₹88,000 | 12% | 15% | — |
| Setup Service | Service | ₹16,400 | 18% | **10%** | **+8.0** |

Weighted overage = `8 × 16,400 = 131,200`. Order value = `104,400`. **Blended score = 1.26 points.**

Two independent triggers:

- **Blended score** is the value-weighted average overage across the order. This catches the case where many lines are each only 2–3 points over — individually unremarkable, collectively a real margin give-away.
- **Single-line trip** force-escalates when any one line is badly over, even if the blend looks mild. When several rules match, whichever demands **more** approvers wins — routing never goes down.

The interactive version of this is on the landing page and in the backend risk sandbox, both using the production `computeBlendedRisk` function.

---

## Data persistence

State lives in `sessionStorage` under the key `dealflow360`, so a mid-demo refresh doesn't lose progress. Closing the tab clears it. **Reset demo data** in the user menu wipes and re-seeds from source.

Derived caches (fulfillment plans, billing schedules, alerts) are rebuilt on boot rather than persisted, which keeps backorder ETAs and stall counters accurate relative to today.

---

## Deployment

Static SPA — no server runtime. Both platforms need the rewrite rule so deep links like `/portal/:token` don't 404 on a cold open.

**Vercel** — `vercel.json` is included. Set root directory to `Frontend`, build `npm run build`, output `dist`.

**Netlify** — `netlify.toml` is included. Base `Frontend`, build `npm run build`, publish `dist`.

---

## Adding a real backend

The seam is deliberately narrow:

1. `src/lib/*` is dependency-free JavaScript — move it to the server and it runs on Node as-is.
2. Replace each store action body with an HTTP call, keeping the action names and signatures identical.
3. Components need **zero** changes; they only ever talk to the store.
4. Re-apply `toPortalView()` **server-side**. It already defines exactly what a customer may see.

### Security note on the portal

In this frontend-only build, portal field-filtering is presentation scoping, not access control — the whole store is readable in devtools. Before exposing this publicly:

- Portal tokens must be single-quotation-scoped, expiring, and rate-limited server-side.
- Cost price, margin and other customers' data must be filtered on the server, not just excluded in the UI.

---

## What we'd build next

- Real backend with the `src/lib/` functions moved server-side unchanged.
- Multi-company support and live FX rather than a maintained USD price book.
- Approval delegation and out-of-office routing so a single absent approver can't stall the pipeline.
- Co-purchase scores learned from actual order history instead of configured by hand.
- Contract lifecycle: renewals, uplift schedules and churn signals on the deal health dashboard.
- E-signature on portal confirmation.
