# DealFlow360 — Frontend-Only Build Specification (JavaScript / React)

> Self-Governing Sales Operations Platform. This document is a **complete, self-contained build spec** for a frontend-only React application using **plain JavaScript (no TypeScript)** and **local dummy data (no backend, no API calls)**. Hand this whole file to an AI code generator and it should produce a deployable app in one pass.

---

## 0. Ground Rules (read first — these override anything else)

1. **No backend. At all.** There is no server, no REST API, no database, no `fetch`, no `axios`. Every piece of data lives in the browser: seeded from static JS files, held in a Zustand store, mutated in place. State survives a page refresh via `sessionStorage` (§3.1) and is wiped by the `Reset demo data` button or by closing the tab. Nothing is ever sent anywhere.
2. **JavaScript only.** `.jsx` for components, `.js` for logic/data/utilities. **No `.ts`, no `.tsx`, no `tsconfig.json`, no type annotations, no interfaces, no generics.** Use JSDoc comments where a shape needs documenting.
3. **All business logic runs client-side in real code.** This is critical for the hackathon judging criteria: discount risk scoring, approval routing, warehouse split allocation, subscription proration, invoice/payment math — all of it must be genuine implemented algorithms in `src/lib/`, not hardcoded fake values or `if (demo) return 42`. The absence of a backend does not mean the absence of logic; it means the logic lives in the frontend instead of a server.
4. **Every mutation goes through the store.** Components never mutate arrays directly. They dispatch store actions (`store.approveQuotation(id, ...)`), which run the real business logic and update state. This keeps the app behaving like a real system and makes it trivial to swap in a backend later (replace store action bodies with HTTP calls, keep component code untouched).
5. **Zero build errors is a hard requirement.** Follow §11 exactly. The app must survive `npm run lint` and `npm run build` cleanly and deploy to Vercel/Netlify with no config surprises.

---

## 1. Tech Stack (JavaScript, frontend-only)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React 18 + Vite** (JavaScript template: `--template react`) | Pure SPA, static `dist/` output, deploys anywhere |
| Language | **JavaScript (ESM)** — `.jsx` / `.js` | No TypeScript anywhere |
| Routing | **react-router-dom v6** | Nested layouts for marketing / workspace / portal shells |
| Styling | **Tailwind CSS v3** + custom tokens in `tailwind.config.js` | Enforces the purple glassmorphism theme consistently |
| UI Primitives | **Radix UI primitives** (`@radix-ui/react-*`) styled by us, OR hand-rolled accessible components | shadcn/ui CLI defaults to TS — if used, convert output to `.jsx` and strip types. Simpler path: hand-roll the ~12 primitives we need (Button, Card, Input, Select, Dialog, Tabs, Badge, Table, Tooltip, Switch, Slider, DropdownMenu) in `components/ui/` as plain JSX |
| Icons | **lucide-react** | |
| Animation | **framer-motion** | Route transitions, panel slides, live-value pulse animations |
| Charts | **recharts** | Dashboards and reporting |
| Drag & Drop | **@dnd-kit/core** + **@dnd-kit/sortable** | Kanban pipeline board |
| State | **zustand** (single app store, with slices) | The entire "backend" lives here |
| Forms | **react-hook-form** (validation via plain resolver functions, no Zod needed) | Zod is TS-flavored; plain validate functions keep it JS-simple |
| Tables | **@tanstack/react-table** v8 | Works fine in plain JS |
| PDF export | **jspdf** + **jspdf-autotable** | Reports and invoice PDF |
| XLS export | **xlsx** (SheetJS) | Report exports |
| Dates | **date-fns** | Billing schedules, period filters, proration math |
| Toasts | **sonner** | Approval events, anomaly alerts, blocked actions |
| Utility | **clsx** + **tailwind-merge** (as a `cn()` helper) | Conditional classnames |
| Lint/Format | **ESLint** (react, react-hooks, jsx-a11y) + **Prettier** | See §11 |
| Deploy | **Vercel** or **Netlify**, static SPA with rewrite rules | See §11 |

Package manager: **npm** (most compatible with hackathon judges' machines and both deploy platforms).

### 1.1 Exact dependency list

```
Dependencies:
react react-dom react-router-dom zustand framer-motion recharts
lucide-react @dnd-kit/core @dnd-kit/sortable @tanstack/react-table
react-hook-form date-fns sonner clsx tailwind-merge
jspdf jspdf-autotable xlsx
@radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-select
@radix-ui/react-tooltip @radix-ui/react-dropdown-menu @radix-ui/react-switch
@radix-ui/react-slider @radix-ui/react-progress @radix-ui/react-popover

DevDependencies:
vite @vitejs/plugin-react tailwindcss postcss autoprefixer
eslint eslint-plugin-react eslint-plugin-react-hooks eslint-plugin-react-refresh
eslint-plugin-jsx-a11y prettier prettier-plugin-tailwindcss
```

---

## 2. Design System — "Violet Glass"

### 2.1 Direction
Light, airy background with layered **purple gradient glassmorphism**. Frosted translucent panels floating over soft animated gradient blobs. Applied everywhere: landing page, all dashboards, quotation builder, and the customer portal.

### 2.2 Color tokens (`tailwind.config.js` → `theme.extend.colors`)

```js
colors: {
  brand: {
    50:'#f5f3ff', 100:'#ede9fe', 200:'#ddd6fe', 300:'#c4b5fd', 400:'#a78bfa',
    500:'#8b5cf6', 600:'#7c3aed', 700:'#6d28d9', 800:'#5b21b6', 900:'#4c1d95',
  },
  accent: { pink:'#ec4899', indigo:'#6366f1', teal:'#14b8a6', amber:'#f59e0b' },
  ink:    { DEFAULT:'#1e1033', soft:'#4b3b6b', muted:'#7c6f93' },
  surface:{ base:'#faf9ff', raised:'#ffffff' },
  state:  { success:'#22c55e', warning:'#f59e0b', danger:'#ef4444', info:'#3b82f6' },
}
```

Body text uses `ink.DEFAULT` (`#1e1033`) — a deep purple-black. This is what keeps text readable (AA contrast) on top of translucent glass panels, which is the usual failure mode of glassmorphism designs.

### 2.3 Gradients & background blobs

In `src/styles/globals.css`:

```css
:root {
  --grad-hero: linear-gradient(135deg, #ede9fe 0%, #f5f3ff 45%, #ffe4f3 100%);
  --grad-brand: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  --grad-cta: linear-gradient(135deg, #7c3aed 0%, #ec4899 100%);
  --grad-risk-low: linear-gradient(90deg, #22c55e, #14b8a6);
  --grad-risk-mid: linear-gradient(90deg, #f59e0b, #ec4899);
  --grad-risk-high: linear-gradient(90deg, #ef4444, #7c3aed);
}

body { background: var(--grad-hero); background-attachment: fixed; color: #1e1033; }

.blob { position: absolute; border-radius: 9999px; filter: blur(72px); opacity: .45;
        pointer-events: none; z-index: 0; animation: blobFloat 18s ease-in-out infinite; }
.blob--violet { background: #a78bfa; }
.blob--pink   { background: #f9a8d4; animation-delay: -6s; }
.blob--indigo { background: #818cf8; animation-delay: -12s; }

@keyframes blobFloat {
  0%,100% { transform: translate(0,0) scale(1); }
  33%     { transform: translate(30px,-40px) scale(1.12); }
  66%     { transform: translate(-25px,25px) scale(.94); }
}
@media (prefers-reduced-motion: reduce) { .blob { animation: none; } }
```

A `<GradientBlobBackground />` component renders 3 absolutely-positioned blobs and is dropped into every layout shell behind the content (`z-0`, content at `z-10`).

### 2.4 Glass utilities (`globals.css`, applied via `@layer components`)

```css
@layer components {
  .glass {
    background: rgba(255,255,255,.55);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    border: 1px solid rgba(139,92,246,.16);
    box-shadow: 0 8px 32px rgba(124,58,237,.08);
    border-radius: 1.25rem;
  }
  .glass-strong {
    background: rgba(255,255,255,.75);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(139,92,246,.25);
    box-shadow: 0 12px 40px rgba(124,58,237,.14);
    border-radius: 1.25rem;
  }
  .glass-nav {
    background: rgba(255,255,255,.7);
    backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid rgba(139,92,246,.14);
  }
  .glass-hover { transition: transform .2s ease, box-shadow .2s ease; }
  .glass-hover:hover { transform: translateY(-3px); box-shadow: 0 16px 48px rgba(124,58,237,.16); }
  .btn-gradient { background: var(--grad-brand); color:#fff; }
  .btn-gradient:hover { background: var(--grad-cta); }
}
```

Used on: top nav, sidebar, every card (quotation cards, KPI cards, upsell suggestion cards, warehouse cards), modals, filter bars, the portal shell, and the landing page sections.

### 2.5 Typography
- **Inter** via Google Fonts `<link>` in `index.html` with `display=swap`.
- Headings `font-semibold`/`font-bold`, `tracking-tight`.
- All money/percentage values use `tabular-nums` so columns align in tables.

### 2.6 Motion conventions
- Route change: fade + 8px y-translate, 200ms.
- Live value change (margin %, order total, risk score after adding an upsell): brief scale pulse (1 → 1.06 → 1) with a color flash — green when margin improves, amber/red when risk rises. Implement as a `<PulseOnChange value={x}>` wrapper component using framer-motion `key`-based re-animation.
- Kanban drag: card lifts (scale 1.03 + stronger shadow).
- Modals/drawers: spring slide-in via `AnimatePresence`.
- Respect `prefers-reduced-motion` throughout.

### 2.7 Accessibility
- Everything keyboard-reachable; Radix primitives handle focus trapping in dialogs.
- Status never conveyed by color alone — always paired with an icon and text label.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`.
- All icon-only buttons get `aria-label`.
- Charts get a `<figcaption>`-style text summary or accessible table fallback.

---

## 3. Application Architecture

### 3.1 The "fake backend" — how data works with no server

```
src/data/seed/*.js         → static seed arrays (products, customers, warehouses, ...)
        ↓ loaded once on app boot
src/store/useAppStore.js   → single zustand store, holds ALL app state
        ↓ actions call into
src/lib/*.js               → the real business logic (pure functions, fully unit-testable)
        ↓ results written back into store
components read via selectors → UI re-renders instantly
```

Key rules for the store:
- One store file (`useAppStore.js`) composed from slice creator functions in `src/store/slices/` (authSlice, catalogSlice, quotationSlice, fulfillmentSlice, billingSlice, configSlice, auditSlice, notificationSlice) so no single file becomes unmanageable.
- Every action that changes business state **also writes an audit log entry** (§4.11 requirement: all approvals, rejections, and edits must be logged with user, timestamp, reason).
- IDs generated by a `nextId(prefix)` helper (`crypto.randomUUID()` or a simple counter) — never array indexes.
- **Persistence (do implement this):** wrap the store with zustand's `persist` middleware writing to `sessionStorage` under the key `dealflow360`, so a mid-demo page refresh doesn't wipe your progress. Include a **`Reset demo data`** button in the user menu that clears the key and re-seeds from `src/data/`. Use a `version` field in the persist config so changing the seed shape doesn't rehydrate stale data.
- Because there's no network, add a tiny artificial delay helper (`await sleep(350)`) on "server-ish" actions (submit for approval, accept split, record payment) so loading states are visible and the UI feels real rather than instantaneous. Keep it small.

### 3.2 Route map

```
/                                  → Landing page (public)
/login                             → Internal user login (role picker)
/signup                            → Internal user signup
/portal/login                      → Customer portal login (separate)

/app                               → WorkspaceLayout (internal, guarded)
  /app/dashboard                   → Deal Health & Anomaly Dashboard (B9)
  /app/pipeline                    → Kanban pipeline (B2)
  /app/quotations                  → Quotation list (B2)
  /app/quotations/new              → Create quotation (customer + tier select)
  /app/quotations/:id              → Quotation Builder (B3)
  /app/quotations/:id/approval     → Discount Approval (B4)
  /app/quotations/:id/fulfillment  → Warehouse Split (B6)
  /app/quotations/:id/billing      → Subscription & Billing (B7)
  /app/quotations/:id/invoice      → Invoice & Payment (B10)
  /app/reports                     → Reporting dashboard (A7)

/app/backend                       → BackendLayout (nested in workspace, role-gated)
  /app/backend/products            → Products & price lists (A2)
  /app/backend/discount-tiers      → Discount tiers, category ceilings, approval chain (A3)
  /app/backend/warehouses          → Warehouses & stock (A4)
  /app/backend/subscriptions       → Recurring plans (A5)
  /app/backend/upsell-rules        → Upsell / cross-sell rules (A6)
  /app/backend/users               → Users & roles
  /app/backend/audit-log           → Full audit trail

/portal/:token                     → PortalLayout → Customer negotiation (B8)
/portal/:token/confirmed           → Customer confirmation result

/403  /404
```

### 3.3 Layout shells — three, deliberately isolated

1. **`MarketingLayout`** — landing, login, signup. No auth.
2. **`WorkspaceLayout`** — internal shell. Glass top nav with `Quotations`, `Pipeline`, `Dashboard`, `Reports` links, plus right-side actions `Reload Data`, `Go to Back-end`, `Close Workspace`, and the user menu. `/app/backend/*` renders a nested `BackendLayout` that adds a left sidebar.
3. **`PortalLayout`** — customer-facing. **Must not import `WorkspaceLayout`, the internal nav, the internal sidebar, or any internal-only component.** Minimal chrome: customer-branded header (logo + quote reference + status pill), content, simple footer. This is a hard requirement from the problem statement ("must be a real, separate, restricted view, not just another internal screen with a different label").

### 3.4 Guards (plain JS components)

- `<RequireAuth>` — reads `currentUser` from store; if null → `<Navigate to="/login" />`.
- `<RequireRole allow={['admin','sales_manager']}>` — else → `/403`.
- `<RequirePortalToken>` — looks up the quotation by `portalToken` param in the store; if not found or expired → renders an "invalid or expired link" glass card. **Independent of internal auth**: a logged-out visitor with a valid token can use the portal, and a logged-in rep visiting a portal URL sees only the customer view.
- Role visibility: the approval action panel in B4 only renders `Approve/Reject/Return` controls when `currentUser.role` matches the role of the currently-pending approval step. A sales rep viewing their own quote's approval screen sees read-only status.

### 3.5 Demo role switcher (important for a single-laptop demo)

Since there's no real auth server, the login page presents **role cards** — Sales Rep, Sales Manager, Finance, Admin — each seeded with a named user. Additionally, put a **role switcher in the user menu** so during the live demo you can jump from Rep → Manager → Finance to walk the approval chain without logging out four times. Flag it visually as "Demo: switch role" so judges know it's intentional, not a security hole.

---

## 4. Screen-by-Screen Specification

### 4.0 Landing page (`/`)
Public marketing page for the platform itself. Full-width sections over the blob background.

1. **Nav** — glass sticky bar: logo `DealFlow360`, anchor links (Features, How it works, Risk Engine, Dashboard), buttons `Customer Portal` (ghost) and `Sign in` (gradient).
2. **Hero** — big headline "The Self-Governing Sales Engine", subhead about discount governance / multi-warehouse fulfillment / hybrid billing, CTAs `Start Free` + `Watch the flow`. Right side: floating glass mock of a quotation card with a live-animating risk gauge (purely decorative animation loop).
3. **Stat strip** — 4 glass stat tiles (e.g. "62% fewer manual approvals", "3.2× upsell attach rate", "2 warehouses auto-split", "0 email threads") with count-up animation on scroll into view.
4. **Feature grid** — 6 glass cards with lucide icons, hover-lift: Multi-Tier Discount Governance, Live Upsell & Cross-Sell, Multi-Warehouse Fulfillment, Hybrid One-Time + Recurring Billing, Deal Health & Anomaly Alerts, Customer Portal Negotiation.
5. **How it works** — horizontal 6-step stepper (Quote → Approve → Fulfill → Bill → Negotiate → Report), each step a glass pill with icon, connected by a gradient line, animating in sequence on scroll.
6. **Risk Engine explainer** — the standout section. Renders the Gold-customer example as an **actual interactive mini-widget**: two lines (Laptop, hardware, 12% given / 15% allowed → OK; Setup Service, service, 18% given / 10% allowed → 8 pts over), with sliders the visitor can drag to watch the blended score and required approval level change live. Uses the same `computeBlendedRisk` function as the real app.
7. **Dashboard preview** — large glass panel screenshot-style mock of the Deal Health dashboard with real recharts charts fed by seed data.
8. **Roles band** — 5 small cards, one per persona (Rep, Manager, Finance, Customer, Admin) with a one-line "what you do here".
9. **CTA band** — gradient panel, `Get started` + `Open customer portal demo`.
10. **Footer** — columns of links, plus explicit `Sales team login` / `Customer portal login` shortcuts.

### 4.1 Auth screens
- `/login` — centered glass card on gradient. Email + password inputs (any value works; validation is cosmetic), **plus four role quick-pick cards** below ("Continue as Sales Rep" etc.) which is the actual fast path. On submit: set `currentUser` in store, navigate to `/app/dashboard`.
- `/signup` — name, email, password, role select, company. Creates a user in store, logs them in.
- `/portal/login` — visually distinct (simpler, no internal nav). Email field → `Send magic link` → shows a glass "check your inbox" state listing the seeded demo portal links as clickable buttons (since no email can actually be sent). Also a `Have a link? Paste it` input. This keeps the flow honest and demoable.

### 4.2 A2 — Products & Price Lists (`/app/backend/products`)
- Toolbar: search, category filter, `New Product` (gradient).
- Table (TanStack Table): Name, Category badge, Base Price, Unit, Tax %, Cost, Margin %, Variants count, Status toggle, row actions (edit / duplicate / archive).
- **Product editor** (Dialog, 3 tabs):
  - *General*: name, category select (Hardware / Service / Subscription), base price, cost price, unit, tax %, description textarea. Margin % is computed and displayed live as you type price/cost — feeds the upsell engine.
  - *Variants*: repeatable rows — attribute (e.g. Size, Pack), value, extra price. Add/remove row buttons.
  - *Price Lists*: grid where rows = customer tiers (Bronze/Silver/Gold) × currency, cells = tier-specific price, with a computed "% off base" hint per cell.
- Validation: name required, price ≥ 0, cost ≤ price (warn, not block), tax 0–100.

### 4.3 A3 — Discount Tiers & Approval Chain (`/app/backend/discount-tiers`)
Three stacked glass panels:
1. **Customer tier ceilings** — table: Tier (Bronze/Silver/Gold), Max Discount %, editable inline with a stepper. Seed: Bronze 5, Silver 10, Gold 15.
2. **Category ceilings** — table: Category (Hardware / Service / Subscription / Accessories), Max Discount %. Seed: Hardware 15, Service 10, Subscription 12, Accessories 20. Copy note explaining these are *stricter per-line limits* that override the tier's headline number.
3. **Approval chain builder** — ordered list of rules, each row = risk-score range + required approvers. Seed:
   - score 0 → auto-approve (no approver)
   - score > 0 and ≤ 5 → Sales Manager
   - score > 5 → Sales Manager, then Finance
   Editable min/max and approver chips, drag to reorder, `Add rule`. Validate ranges don't overlap or leave gaps (show inline warning if they do).
4. **Risk sandbox** (glass panel, right column or below) — add mock lines (category select + line value + discount %), see the computed per-line overage table, the blended score gauge, and the resolved approval path, all live. Uses the production `computeBlendedRisk`. This doubles as a QA tool and a demo talking point.
- Every save writes an audit entry.

### 4.4 A4 — Warehouses & Fulfillment (`/app/backend/warehouses`)
- Warehouse cards grid (glass, hover-lift): name, location, total SKUs, total units, shipping cost weight badge, low-stock warning count, Edit / Manage stock buttons.
- **Warehouse editor** (Dialog): name, location/address, shipping cost weight (slider 0.5–3.0, with helper text "higher weight = system prefers shipping from cheaper warehouses"), replenishment threshold, replenishment quantity.
- **Manage stock** (Dialog): table of product × on-hand qty, editable, with low-stock highlighting against the threshold, plus a `Simulate Restock` action (adds the replenishment qty) — this is the trigger that makes the B6 backorder-consolidation prompt appear in a live demo.
- Seed 3 warehouses: Main Warehouse (high stock, weight 1.0), East Depot (partial stock, weight 1.4), West Hub (thin stock, weight 1.8) — deliberately arranged so a mid-size order **must** split across two warehouses. This is required by Quick Test Flow step 5.

### 4.5 A5 — Subscription Plans (`/app/backend/subscriptions`)
- Table: Plan name, Cadence (Monthly / Quarterly / Yearly), Attached products, Proration rule, Cancellation rule, Status.
- **Plan editor** (Dialog): name, cadence select, billing day-of-cycle, attached products multi-select, **proration strategy** select (`daily_prorate` — charge/credit by unused days; `full_period` — no proration, next cycle only; `next_cycle_adjust` — defer the delta), **cancellation rule** select (`refund_unused` / `no_refund` / `credit_note_only`), minimum commitment months, trial days.
- Small explainer card next to the proration selector showing a worked example for the selected strategy (e.g. "Qty +2 on day 10 of a 30-day monthly cycle → charge 20/30 of 2 units now"). Uses the real proration function.

### 4.6 A6 — Upsell / Cross-Sell Rules (`/app/backend/upsell-rules`)
- Table: Trigger product, Suggested product, Co-purchase strength (0–100 bar), Promoted toggle, Min margin % threshold, Status, actions.
- `New rule` Dialog: trigger product select, suggested product select, co-purchase score slider, promoted switch, min margin input.
- **Suggestion previewer** panel: pick a product (or a few, simulating a cart), see the exact ranked suggestion list the builder would show, with the score breakdown (co-purchase weight + promotion boost + margin filter) displayed per row so the ranking isn't a black box.

### 4.7 A7 — Reporting Dashboard (`/app/reports`)
- **Sticky glass filter bar**: Period (presets Today / This week / This month / Custom range + date pickers), Sales team / Rep multi-select, Approval status chips (Draft, Pending, Approved, Rejected), Product / Category searchable select, `Clear filters`.
- **KPI row** (glass tiles, animated count-up): Total quotations, Total value, Win rate %, Avg discount %, Avg approval turnaround (hrs), Avg deal cycle (days).
- **Charts** (recharts, each in a glass card with a title and an accessible summary line):
  - Quotation value by rep — horizontal bar
  - Discount % distribution — histogram, with the tier ceilings drawn as reference lines
  - Approval funnel — Draft → Pending → Approved → Confirmed → Billed stage counts
  - Revenue mix over time — stacked area (one-time vs recurring)
  - Top products by value and by discount given — sortable table with a bar-in-cell visual
- **Export**: `Export PDF` (jspdf + autotable — includes active filter summary in the header) and `Export XLS` (xlsx — raw filtered rows). Both operate on the *currently filtered* dataset, not the whole seed.

### 4.8 B1 — Workspace top menu
Glass sticky nav present on all `/app/*` routes:
- Left: `DealFlow360` logo (→ `/app/dashboard`), nav links `Quotations`, `Pipeline`, `Dashboard`, `Reports` with active-state gradient underline.
- Right: `Reload Data` (re-runs derived recomputations — recomputes every quotation's risk score, refreshes stock-derived fulfillment suggestions, recalculates anomaly alerts — with a spinner and a success toast; genuinely useful after editing backend config), `Go to Back-end` (→ `/app/backend`, hidden for `sales_rep`), `Close Workspace` (clears the active workspace context and returns to `/`, with a confirm dialog), notification bell with unread count (approval requests, negotiation replies, anomaly alerts), user avatar menu (name + role, **Switch role (demo)**, Reset demo data, Sign out).

### 4.9 B2 — Quotation list & pipeline
Shared header with a **List / Kanban** segmented toggle, search, filters (stage, rep, tier), and `New Quotation` (gradient).
- **List view** — TanStack Table: Quote #, Customer, Tier badge, Lines count, Total, Discount %, Risk score chip (green/amber/red), Stage badge, Owner, Last activity (relative time, red when stale beyond the configured threshold), row click → builder.
- **Kanban view** — dnd-kit columns: `Draft`, `Pending Approval`, `Approved`, `Fulfillment`, `Billed`, `Confirmed`, `Lost`. Cards show customer, total, tier chip, risk dot, days-in-stage, and a small avatar. Column headers show count + summed value.
- **Drag rules** (enforced by `canTransition()` in `src/lib/stageMachine.js`, §7.2): valid moves apply and log an audit entry; invalid moves snap back with a toast explaining exactly why ("Can't move to Billed — this quote still needs Finance approval").

### 4.10 B3 — Quotation Builder (`/app/quotations/:id`)
The core screen. Three-column layout on desktop (collapses to stacked tabs on mobile):

**Left — catalog picker (glass panel)**
- Category tabs: All / Hardware / Services / Subscriptions, plus search.
- Product cards: name, category chip, tier price (auto-resolved from the customer's tier price list), stock-availability dot (green = in stock across warehouses, amber = partial, red = backorder), margin % chip, `Add` button. Subscription products additionally show a plan cadence selector before adding.

**Center — order lines (glass panel)**
- Header: customer name, tier badge, quote #, stage badge, created date.
- Lines table, one row per line: product name + category chip, qty stepper (`−` / input / `+`), unit price (editable), discount % input, **ceiling hint** next to it (e.g. "max 10%") which turns red with a warning icon the instant the entered value exceeds the category ceiling, line total, margin contribution, delete button.
- Subscription lines are visually distinguished (left border in `accent.indigo` + a recurring icon + cadence label).
- Below the table: order-level discount % input (applied on top of line discounts, and included in the risk calculation), internal notes textarea, customer-visible terms textarea.

**Right — live summary rail (glass-strong, sticky)**
- Subtotal, total line discounts, order discount, tax, **Grand total** (large).
- **Live margin %** with a progress bar and `<PulseOnChange>` animation — green above target, amber below.
- **Blended risk gauge** — semicircular gauge, 0 → 15+, color-graded, with the numeric score and a label (`Auto-approve` / `Manager approval` / `Manager + Finance`). Recomputes on every keystroke (debounced 200ms).
- **Over-limit lines callout** — lists each violating line with "X% given vs Y% allowed, Z pts over". This is the transparency that makes the risk engine believable.
- **Primary action button, dynamically labeled** — this is a key demo moment, so make it obvious:
  - risk = 0 → `Confirm & Continue to Fulfillment` (gradient)
  - manager only → `Send for Manager Approval` (amber gradient) + subtext "1 approver required"
  - manager + finance → `Send for Manager + Finance Approval` (red-violet gradient) + subtext "2 approvers required"
- Secondary: `Save Draft`, `Preview as Customer` (opens the portal view in a new tab using the quote's portal token), `Send to Customer` (marks `sent`, generates/reveals the portal link with a copy button).
- Tab strip under the header linking to Upsell (inline panel toggle), Fulfillment (B6, disabled until approved), Billing (B7, enabled when subscription lines exist), Invoice (B10, enabled once confirmed) — disabled tabs show a tooltip explaining the prerequisite.

### 4.11 B4 — Discount Approval (`/app/quotations/:id/approval`)
- **Header**: quote #, customer + tier, total, requested-by rep, requested-at, current stage.
- **Risk breakdown panel** (the centerpiece): large blended score + verdict label, and a table with columns Line | Category | Line value | Discount given | Ceiling allowed | Over by | Value-weighted contribution. Over-limit rows tinted red with a warning icon; compliant rows show a green check. Footer row shows the weighted sum → final score, so the number is fully auditable by eye. Mirrors the Laptop / Setup Service example from the problem statement exactly.
- **Approval stepper** (shared `<StepProgress />`): `Submitted` → `Sales Manager` → `Finance` (rendered only when required, otherwise shown as a greyed `Not required` chip) → `Approved`. Each step shows status icon, reviewer name, timestamp, and reason if any.
- **Action panel** — only rendered when `currentUser.role` matches the pending step's role: `Approve` (green), `Return for Revision` (amber), `Reject` (red). Reject and Return require a reason (textarea, min 10 chars, enforced). Approve accepts an optional comment. On approve: advance to the next step, or if it was the last, set stage → `approved` and toast "Approved — fulfillment split ready".
- **Audit trail** — chronological, immutable list at the bottom: actor avatar, role, action, timestamp, reason. Read-only.
- If the rep views it: same screen, action panel replaced by a "Waiting on Sales Manager" status card.

### 4.12 B5 — Upsell & Cross-Sell panel
Slide-in glass panel on the right of the builder (toggled by a `Suggestions (n)` button that pulses when new suggestions appear after a cart change).
- Ranked suggestion cards: product name, category chip, reason line ("Frequently bought with Laptop Pro 14"), **margin delta** (`+₹X,XXX` / `+X.X% margin`, green), revenue delta, `Promoted` badge (gradient) when applicable, co-purchase strength mini-bar.
- Buttons per card: `Add to Quote` (primary) and `Dismiss` (ghost).
- On `Add to Quote`: the line is inserted into the cart, the panel re-ranks, and the summary rail's total + margin + risk all animate-update immediately. The problem statement calls this out as an explicit demo checkpoint, so make the animation visible and satisfying.
- Dismissed cards collapse into a `Dismissed (n)` expander at the bottom with an `Undo` per row (non-destructive).
- Empty state: "No suggestions above the margin threshold for this cart" — with a link to A6 rules.

### 4.13 B6 — Fulfillment & Warehouse Split (`/app/quotations/:id/fulfillment`)
- **Suggested split panel**: per-line breakdown table — Line | Qty ordered | Warehouse | Qty from here | Running fulfilled | Shortfall. Plus a summary strip: total shipments, estimated shipping cost, warehouses involved, backorder units.
- **Visual**: horizontal stacked bar per line showing the warehouse distribution, color-coded per warehouse with a legend.
- **Buttons**: `Accept Suggested Split` (gradient, primary) / `Manual Override` (outline).
- **Manual override mode**: the same table becomes editable — a qty input per (line, warehouse) cell, live-validated against that warehouse's on-hand stock (input turns red + inline message if exceeded), with running totals per line and a warning if a line is under- or over-allocated. Shipment count and cost recalculate live so the rep can see the cost of their override vs the suggestion (show a delta chip: "+₹420 vs suggested"). `Reset to suggestion` and `Save Override` buttons; save is blocked while any line is invalid.
- **Backorder section** (only when shortfall > 0): affected lines, qty short, expected restock date derived from the warehouse's replenishment rule, and a choice of `Ship available now, backorder rest` vs `Hold entire order until complete`.
- **Consolidate Remaining Backorder prompt**: when stock changes while an order is in fulfillment with an open backorder, a modal appears offering to merge the remaining backorder into fewer shipments, showing the shipment-count and cost saving. Trigger it in a demo via `Simulate Restock` in A4 (or a `Simulate stock arrival` button right on this screen). The store watches for stock increases against open backorders and raises the prompt.

### 4.14 B7 — Subscription & Billing (`/app/quotations/:id/billing`)
Two clearly separated, differently-bordered sections so hybrid billing is never ambiguous:
- **One-Time Charges** (brand-purple header): table of non-recurring lines with totals, and a `Total billed once` figure, plus a link/button `Go to Invoice` → B10.
- **Recurring Charges** (accent-indigo header): table of subscription lines — product, plan, cadence, qty, unit price, per-cycle amount, start date, next billing date, status. Below it, the **billing schedule**: the next 6–12 occurrences as a timeline/list (date, amount, status chip `Scheduled` / `Invoiced` / `Paid` / `Refunded`), with monthly/quarterly/yearly grouping and an annual contract value summary.
- **Mid-cycle change simulator**: change a recurring line's qty or plan → a preview card appears *before* committing, showing the proration math in words and numbers ("Day 12 of 30 · +2 units × ₹1,200 × 18/30 days = ₹1,440 charged now; next full cycle ₹X"), with `Apply change` / `Cancel`. Uses the real proration function per the plan's configured strategy.
- **Cancel / modify controls** per recurring line: `Change qty`, `Change plan`, `Cancel subscription`. Cancel opens a dialog showing the cancellation rule's outcome (refund unused / no refund / credit note) with the computed amount, then on confirm creates a **Credit Note** or **Partial Refund** record.
- **Credit notes & refunds ledger** at the bottom: id, date, related line, amount, reason, type chip.

### 4.15 B8 — Customer Portal Negotiation (`/portal/:token`)
Completely separate shell. Customer-appropriate content only.
- **Header**: company logo, "Quotation #Q-1042 for Acme Corp", prominent status pill — `Sent` (blue) / `Under Negotiation` (amber) / `Pending Re-approval` (violet) / `Confirmed` (green) / `Expired` (grey). Validity date.
- **Quotation view** (read-optimized, not the internal editor): line items with product name, description, qty, unit price, discount shown as a customer-friendly "You save X", line total. Recurring lines clearly labeled with cadence and "billed every month" phrasing. Summary: subtotal, savings, tax, total. **Never show cost price, margin, internal risk score, ceilings, rep notes, or other customers' data** — filter these out when building the portal view object (`toPortalView(quotation)` in `src/lib/portalView.js`), don't just hide them with CSS.
- **Per-line actions**: a comment icon on each row opens an inline thread — customer message, rep replies, timestamps. `Ask about this line` / `Request change` with a short type selector (price, quantity, spec, delivery).
- **Counter-discount proposal**: a dedicated glass card — current effective discount shown, an input for "Discount you'd like", optional justification textarea.
- **Buttons**: `Submit Request` (sends comments + counter proposal → status becomes `Under Negotiation`, notifies the rep via the store's notification slice, disables further edits until the rep responds) and `Confirm Quotation` (gradient, primary).
- **On Confirm** — the branching logic that satisfies the problem statement:
  - Recompute the blended risk with the *final* agreed terms. If it now exceeds thresholds → the quotation re-enters the approval flow (stage → `pending_approval`, approval steps reset, audit entry "Re-approval triggered by customer-negotiated terms"), and the customer sees a `Pending Re-approval` state with an explanatory message. **This must be automatic — no rep action required.**
  - Otherwise → stage → `confirmed`, redirect to `/portal/:token/confirmed`, which shows a success card with next steps and the order reference.
- **Rep side of negotiation**: the rep's builder shows a `Customer Requests (n)` badge; opening it shows the thread with a reply box and an `Apply requested discount` shortcut that writes the countered value into the line and re-runs risk scoring.

### 4.16 B9 — Deal Health & Anomaly Dashboard (`/app/dashboard`)
- **KPI tiles**: Active deals + value, Stalled deals, Open anomalies, Pending approvals (with "oldest waiting X hrs"), Avg cycle time, Win rate.
- **Alert feed** (primary panel) — unified, severity-sorted list. Each row: severity dot + icon, alert type chip, quotation ref + customer, the explanation, age, and inline actions `Open` / `Nudge Rep` / `Escalate`.
  - **Stalled deals**: "No activity for 9 days (threshold 5)" — badge intensity scales with staleness.
  - **Discount anomalies**: "22% discount vs this rep's 8.4% 90-day average (2.6× higher)" — computed against actual seeded history, not a hardcoded string.
  - **Delivery promise slippage**: "Promised Mar 12, current ETA Mar 19 (7 days late)" — derived from backorder restock dates.
  - **Approval bottlenecks**: "Waiting on Finance for 3 days".
- Clicking a row navigates to the relevant quotation screen (builder, approval, or fulfillment depending on alert type).
- `Nudge Rep` → creates a notification for the owning rep + audit entry + toast. `Escalate` → creates a notification for the manager, raises severity, logs it.
- **Charts row**: deals by stage (funnel), discount trend over time with the ceiling as a reference line, aging buckets (0–3 / 4–7 / 8–14 / 15+ days).
- **Settings popover**: stall threshold (days), anomaly sensitivity (× rep average), both persisted to the config slice and used by the real detection functions.

### 4.17 B10 — Invoice & Payment (`/app/quotations/:id/invoice`)
Present in the wireframe as its own screen with a step indicator; also required by Quick Test Flow step 8.
- **Status stepper** (shared `<StepProgress />`): `Draft` → `Sent` → `Partially Paid` → `Paid`. Completed segments filled with the brand gradient; `Partially Paid` renders amber.
- **Invoice panel**: invoice number, linked quote/order ref, bill-to block, issue date, due date, line items (**one-time lines only**), subtotal, tax, total due, amount paid, **balance remaining** (large, red while > 0, green at 0).
- **Hybrid-billing callout**: when the order also has recurring lines, a glass note — "This invoice covers one-time charges. N recurring lines are billed on their own schedule." with a link to B7. This keeps the two billing streams unambiguous.
- **Record Payment form**: amount (defaults to the outstanding balance), method select (Card / Bank transfer / Cheque / UPI / Other), reference/txn id, date, notes. `Record Payment` (gradient) → runs the payment logic: adds the payment, recomputes `amountPaid` / `balanceRemaining`, advances the status (`Paid` at zero balance, `Partially Paid` otherwise), writes an audit entry, toasts the result, and animates the stepper forward. Overpayment is blocked with an inline message.
- **Payment history table**: date, amount, method, reference, recorded by, plus a running balance-after column.
- `Send Invoice` (Draft → Sent), `Download PDF` (jspdf, styled with the brand colors), `Create Credit Note` (opens the same dialog as B7's ledger).

---

## 5. End-to-End Workflows (expanded — this is the part that keeps the generated app coherent)

Each workflow below lists the trigger, the screens involved, the exact state changes, and the side effects. A generator that implements these faithfully will produce an app where the flows actually connect, rather than a set of pretty but disconnected pages.

### 5.1 Master flow: quotation → approval → fulfillment → billing → payment

```
[Login]
   ↓ currentUser set
[Dashboard] ──→ [New Quotation]
   ↓ pick customer (tier auto-resolved) → quotation created, stage=draft
[Quotation Builder]
   ↓ add lines (tier prices auto-applied)
   ↓ apply line + order discounts
   ↓ risk score recomputes on every change  ← src/lib/riskEngine.js
   ↓ upsell panel re-ranks on every cart change ← src/lib/upsellEngine.js
   ├── risk == 0 ────────────────────────────────┐
   └── risk > 0 → [Send for Approval]            │
          ↓ stage=pending_approval               │
          ↓ approvalSteps built from chain rules  │
       [Approval Screen — Manager]                │
          ├── Reject → stage=lost (audit+reason)  │
          ├── Return → stage=draft (rep edits, resubmits, steps reset)
          └── Approve → next step or done         │
       [Approval Screen — Finance] (only if required)
          └── Approve → stage=approved ───────────┤
                                                  ↓
[Fulfillment Split]  ← auto-computed on entering  ← src/lib/warehouseSplit.js
   ├── Accept Suggested Split
   └── Manual Override → validate → save
   ↓ stage=fulfillment, shipments + backorders recorded
[Billing]  ← src/lib/billingEngine.js
   ├── one-time lines  → invoice generated (stage can advance to billed)
   └── recurring lines → schedule generated, proration on changes
[Invoice & Payment]
   ↓ Send Invoice → status=sent
   ↓ Record Payment → partially_paid → paid
   ↓ balance == 0 → stage=confirmed
[Dashboard / Reports reflect everything]
```

### 5.2 Customer negotiation flow (the loop-back that must be automatic)

```
[Builder] → "Send to Customer"
   ↓ quotation.portalToken generated, negotiationStatus=sent, stage stays/becomes sent
   ↓ portal link surfaced with a copy button (and listed on /portal/login demo list)
[Customer opens /portal/:token]
   ├── adds line comments / change requests
   ├── submits a counter discount
   │     ↓ negotiationStatus=under_negotiation
   │     ↓ notification created for the owning rep
   │     ↓ audit entry logged (actor = customer)
   │  [Rep sees "Customer Requests (n)" in builder]
   │     ↓ rep replies and/or clicks "Apply requested discount"
   │     ↓ line discount updated → risk recomputed → rep re-sends
   │     └── loops until the customer confirms
   └── clicks "Confirm Quotation"
         ↓ recompute blended risk on FINAL terms
         ├── exceeds thresholds → stage=pending_approval,
         │      approvalSteps rebuilt & reset,
         │      audit: "Re-approval triggered by customer-negotiated terms",
         │      customer sees "Pending Re-approval" status
         │      → re-enters 5.1 at the Approval Screen (no rep action needed)
         └── within thresholds → stage=confirmed
                → /portal/:token/confirmed
                → order proceeds to fulfillment
```

### 5.3 Approval routing decision flow

```
On "Send for Approval":
  1. risk = computeBlendedRisk(lines, categoryCeilings, tierCeiling, orderDiscount)
  2. rule = approvalChain.find(r => risk.score > r.minScore && risk.score <= (r.maxScore ?? Infinity))
     (also force-escalate if risk.worstSingleOverage exceeds the rule's single-line trip point)
  3. approvalSteps = rule.approvers.map(role => ({ role, status:'pending' }))
     → if approvers is empty: stage='approved', audit 'Auto-approved (within all ceilings)'
     → else: stage='pending_approval', notify each approver in order
  4. Only the FIRST pending step is actionable. Finance cannot approve before the Manager.
  5. On each approve: mark step approved (reviewer+timestamp), find next pending step.
     If none remain → stage='approved', notify rep, fulfillment suggestion computed.
  6. On reject: stage='lost', all remaining steps → 'skipped', reason required, rep notified.
  7. On return: stage='draft', all steps cleared, reason required, rep notified.
     Any subsequent resubmit recomputes risk from scratch (a rep can't sneak through by
     resubmitting a worse quote against a stale approval chain).
```

### 5.4 Fulfillment split flow

```
On entering the Fulfillment screen (or on Reload Data):
  plan = suggestWarehouseSplit(quotation.lines, warehouses)
  Algorithm (src/lib/warehouseSplit.js):
    1. For each line, list warehouses with stock > 0, sorted by:
         a. can this warehouse fulfil the ENTIRE line? (prefer complete fulfilment — fewer shipments)
         b. then by shippingCostWeight ascending (cheaper first)
         c. then by available qty descending
    2. Greedily allocate: take as much as possible from the best warehouse, move to the next
       for the remainder.
    3. Prefer warehouses already used by other lines in this order — this is the
       "minimize number of shipments" objective, weighted against cost.
    4. Any unallocated qty becomes backorder, with an ETA from that warehouse's
       replenishment rule.
    5. shipments = count of distinct warehouses used; cost = Σ (baseShipCost × weight)
       per warehouse used.
  Rep accepts → splits saved, stage='fulfillment'
  Rep overrides → validate each cell ≤ available stock and Σ per line ≤ qty ordered,
                  recompute shipments/cost, show delta vs suggestion, then save.
  If stock later increases (Simulate Restock) while a backorder is open →
      raise the "Consolidate Remaining Backorder" prompt with the computed saving.
```

### 5.5 Hybrid billing flow

```
On order confirmation / entering Billing:
  oneTimeLines  = lines.filter(l => !l.isSubscription)
  recurringLines= lines.filter(l =>  l.isSubscription)

  One-time  → generateInvoice(oneTimeLines)  → Invoice { status:'draft' }
              → B10 handles send + payments
  Recurring → generateBillingSchedule(line, plan, startDate, horizon=12)
              → occurrences at the plan cadence, each { date, amount, status:'scheduled' }

  On a mid-cycle qty/plan change:
    delta = computeProration(line, oldQty, newQty, plan, changeDate)
    strategies:
      daily_prorate     → amount = unitPrice × qtyDelta × (daysRemaining / daysInCycle)
                          (positive = charge now, negative = credit note)
      full_period       → 0 now; the new amount applies from the next cycle
      next_cycle_adjust → 0 now; delta folded into the next occurrence's amount
    Preview shown to the user BEFORE applying, in plain language + numbers.

  On cancellation:
    refund_unused    → credit = unitPrice × qty × (daysRemaining / daysInCycle) → Refund record
    no_refund        → 0, subscription ends at cycle end
    credit_note_only → same amount as refund_unused but issued as a CreditNote record
    All future 'scheduled' occurrences → 'cancelled'.
```

### 5.6 Anomaly detection flow (runs on boot, on any quotation mutation, and on Reload Data)

```
detectAnomalies(quotations, users, config) → AnomalyAlert[]
  Stalled:    now - lastActivityAt > config.stallThresholdDays
              AND stage in ['draft','pending_approval','sent','under_negotiation']
              severity by how far past the threshold (1–2× low, 2–3× medium, 3×+ high)
  Discount anomaly:
              repAvg = mean discount % across that rep's last 90 days of quotations
              if quote.effectiveDiscountPct > repAvg × config.anomalySensitivity
              → alert carrying both numbers so the UI can explain itself
  Delivery slippage:
              any line with a backorder whose restock ETA > the promised delivery date
              severity by days late
  Approval bottleneck:
              a pending approval step older than config.approvalSlaHours
Results land in the store's alerts array → B9 renders them, KPI counts derive from them.
```

### 5.7 State transitions — the single source of truth

`src/lib/stageMachine.js` exports `TRANSITIONS` and `canTransition(from, to, quotation)`:

| From | Allowed to | Condition |
|---|---|---|
| `draft` | `pending_approval` | risk requires approval |
| `draft` | `approved` | risk == 0 (auto-approve) |
| `draft` | `sent` | rep sends to customer |
| `sent` | `under_negotiation` | customer submits a request |
| `sent` | `confirmed` | customer confirms, risk within limits |
| `sent` | `pending_approval` | customer confirms, risk exceeded |
| `under_negotiation` | `draft` | rep pulls it back to edit |
| `under_negotiation` | `pending_approval` / `confirmed` | as per confirm logic |
| `pending_approval` | `approved` | all steps approved |
| `pending_approval` | `draft` | returned for revision |
| `pending_approval` | `lost` | rejected |
| `approved` | `fulfillment` | a split is accepted or overridden |
| `fulfillment` | `billed` | invoice generated |
| `billed` | `confirmed` | invoice fully paid |
| any | `lost` | manual mark-lost with a reason |

Everything that changes a stage — buttons, Kanban drags, portal confirmations — must go through `canTransition`. This is what prevents the generated app from developing inconsistent paths between screens.

### 5.8 The 8-step judge demo script (build so this works verbatim)

1. **Login** as Admin → open `/app/backend`, confirm a discount tier (Gold 15%), a warehouse, and a subscription plan exist and are editable.
2. **New quotation** for a Gold customer → add `Laptop Pro 14` (Hardware) at 12% and `Onboarding Setup Service` (Service) at 18%. The service line's ceiling hint turns red immediately.
3. The primary button auto-changes to **`Send for Manager Approval`** with no manual "request approval" step anywhere. Click it.
4. Before sending (or after returning to the builder), **accept one upsell suggestion** → total, margin, and risk score all visibly animate-update.
5. Switch role to **Sales Manager** → open the approval screen → see the per-line breakdown showing the Service line 8 pts over → `Approve`. (If risk > 5, switch to **Finance** and approve the second step.) → **Fulfillment** screen auto-suggests a split across **two warehouses** because Main Warehouse can't cover the full qty.
6. Accept the split → go to **Billing** → the one-time hardware line and the recurring subscription line appear in separate sections with their own totals and a 12-occurrence schedule.
7. Open the **customer portal** link → as the customer, submit a **counter discount** of 25% → confirm → the quote **automatically returns to `Pending Approval`** and the internal approval screen shows a fresh cycle with the audit reason.
8. Approve again → **Invoice** screen → `Send Invoice` → `Record Payment` (partial first, to show `Partially Paid`, then the remainder) → status reaches **`Paid`** and the stage becomes `confirmed`. Check the **Dashboard** and **Reports** now reflect the closed deal.

---

## 6. Data Shapes (JSDoc — no TypeScript)

Document these in `src/data/shapes.js` as JSDoc typedefs so editors give autocomplete without introducing TS.

```js
/**
 * @typedef {'sales_rep'|'sales_manager'|'finance'|'admin'} Role
 * @typedef {'hardware'|'service'|'subscription'|'accessories'} Category
 * @typedef {'bronze'|'silver'|'gold'} Tier
 * @typedef {'draft'|'sent'|'under_negotiation'|'pending_approval'|'approved'
 *           |'fulfillment'|'billed'|'confirmed'|'lost'} Stage
 */

/**
 * @typedef {Object} User
 * @property {string} id @property {string} name @property {string} email
 * @property {Role} role @property {string} team @property {string} avatarColor
 */

/**
 * @typedef {Object} Customer
 * @property {string} id @property {string} name @property {Tier} tier
 * @property {string} contactName @property {string} email @property {string} currency
 */

/**
 * @typedef {Object} Product
 * @property {string} id @property {string} name @property {string} sku
 * @property {Category} category @property {number} basePrice @property {number} costPrice
 * @property {string} unit @property {number} taxPct @property {string} description
 * @property {{attribute:string,value:string,extraPrice:number}[]} variants
 * @property {boolean} active
 * // marginPct is DERIVED: (basePrice - costPrice) / basePrice * 100 — never stored stale
 */

/**
 * @typedef {Object} PriceListEntry
 * @property {string} productId @property {Tier} tier @property {string} currency @property {number} price
 */

/**
 * @typedef {Object} QuoteLine
 * @property {string} id @property {string} productId @property {string} productName
 * @property {Category} category @property {number} qty @property {number} unitPrice
 * @property {number} costPrice @property {number} discountPct @property {number} taxPct
 * @property {boolean} isSubscription @property {string|null} planId
 * @property {{id:string,author:string,role:string,message:string,at:string}[]} comments
 * // lineSubtotal, lineTotal, marginAmount are all DERIVED by src/lib/pricing.js
 */

/**
 * @typedef {Object} ApprovalStep
 * @property {Role} role
 * @property {'pending'|'approved'|'rejected'|'returned'|'skipped'} status
 * @property {string|null} reviewerId @property {string|null} reviewerName
 * @property {string|null} at @property {string|null} reason
 */

/**
 * @typedef {Object} Quotation
 * @property {string} id            // 'Q-1042'
 * @property {string} customerId @property {string} customerName @property {Tier} tier
 * @property {string} ownerId @property {string} ownerName
 * @property {Stage} stage
 * @property {QuoteLine[]} lines
 * @property {number} orderDiscountPct
 * @property {ApprovalStep[]} approvalSteps
 * @property {string} portalToken   // used for /portal/:token
 * @property {'none'|'sent'|'under_negotiation'|'pending_reapproval'|'confirmed'} negotiationStatus
 * @property {number|null} counterDiscountPct
 * @property {string} createdAt @property {string} lastActivityAt
 * @property {string|null} promisedDeliveryDate @property {string} validUntil
 * @property {string} internalNotes @property {string} customerTerms
 * // riskScore, totals, requiresManager/Finance are ALL DERIVED — never stored,
 * // always recomputed by selectors so they can never drift out of sync
 */

/**
 * @typedef {Object} Warehouse
 * @property {string} id @property {string} name @property {string} location
 * @property {Record<string, number>} stock   // productId -> qty on hand
 * @property {number} shippingCostWeight @property {number} baseShipCost
 * @property {number} replenishThreshold @property {number} replenishQty
 * @property {number} replenishLeadDays
 */

/**
 * @typedef {Object} SubscriptionPlan
 * @property {string} id @property {string} name
 * @property {'monthly'|'quarterly'|'yearly'} cadence
 * @property {string[]} productIds
 * @property {'daily_prorate'|'full_period'|'next_cycle_adjust'} prorationRule
 * @property {'refund_unused'|'no_refund'|'credit_note_only'} cancellationRule
 * @property {number} minCommitmentMonths @property {number} trialDays @property {boolean} active
 */

/**
 * @typedef {Object} UpsellRule
 * @property {string} id @property {string} triggerProductId @property {string} suggestedProductId
 * @property {number} coPurchaseScore  // 0-100
 * @property {boolean} promoted @property {number} minMarginPct @property {boolean} active
 */

/**
 * @typedef {Object} FulfillmentPlan
 * @property {string} quotationId
 * @property {{lineId:string,warehouseId:string,qty:number}[]} allocations
 * @property {{lineId:string,qty:number,etaDate:string|null}[]} backorders
 * @property {number} shipmentCount @property {number} estimatedCost
 * @property {boolean} isOverride @property {string|null} acceptedAt
 */

/**
 * @typedef {Object} BillingOccurrence
 * @property {string} id @property {string} lineId @property {string} date @property {number} amount
 * @property {'scheduled'|'invoiced'|'paid'|'refunded'|'cancelled'} status
 */

/**
 * @typedef {Object} Payment
 * @property {string} id @property {string} invoiceId @property {number} amount
 * @property {'card'|'bank_transfer'|'cheque'|'upi'|'other'} method
 * @property {string} reference @property {string} recordedById @property {string} date
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id @property {string} quotationId @property {string} customerName
 * @property {'draft'|'sent'|'partially_paid'|'paid'} status
 * @property {{lineId:string,productName:string,qty:number,unitPrice:number,discountPct:number,total:number}[]} lines
 * @property {number} subtotal @property {number} tax @property {number} total
 * @property {Payment[]} payments
 * @property {string} issueDate @property {string} dueDate
 * // amountPaid and balanceRemaining are DERIVED from payments
 */

/**
 * @typedef {Object} CreditNote
 * @property {string} id @property {string} quotationId @property {string|null} lineId
 * @property {number} amount @property {'refund'|'credit_note'} type
 * @property {string} reason @property {string} createdAt @property {string} createdById
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} id @property {string} entityType @property {string} entityId
 * @property {string} action @property {string} actorId @property {string} actorName
 * @property {Role|'customer'} actorRole @property {string|null} reason
 * @property {Object|null} meta @property {string} at
 */

/**
 * @typedef {Object} AnomalyAlert
 * @property {string} id @property {'stalled'|'discount_anomaly'|'delivery_slippage'|'approval_bottleneck'} type
 * @property {'low'|'medium'|'high'} severity @property {string} quotationId
 * @property {string} title @property {string} detail @property {Object} meta @property {string} detectedAt
 */
```

**Derived-not-stored is a hard rule.** Totals, margins, risk scores, invoice balances, and approval requirements are always computed from primitives by functions in `src/lib/`. Storing them invites the classic bug where the badge says one thing and the table says another.

---

## 7. Business Logic — reference implementations (plain JS, put these in `src/lib/`)

These are the heart of the project. Implement them as **pure functions with no React and no store imports**, so they're trivially testable and reusable by the landing-page risk widget, the builder gauge, the approval breakdown, and the anomaly detector alike.

### 7.1 `src/lib/pricing.js`

```js
export function lineSubtotal(line) {
  return line.qty * line.unitPrice;
}

export function lineTotal(line) {
  return lineSubtotal(line) * (1 - line.discountPct / 100);
}

export function lineMargin(line) {
  const revenue = lineTotal(line);
  const cost = line.qty * line.costPrice;
  return { amount: revenue - cost, pct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0 };
}

export function quoteTotals(quotation) {
  const lines = quotation.lines;
  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const afterLineDiscounts = lines.reduce((s, l) => s + lineTotal(l), 0);
  const orderDiscountAmount = afterLineDiscounts * (quotation.orderDiscountPct / 100);
  const netBeforeTax = afterLineDiscounts - orderDiscountAmount;
  const tax = lines.reduce(
    (s, l) => s + lineTotal(l) * (1 - quotation.orderDiscountPct / 100) * (l.taxPct / 100),
    0,
  );
  const totalCost = lines.reduce((s, l) => s + l.qty * l.costPrice, 0);
  return {
    subtotal,
    lineDiscountAmount: subtotal - afterLineDiscounts,
    orderDiscountAmount,
    netBeforeTax,
    tax,
    grandTotal: netBeforeTax + tax,
    marginAmount: netBeforeTax - totalCost,
    marginPct: netBeforeTax > 0 ? ((netBeforeTax - totalCost) / netBeforeTax) * 100 : 0,
    effectiveDiscountPct: subtotal > 0 ? ((subtotal - netBeforeTax) / subtotal) * 100 : 0,
  };
}
```

### 7.2 `src/lib/riskEngine.js` — the blended discount risk score

The concept, restated so the generator gets the intent right: every line is checked against **its own category ceiling**, not one blanket order-level limit. A single badly-over line trips approval. Many slightly-over lines also trip approval, because their overages are summed on a **value-weighted** basis, so a rep can't spread small violations across many lines to stay under the radar.

```js
/**
 * @param {QuoteLine[]} lines
 * @param {Record<Category, number>} categoryCeilings   e.g. { hardware:15, service:10 }
 * @param {number} tierCeiling                          customer tier headline max
 * @param {number} orderDiscountPct
 */
export function computeBlendedRisk(lines, categoryCeilings, tierCeiling, orderDiscountPct = 0) {
  let weightedOverage = 0;
  let totalValue = 0;
  let worstSingleOverage = 0;
  const lineBreakdown = [];

  for (const line of lines) {
    // Effective discount on this line includes its share of any order-level discount.
    const effectivePct = line.discountPct + orderDiscountPct * (1 - line.discountPct / 100);
    // The binding ceiling is the STRICTER of the category rule and the customer tier rule.
    const categoryCeiling = categoryCeilings[line.category] ?? tierCeiling;
    const ceiling = Math.min(categoryCeiling, tierCeiling);
    const overBy = Math.max(0, effectivePct - ceiling);
    const value = line.qty * line.unitPrice * (1 - line.discountPct / 100);

    if (overBy > worstSingleOverage) worstSingleOverage = overBy;
    weightedOverage += overBy * value;
    totalValue += value;

    lineBreakdown.push({
      lineId: line.id,
      productName: line.productName,
      category: line.category,
      value,
      givenPct: effectivePct,
      ceilingPct: ceiling,
      overBy,
      isViolation: overBy > 0,
      // How much this line contributes to the final blended score:
      contribution: 0, // filled in below once totalValue is known
    });
  }

  // Value-weighted average overage across the whole order, in discount points.
  const score = totalValue > 0 ? weightedOverage / totalValue : 0;
  for (const row of lineBreakdown) {
    row.contribution = totalValue > 0 ? (row.overBy * row.value) / totalValue : 0;
  }

  return {
    score: round2(score),
    worstSingleOverage: round2(worstSingleOverage),
    violationCount: lineBreakdown.filter((r) => r.isViolation).length,
    lineBreakdown,
    totalValue,
  };
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Resolve the required approver chain from the configured rules. */
export function resolveApprovalPath(risk, approvalChain) {
  // approvalChain rows: { id, minScore, maxScore|null, approvers:Role[], singleLineTrip|null }
  const escalated = approvalChain.find(
    (r) => r.singleLineTrip != null && risk.worstSingleOverage > r.singleLineTrip,
  );
  const byScore = approvalChain.find(
    (r) => risk.score > r.minScore && risk.score <= (r.maxScore ?? Infinity),
  );
  // Whichever rule demands MORE approvers wins — never route down.
  const candidates = [escalated, byScore].filter(Boolean);
  if (candidates.length === 0) return { approvers: [], label: 'Auto-approve' };
  const chosen = candidates.reduce((a, b) => (b.approvers.length > a.approvers.length ? b : a));
  return {
    approvers: chosen.approvers,
    label:
      chosen.approvers.length === 0
        ? 'Auto-approve'
        : chosen.approvers.length === 1
          ? 'Manager approval'
          : 'Manager + Finance',
  };
}

export function riskBand(score) {
  if (score === 0) return 'low';      // green
  if (score <= 5) return 'medium';    // amber
  return 'high';                      // red
}
```

**Worked check the generator should verify against the problem statement:** Gold customer (tier 15%), Laptop hardware line ₹100,000 at 12% (ceiling 15 → over by 0), Setup Service line ₹20,000 at 18% (ceiling 10 → over by 8). Line values: 88,000 and 16,400. Weighted overage = 0 × 88,000 + 8 × 16,400 = 131,200. Total value = 104,400. Score ≈ **1.26**, worst single overage **8**. With the seeded chain (>0 → Manager) this routes to **Sales Manager**, and the single-line trip point of 5 also confirms escalation. Exactly the behaviour the problem statement describes: the whole quote gets flagged because of that one line.

### 7.3 `src/lib/warehouseSplit.js`

```js
export function suggestWarehouseSplit(lines, warehouses) {
  const allocations = [];
  const backorders = [];
  const usedWarehouses = new Set();
  // Working copy so we don't mutate the store's stock while planning.
  const available = {};
  for (const w of warehouses) available[w.id] = { ...w.stock };

  for (const line of lines) {
    if (line.isSubscription) continue; // services/subscriptions aren't shipped
    let remaining = line.qty;

    const ranked = [...warehouses].sort((a, b) => {
      const aQty = available[a.id][line.productId] || 0;
      const bQty = available[b.id][line.productId] || 0;
      // 1. Prefer a warehouse that can fulfil the whole line (fewer shipments)
      const aWhole = aQty >= remaining ? 1 : 0;
      const bWhole = bQty >= remaining ? 1 : 0;
      if (aWhole !== bWhole) return bWhole - aWhole;
      // 2. Prefer a warehouse already shipping something on this order (consolidation)
      const aUsed = usedWarehouses.has(a.id) ? 1 : 0;
      const bUsed = usedWarehouses.has(b.id) ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;
      // 3. Cheaper shipping first
      if (a.shippingCostWeight !== b.shippingCostWeight)
        return a.shippingCostWeight - b.shippingCostWeight;
      // 4. More stock first
      return bQty - aQty;
    });

    for (const w of ranked) {
      if (remaining <= 0) break;
      const have = available[w.id][line.productId] || 0;
      if (have <= 0) continue;
      const take = Math.min(have, remaining);
      allocations.push({ lineId: line.id, warehouseId: w.id, qty: take });
      available[w.id][line.productId] = have - take;
      usedWarehouses.add(w.id);
      remaining -= take;
    }

    if (remaining > 0) {
      const restockAt = warehouses
        .map((w) => w.replenishLeadDays)
        .sort((a, b) => a - b)[0] ?? null;
      backorders.push({
        lineId: line.id,
        qty: remaining,
        etaDate: restockAt == null ? null : addDaysISO(new Date(), restockAt),
      });
    }
  }

  const shipmentCount = usedWarehouses.size;
  const estimatedCost = [...usedWarehouses].reduce((sum, id) => {
    const w = warehouses.find((x) => x.id === id);
    return sum + w.baseShipCost * w.shippingCostWeight;
  }, 0);

  return { allocations, backorders, shipmentCount, estimatedCost: round2(estimatedCost), isOverride: false };
}

export function validateOverride(allocations, lines, warehouses) {
  const errors = [];
  for (const line of lines.filter((l) => !l.isSubscription)) {
    const allocated = allocations
      .filter((a) => a.lineId === line.id)
      .reduce((s, a) => s + a.qty, 0);
    if (allocated > line.qty)
      errors.push({ lineId: line.id, message: `Over-allocated: ${allocated} of ${line.qty}` });
  }
  for (const a of allocations) {
    const w = warehouses.find((x) => x.id === a.warehouseId);
    const line = lines.find((l) => l.id === a.lineId);
    const have = w?.stock[line?.productId] || 0;
    if (a.qty > have)
      errors.push({
        lineId: a.lineId,
        warehouseId: a.warehouseId,
        message: `Only ${have} available at ${w?.name}`,
      });
  }
  return errors;
}

export function consolidationSaving(currentPlan, newPlan) {
  return {
    shipmentsSaved: currentPlan.shipmentCount - newPlan.shipmentCount,
    costSaved: round2(currentPlan.estimatedCost - newPlan.estimatedCost),
  };
}
```

### 7.4 `src/lib/billingEngine.js`

```js
import { addMonths, differenceInCalendarDays, endOfMonth, formatISO } from 'date-fns';

const CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

export function generateBillingSchedule(line, plan, startDate, occurrences = 12) {
  const step = CADENCE_MONTHS[plan.cadence];
  const perCycle = line.qty * line.unitPrice * (1 - line.discountPct / 100);
  const out = [];
  for (let i = 0; i < occurrences; i++) {
    out.push({
      id: `${line.id}-occ-${i}`,
      lineId: line.id,
      date: formatISO(addMonths(new Date(startDate), i * step), { representation: 'date' }),
      amount: round2(perCycle),
      status: i === 0 ? 'invoiced' : 'scheduled',
    });
  }
  return out;
}

export function cycleWindow(plan, referenceDate) {
  const step = CADENCE_MONTHS[plan.cadence];
  const start = new Date(referenceDate);
  const end = addMonths(start, step);
  return { start, end, daysInCycle: differenceInCalendarDays(end, start) };
}

/** Mid-cycle quantity or plan change. Returns what to charge or credit NOW. */
export function computeProration({ line, oldQty, newQty, plan, changeDate, cycleStartDate }) {
  const { daysInCycle } = cycleWindow(plan, cycleStartDate);
  const daysUsed = differenceInCalendarDays(new Date(changeDate), new Date(cycleStartDate));
  const daysRemaining = Math.max(0, daysInCycle - daysUsed);
  const qtyDelta = newQty - oldQty;
  const unitNet = line.unitPrice * (1 - line.discountPct / 100);

  if (plan.prorationRule === 'full_period') {
    return { amountNow: 0, type: 'none', daysRemaining, daysInCycle,
      explanation: `No mid-cycle charge. New quantity (${newQty}) applies from the next ${plan.cadence} cycle.` };
  }
  if (plan.prorationRule === 'next_cycle_adjust') {
    const deferred = round2(qtyDelta * unitNet);
    return { amountNow: 0, deferredAmount: deferred, type: 'deferred', daysRemaining, daysInCycle,
      explanation: `₹${Math.abs(deferred)} ${deferred >= 0 ? 'added to' : 'deducted from'} the next cycle's invoice.` };
  }
  // daily_prorate
  const amount = round2(qtyDelta * unitNet * (daysRemaining / daysInCycle));
  return {
    amountNow: amount,
    type: amount >= 0 ? 'charge' : 'credit',
    daysRemaining, daysInCycle,
    explanation:
      `Day ${daysUsed} of ${daysInCycle}: ${qtyDelta >= 0 ? '+' : ''}${qtyDelta} unit(s) ` +
      `× ₹${unitNet.toFixed(2)} × ${daysRemaining}/${daysInCycle} days = ` +
      `₹${Math.abs(amount).toFixed(2)} ${amount >= 0 ? 'charged now' : 'credited'}.`,
  };
}

export function computeCancellation({ line, plan, cancelDate, cycleStartDate }) {
  const { daysInCycle } = cycleWindow(plan, cycleStartDate);
  const daysRemaining = Math.max(
    0, daysInCycle - differenceInCalendarDays(new Date(cancelDate), new Date(cycleStartDate)),
  );
  const unused = round2(
    line.qty * line.unitPrice * (1 - line.discountPct / 100) * (daysRemaining / daysInCycle),
  );
  if (plan.cancellationRule === 'no_refund')
    return { amount: 0, type: null, explanation: 'No refund. Service continues to the end of the paid cycle.' };
  if (plan.cancellationRule === 'credit_note_only')
    return { amount: unused, type: 'credit_note', explanation: `₹${unused} issued as a credit note for ${daysRemaining} unused days.` };
  return { amount: unused, type: 'refund', explanation: `₹${unused} refunded for ${daysRemaining} unused days.` };
}

export function generateInvoice(quotation, oneTimeLines, issueDate, dueDays = 15) { /* builds an Invoice */ }

export function invoiceBalances(invoice) {
  const amountPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
  return { amountPaid: round2(amountPaid), balanceRemaining: round2(invoice.total - amountPaid) };
}

export function nextInvoiceStatus(invoice) {
  const { balanceRemaining, amountPaid } = invoiceBalances(invoice);
  if (balanceRemaining <= 0.001) return 'paid';
  if (amountPaid > 0) return 'partially_paid';
  return invoice.status === 'draft' ? 'draft' : 'sent';
}
```

### 7.5 `src/lib/upsellEngine.js`

```js
export function rankSuggestions({ cartLines, products, upsellRules, priceLists, tier }) {
  const inCart = new Set(cartLines.map((l) => l.productId));
  const scored = [];

  for (const rule of upsellRules.filter((r) => r.active)) {
    if (!inCart.has(rule.triggerProductId)) continue;   // trigger not in cart
    if (inCart.has(rule.suggestedProductId)) continue;  // already added
    const product = products.find((p) => p.id === rule.suggestedProductId);
    if (!product || !product.active) continue;

    const price = tierPrice(product, tier, priceLists);
    const marginPct = ((price - product.costPrice) / price) * 100;
    if (marginPct < rule.minMarginPct) continue;        // margin floor filter

    const score = rule.coPurchaseScore + (rule.promoted ? 25 : 0) + marginPct * 0.3;
    scored.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      price,
      marginPct: round2(marginPct),
      marginDelta: round2(price - product.costPrice),
      revenueDelta: round2(price),
      promoted: rule.promoted,
      coPurchaseScore: rule.coPurchaseScore,
      reason: `Frequently bought with ${products.find((p) => p.id === rule.triggerProductId)?.name}`,
      rankScore: round2(score),
    });
  }
  // De-dupe (a product can be suggested by several triggers) keeping the best score.
  const best = new Map();
  for (const s of scored) {
    const prev = best.get(s.productId);
    if (!prev || s.rankScore > prev.rankScore) best.set(s.productId, s);
  }
  return [...best.values()].sort((a, b) => b.rankScore - a.rankScore);
}

export function tierPrice(product, tier, priceLists) {
  const entry = priceLists.find((p) => p.productId === product.id && p.tier === tier);
  return entry ? entry.price : product.basePrice;
}
```

### 7.6 `src/lib/anomalyEngine.js`

```js
import { differenceInDays, differenceInHours } from 'date-fns';
import { quoteTotals } from './pricing';

const OPEN_STAGES = ['draft', 'sent', 'under_negotiation', 'pending_approval'];

export function detectAnomalies(quotations, users, config) {
  const alerts = [];
  const now = new Date();

  // rolling per-rep average discount, used for the anomaly comparison
  const repAvg = {};
  for (const u of users) {
    const theirs = quotations.filter(
      (q) => q.ownerId === u.id && differenceInDays(now, new Date(q.createdAt)) <= 90,
    );
    const pcts = theirs.map((q) => quoteTotals(q).effectiveDiscountPct);
    repAvg[u.id] = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  }

  for (const q of quotations) {
    const idle = differenceInDays(now, new Date(q.lastActivityAt));

    if (OPEN_STAGES.includes(q.stage) && idle > config.stallThresholdDays) {
      const ratio = idle / config.stallThresholdDays;
      alerts.push({
        id: `stall-${q.id}`, type: 'stalled', quotationId: q.id,
        severity: ratio >= 3 ? 'high' : ratio >= 2 ? 'medium' : 'low',
        title: `${q.customerName} — no activity for ${idle} days`,
        detail: `Stage "${q.stage}" · threshold is ${config.stallThresholdDays} days`,
        meta: { idle }, detectedAt: now.toISOString(),
      });
    }

    const given = quoteTotals(q).effectiveDiscountPct;
    const avg = repAvg[q.ownerId] || 0;
    if (avg > 0 && given > avg * config.anomalySensitivity) {
      alerts.push({
        id: `disc-${q.id}`, type: 'discount_anomaly', quotationId: q.id,
        severity: given > avg * (config.anomalySensitivity + 1) ? 'high' : 'medium',
        title: `${given.toFixed(1)}% discount vs ${q.ownerName}'s ${avg.toFixed(1)}% average`,
        detail: `${(given / avg).toFixed(1)}× this rep's 90-day average`,
        meta: { given, avg }, detectedAt: now.toISOString(),
      });
    }

    const pending = q.approvalSteps.find((s) => s.status === 'pending');
    if (q.stage === 'pending_approval' && pending) {
      const hrs = differenceInHours(now, new Date(q.lastActivityAt));
      if (hrs > config.approvalSlaHours) {
        alerts.push({
          id: `appr-${q.id}`, type: 'approval_bottleneck', quotationId: q.id,
          severity: hrs > config.approvalSlaHours * 3 ? 'high' : 'medium',
          title: `Waiting on ${pending.role.replace('_', ' ')} for ${Math.round(hrs / 24)} days`,
          detail: `SLA is ${config.approvalSlaHours}h`, meta: { hrs },
          detectedAt: now.toISOString(),
        });
      }
    }
  }
  // delivery_slippage alerts are added by comparing fulfillment backorder ETAs
  // against each quotation's promisedDeliveryDate.
  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}
```

### 7.7 `src/lib/stageMachine.js`, `src/lib/portalView.js`

- `stageMachine.js` — the transition table from §5.7 as data, plus `canTransition(from, to, quotation)` returning `{ ok, reason }` so the UI can show *why* a move was blocked.
- `portalView.js` — `toPortalView(quotation, products)` returns a **new object containing only customer-safe fields**. Explicitly strips `costPrice`, `marginAmount`, risk data, `ceilingPct`, `internalNotes`, `ownerId`, and approval details. Every portal component consumes only this shape and never the raw quotation. This is the concrete mechanism behind the "real, separate, restricted view" requirement — get it wrong by passing the raw object and the requirement is failed regardless of how the UI looks.

---

## 8. Store Contract (`src/store/useAppStore.js`)

Actions the UI calls. Each one runs real logic and writes an audit entry where relevant.

```js
// --- auth / session
login(email, password) · loginAsRole(role) · signup(payload) · logout()
switchRole(role)                 // demo convenience
resetDemoData()

// --- config (backend area)
upsertProduct(p) · archiveProduct(id) · upsertPriceListEntry(e)
setTierCeiling(tier, pct) · setCategoryCeiling(category, pct)
upsertApprovalRule(rule) · deleteApprovalRule(id) · reorderApprovalRules(ids)
upsertWarehouse(w) · setWarehouseStock(warehouseId, productId, qty) · simulateRestock(warehouseId)
upsertSubscriptionPlan(plan) · upsertUpsellRule(rule)
setDashboardConfig({ stallThresholdDays, anomalySensitivity, approvalSlaHours })

// --- quotations
createQuotation(customerId)              // resolves tier, generates id + portalToken
addLine(quoteId, productId, qty, planId?) // applies tier price + cost + tax from catalog
updateLine(quoteId, lineId, patch) · removeLine(quoteId, lineId)
setOrderDiscount(quoteId, pct) · setQuoteMeta(quoteId, { internalNotes, customerTerms, promisedDeliveryDate })
submitForApproval(quoteId)               // §5.3 — routes or auto-approves
approveStep(quoteId, comment?) · rejectQuote(quoteId, reason) · returnForRevision(quoteId, reason)
markLost(quoteId, reason) · moveStage(quoteId, toStage)   // goes through canTransition
sendToCustomer(quoteId)                  // sets negotiationStatus='sent', reveals portal link

// --- upsell
acceptSuggestion(quoteId, productId) · dismissSuggestion(quoteId, productId) · undoDismiss(quoteId, productId)

// --- fulfillment
computeFulfillment(quoteId)              // suggestWarehouseSplit
acceptSplit(quoteId) · saveOverride(quoteId, allocations)   // validates first
consolidateBackorder(quoteId)

// --- billing & invoicing
buildBilling(quoteId)                    // one-time invoice + recurring schedules
previewSubscriptionChange(quoteId, lineId, newQty) // returns proration preview, no mutation
applySubscriptionChange(quoteId, lineId, newQty)
cancelSubscription(quoteId, lineId)      // creates refund or credit note per rule
sendInvoice(invoiceId) · recordPayment(invoiceId, payment)  // advances status, may set stage=confirmed
createCreditNote(quoteId, payload)

// --- portal (called from the portal shell only)
portalGetQuote(token)                    // returns toPortalView(...) — never the raw quote
portalAddComment(token, lineId, message)
portalSubmitRequest(token, { counterDiscountPct, justification })
portalConfirm(token)                     // §5.2 branching: re-approval or confirmed

// --- dashboard / notifications
recomputeAlerts() · nudgeRep(alertId) · escalateAlert(alertId)
markNotificationRead(id) · reloadData()  // recompute everything derived
```

**Selectors** (in `src/store/selectors.js`, memoized where hot): `selectQuoteWithTotals(id)`, `selectQuoteRisk(id)`, `selectApprovalPath(id)`, `selectSuggestions(id)`, `selectFulfillmentPlan(id)`, `selectBillingView(id)`, `selectInvoiceWithBalances(id)`, `selectAlerts()`, `selectReportData(filters)`, `selectPipelineColumns()`.

---

## 9. Seed Data (`src/data/seed/`)

Seed deliberately, not randomly — the demo depends on specific conditions existing.

- **`users.js`** — 6 users: 2 Sales Reps (Priya Sharma, Rahul Mehta), 1 Sales Manager (Anita Desai), 1 Finance (Vikram Rao), 1 Admin (Neha Gupta), 1 spare rep for reporting variety.
- **`customers.js`** — 8 customers across tiers: Acme Corp (Gold), Beta Industries (Silver), Cygnus Retail (Bronze), Delta Logistics (Gold), Everest Labs (Silver), etc. Include the tier field and currency (`INR`, with one `USD` customer to show multi-currency as a bonus).
- **`products.js`** — 22 products with **realistic cost prices** so margins are meaningful:
  - Hardware (8): Laptop Pro 14 (₹95,000 / cost ₹68,000), Docking Station, 27" Monitor, Wireless Keyboard Kit, Rugged Tablet, Network Switch 24-port, Access Point, UPS 1500VA
  - Services (6): Onboarding Setup Service (₹20,000 / cost ₹9,000), Data Migration, Custom Integration, Training Workshop, Priority Support Retainer, Health Check Audit
  - Subscriptions (5): DealFlow Cloud Standard, Cloud Premium, Security Add-on, Analytics Module, Backup & DR
  - Accessories (3): Carry Case, Cable Bundle, Extended Warranty
  - At least 3 products have variants (Laptop: 16GB/32GB/64GB with extra prices; Monitor: 27"/32"; Support Retainer: Bronze/Silver/Gold hours)
- **`priceLists.js`** — tier pricing for every product (Bronze = base, Silver ≈ 4% off, Gold ≈ 8% off), plus USD entries for the one USD customer.
- **`warehouses.js`** — **3 warehouses, stocked so a split is forced**:
  - Main Warehouse (Mumbai) — weight 1.0, baseShipCost ₹400, healthy stock but only **6 units of Laptop Pro 14**
  - East Depot (Kolkata) — weight 1.4, baseShipCost ₹400, **4 units of Laptop Pro 14**, partial on others
  - West Hub (Pune) — weight 1.8, baseShipCost ₹400, thin stock, 0 laptops → so an order of 8 laptops must split Main (6) + East (2), and an order of 12 creates a backorder. This is exactly what Quick Test Flow step 5 needs.
- **`discountConfig.js`** — tier ceilings (Bronze 5, Silver 10, Gold 15); category ceilings (hardware 15, service 10, subscription 12, accessories 20); approval chain: `{minScore:0,maxScore:0,approvers:[]}`, `{minScore:0,maxScore:5,approvers:['sales_manager'],singleLineTrip:5}`, `{minScore:5,maxScore:null,approvers:['sales_manager','finance']}`.
- **`subscriptionPlans.js`** — 5 plans covering all three cadences and all three proration rules and all three cancellation rules, so every branch is demoable.
- **`upsellRules.js`** — 14 rules with believable pairings (Laptop → Docking Station promoted, Laptop → Extended Warranty, Cloud Standard → Security Add-on, Setup Service → Training Workshop, etc.), varied co-purchase scores 45–92, 3 marked promoted, min margin thresholds 15–30%.
- **`quotations.js`** — **14 quotations spread across every stage** so the pipeline, dashboard, and reports all look alive on first load:
  - 3 `draft` (one deliberately stale at 11 days idle → triggers a stalled alert)
  - 2 `pending_approval` (one waiting on Manager 4 days → approval bottleneck alert; one at Finance step)
  - 2 `sent` / 1 `under_negotiation` (with existing customer comments and a counter-discount, so the portal has content on first open)
  - 2 `approved`, 1 `fulfillment` (with an open backorder → delivery slippage alert), 1 `billed` (invoice partially paid), 2 `confirmed`, 1 `lost`
  - One quotation with a **22% discount from a rep whose average is 8%** → triggers the discount anomaly alert
  - Several with mixed one-time + subscription lines so hybrid billing is visible immediately
  - `createdAt` / `lastActivityAt` spread over the last 90 days so the reporting period filters and rep averages are meaningful
- **`invoices.js`** — 6 invoices: 2 draft, 1 sent unpaid, 2 partially paid, 1 fully paid.
- **`auditLog.js`** — ~40 pre-seeded entries so the audit screen isn't empty on first load.

Add a `src/data/index.js` that assembles and exports the full initial state object consumed by the store on boot.

---

## 10. Component Inventory

Build these as small, single-purpose files. This list exists so the generator doesn't inline everything into giant page components.

**`components/ui/`** (primitives): `Button`, `IconButton`, `Card`, `Input`, `NumberInput`, `Textarea`, `Select`, `MultiSelect`, `Checkbox`, `Switch`, `Slider`, `Badge`, `Chip`, `Dialog`, `Drawer`, `Tabs`, `Tooltip`, `Popover`, `DropdownMenu`, `Table` (styled wrapper around TanStack), `Progress`, `Skeleton`, `EmptyState`, `Avatar`, `SegmentedControl`, `DateRangePicker`.

**`components/glass/`**: `GlassCard`, `GlassPanel`, `GlassNav`, `GradientBlobBackground`, `GradientButton`, `SectionHeading`.

**`components/shared/`**: `StepProgress` (horizontal stepper — used by B4 approval and B10 invoice), `StatTile` (KPI with count-up), `PulseOnChange`, `RiskGauge` (semicircular), `RiskBadge`, `StageBadge`, `TierBadge`, `MoneyText`, `PercentInput`, `RelativeTime`, `ConfirmDialog`, `ReasonDialog` (reason-required actions), `AuditTrailList`, `PageHeader`, `FilterBar`, `ExportButtons`, `RoleGate`, `CopyLinkButton`.

**`components/quotation/`**: `CatalogPanel`, `ProductPickerCard`, `OrderLinesTable`, `OrderLineRow`, `QtyStepper`, `DiscountInput` (with the ceiling hint), `QuoteSummaryRail`, `DynamicPrimaryAction`, `UpsellPanel`, `UpsellCard`, `DismissedTray`, `RiskBreakdownTable`, `ApprovalStepper`, `ApprovalActionPanel`, `WarehouseSplitTable`, `SplitOverrideEditor`, `SplitBar`, `BackorderPanel`, `ConsolidatePrompt`, `OneTimeLinesSection`, `RecurringLinesSection`, `BillingScheduleList`, `ProrationPreviewCard`, `CancelSubscriptionDialog`, `CreditNoteLedger`, `InvoiceSummaryPanel`, `RecordPaymentForm`, `PaymentHistoryTable`, `CustomerRequestsDrawer`.

**`components/pipeline/`**: `PipelineBoard`, `PipelineColumn`, `QuotationCard`, `QuotationListTable`.

**`components/dashboard/`**: `AlertFeed`, `AlertRow`, `DealHealthKpis`, `StageFunnelChart`, `DiscountTrendChart`, `AgingBucketsChart`, `DashboardSettingsPopover`.

**`components/reports/`**: `ReportFilters`, `ReportKpis`, `ValueByRepChart`, `DiscountHistogram`, `ApprovalFunnelChart`, `RevenueMixChart`, `TopProductsTable`.

**`components/portal/`**: `PortalHeader`, `PortalStatusPill`, `PortalQuoteLines`, `PortalLineCommentThread`, `CounterDiscountCard`, `PortalActions`, `PortalConfirmedCard`. **None of these may import anything from `components/quotation/` or the workspace layout.**

**`components/landing/`**: `LandingNav`, `Hero`, `StatStrip`, `FeatureGrid`, `HowItWorks`, `RiskEngineDemo` (the interactive widget), `DashboardPreview`, `RolesBand`, `CtaBand`, `LandingFooter`.

---

## 11. Build Config & Zero-Error Guardrails

Generate these files exactly. They are the difference between "it deploys" and "it fails on Vercel."

### `package.json` scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext js,jsx --fix",
    "format": "prettier --write \"src/**/*.{js,jsx,css}\""
  }
}
```
`build` runs **only** Vite. No type-checking step exists (there's no TypeScript), which removes the single most common cause of failed AI-generated React deployments.

### `.eslintrc.cjs`
```js
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  plugins: ['react-refresh'],
  rules: {
    'react/prop-types': 'off',                 // no PropTypes in a JS-only hackathon build
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'jsx-a11y/label-has-associated-control': 'warn',
  },
};
```
Note `--max-warnings 0` in the lint script combined with `warn`-level rules: this means **the generator must actually clean up unused imports and add `aria-label`s**, rather than leaving warnings behind. If that proves too strict during generation, drop `--max-warnings 0` — but lint must still exit 0.

### `.prettierrc`
```json
{ "singleQuote": true, "semi": true, "trailingComma": "all", "printWidth": 100,
  "tabWidth": 2, "plugins": ["prettier-plugin-tailwindcss"] }
```

### `vite.config.js`
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1600 },
});
```
The `@` alias must also be mirrored in `jsconfig.json` so editors resolve it:
```json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } }, "exclude": ["node_modules", "dist"] }
```

### `vercel.json`
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### `netlify.toml`
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```
Both rewrite rules are mandatory. Without them, deep links like `/app/quotations/Q-1042` and every `/portal/:token` link 404 on refresh — which would break the customer-portal demo specifically, since those links are opened cold in a new tab.

### Common failure modes to avoid (tell the generator explicitly)
- No `.ts`/`.tsx` files, no type annotations leaking into `.jsx`, no `interface`/`type` keywords, no `as` casts, no generics.
- No `import type` statements.
- No unused imports (the top cause of lint failures after refactors).
- Every `.map()` over JSX needs a stable `key`.
- Every `useEffect` needs a correct dependency array; use `useCallback`/`useMemo` for values in deps.
- No direct state mutation — zustand updates return new arrays/objects.
- Icon-only buttons need `aria-label`; form inputs need associated `<label>` or `aria-label`.
- No `process.env` in client code — use `import.meta.env` (though this build needs no env vars at all).
- Avoid `xlsx` / `jspdf` at module top-level in a hot path; import them lazily inside the export handlers (`const { default: jsPDF } = await import('jspdf')`) so the initial bundle stays small.
- Tailwind `content` in `tailwind.config.js` must include `'./index.html'` and `'./src/**/*.{js,jsx}'` — miss this and the production build ships with no styles, which is a classic silent deploy failure.

---

## 12. Folder Structure

```
dealflow360/
├─ index.html
├─ package.json
├─ vite.config.js
├─ jsconfig.json
├─ tailwind.config.js
├─ postcss.config.js
├─ .eslintrc.cjs
├─ .prettierrc
├─ vercel.json
├─ netlify.toml
├─ README.md
└─ src/
   ├─ main.jsx
   ├─ App.jsx                        # router + providers + Toaster
   ├─ routes.jsx                     # route tree (§3.2)
   ├─ styles/globals.css             # Tailwind directives + glass utilities + blobs
   ├─ layouts/
   │  ├─ MarketingLayout.jsx
   │  ├─ WorkspaceLayout.jsx
   │  ├─ BackendLayout.jsx
   │  └─ PortalLayout.jsx            # imports NOTHING from the workspace
   ├─ guards/
   │  ├─ RequireAuth.jsx
   │  ├─ RequireRole.jsx
   │  └─ RequirePortalToken.jsx
   ├─ pages/
   │  ├─ Landing.jsx
   │  ├─ Login.jsx  Signup.jsx  Forbidden.jsx  NotFound.jsx
   │  ├─ workspace/
   │  │  ├─ Dashboard.jsx  Pipeline.jsx  Quotations.jsx  NewQuotation.jsx
   │  │  ├─ QuotationBuilder.jsx  QuotationApproval.jsx
   │  │  ├─ QuotationFulfillment.jsx  QuotationBilling.jsx  QuotationInvoice.jsx
   │  │  └─ Reports.jsx
   │  ├─ backend/
   │  │  ├─ Products.jsx  DiscountTiers.jsx  Warehouses.jsx
   │  │  ├─ Subscriptions.jsx  UpsellRules.jsx  Users.jsx  AuditLog.jsx
   │  └─ portal/
   │     ├─ PortalLogin.jsx  PortalNegotiation.jsx  PortalConfirmed.jsx
   ├─ components/                    # per §10
   │  ├─ ui/  glass/  shared/  quotation/  pipeline/  dashboard/  reports/  portal/  landing/
   ├─ lib/
   │  ├─ pricing.js  riskEngine.js  warehouseSplit.js  billingEngine.js
   │  ├─ upsellEngine.js  anomalyEngine.js  stageMachine.js  portalView.js
   │  ├─ exporters.js                # PDF / XLS
   │  ├─ format.js                   # currency, %, dates
   │  └─ utils.js                    # cn(), nextId(), sleep(), addDaysISO()
   ├─ store/
   │  ├─ useAppStore.js
   │  ├─ selectors.js
   │  └─ slices/                     # auth, catalog, config, quotation, fulfillment,
   │                                 # billing, audit, notification
   ├─ hooks/
   │  ├─ useQuotation.js  useRisk.js  useSuggestions.js
   │  ├─ useCountUp.js  useDebouncedValue.js  useMediaQuery.js
   └─ data/
      ├─ index.js  shapes.js
      └─ seed/                       # per §9
```

---

## 13. Generation Instructions (paste this alongside the document)

1. **JavaScript only.** React 18 + Vite JS template. `.jsx` for components, `.js` for logic. No TypeScript files, no type syntax, no `tsconfig.json`.
2. **No backend, no HTTP.** All data comes from `src/data/seed/`, held in the zustand store. Never write `fetch`, `axios`, or any network call. Do not add MSW or a mock server — the store *is* the data layer.
3. Implement **every** function in §7 as real working logic. Do not stub, fake, or hardcode results. These are the judged parts of the project.
4. Implement **every** screen in §4 including all named fields and buttons. Nothing gets omitted or replaced with a placeholder.
5. Wire the flows in §5 end-to-end. Verify the §5.8 demo script works click-by-click before declaring done.
6. Apply the §2 design system globally: purple gradients, glassmorphism panels everywhere, animated blob backgrounds in every layout, `PulseOnChange` on live values.
7. Enforce derived-not-stored (§6): totals, margins, risk scores, and invoice balances are computed by selectors, never persisted.
8. Keep `PortalLayout` and `components/portal/` fully isolated — no imports from the workspace layout or internal components. Portal data must pass through `toPortalView()`.
9. Seed the data exactly as described in §9, especially the warehouse stock levels that force a split and the quotations that trigger each alert type.
10. Small files. One component per file. No page component over ~250 lines — extract into `components/`.
11. Apply §11 configs verbatim. Then run `npm run lint` and `npm run build` and **fix everything** until both pass clean.
12. Write a `README.md` with: setup commands, the demo script from §5.8, the seeded login roles, and a note that data is in-memory and resets on refresh (or persists to sessionStorage, with a Reset button).

---

## 14. Additions Beyond the Literal Brief (flagged)

- **Landing page** with an interactive risk-engine widget — the risk score is the project's differentiator, so let visitors and judges play with it.
- **Invoice & Payment screen (B10)** — present in the wireframe and required by Quick Test Flow step 8, but never named as a screen in the written brief.
- **Demo role switcher** in the user menu — walking a Manager → Finance approval chain on one laptop is otherwise four logins deep.
- **`Reset demo data`** + optional sessionStorage persistence — protects a live demo from an accidental refresh.
- **Artificial `sleep()` on write actions** — makes loading states real and the app feel like it has a backend.
- **Risk sandbox in A3** and **suggestion previewer in A6** — turn config screens into testable tools, and double as talking points.
- **`Simulate Restock`** in A4 / fulfillment — gives you a deterministic trigger for the backorder-consolidation prompt, which otherwise depends on real inventory events.
- **Blocked-drag toasts on the Kanban** — explain *why* a stage move isn't allowed instead of silently snapping back.
- **Dismissed-upsell undo tray** — dismissals shouldn't be destructive.
- **Dedicated audit log screen** — the brief requires logging everything; this gives it a home.
- **Approval-bottleneck alerts** — a fourth alert type beyond the three named, since a stuck approver is the most common real-world stall.
- **Override-vs-suggestion cost delta** on the fulfillment screen — makes the cost of a manual override visible, which is the whole point of having a suggestion.
- **Multi-currency touch** — one USD customer with USD price list entries, satisfying the stated bonus without complicating the core.

---

## 15. Notes for Whoever Adds a Backend Later

Because every mutation is funnelled through store actions and every calculation lives in a pure `src/lib/` function, adding a real backend is a contained change:

1. Move `src/lib/*` to the server (they're dependency-free JS — they'll run as-is on Node).
2. Replace each store action body with an HTTP call; keep the action names and signatures identical.
3. Components need **zero** changes, because they only ever talk to the store.
4. The portal API must be a genuinely separate, narrower endpoint. `toPortalView()` already defines exactly what the customer is allowed to see — port that filter to the server, because hiding fields in the UI alone is not access control.
5. Portal tokens should become single-quotation-scoped, expiring, and rate-limited server-side before this is ever exposed publicly.
