<div align="center">

# DealFlow360 — Frontend

### React 18 + Vite single-page app for the DealFlow360 sales operations platform

**Team 413 · Team Vector** — Odoo Hackathon 2026

[![React](https://img.shields.io/badge/React-18.3-61dafb)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.2-646cff)](https://vitejs.dev)
[![Zustand](https://img.shields.io/badge/Zustand-4.5-443e38)](https://zustand-demo.pmnd.rs)
[![Tailwind](https://img.shields.io/badge/Tailwind-3.4-38bdf8)](https://tailwindcss.com)

</div>

---

## 🔗 Links

| | Link |
|:--|:--|
| 🎥 **Demo Video** | <!-- TODO: paste the demo video URL here --> _add link_ |
| 🌐 **Live App** | **<https://dealflow360.teamvector.space>** · <https://deal-flow360-team413.vercel.app> |
| ⚙️ **Live API** | **<https://api.dealflow360.teamvector.space/api/v1>** |
| 📘 **Project README** | [`../README.md`](../README.md) |
| 🖥️ **Backend README** | [`../backend/README.md`](../backend/README.md) |
| 📖 **API Reference** | [`../backend/docs/API-REFERENCE.md`](../backend/docs/API-REFERENCE.md) — 116 endpoints |
| 🗂️ **DBML / ER Diagram** | [§24.8 Full DBML](../backend/docs/API-REFERENCE.md#248-full-dbml-source) · [§24 ER diagrams](../backend/docs/API-REFERENCE.md#24-data-model) |

---

## 🔑 Demo Credentials

Staff sign in at `/login`, customers at `/customer/login`.

| # | Role | Email | Password |
|:--|:--|:--|:--|
| 1 | **admin** | `admin@teamvector.co` | `Cloud123@` |
| 2 | **sales_manager** | `anita@teamvector.co` | `Passw0rd!2026` |
| 3 | **finance** | `vikram@teamvector.co` | `Passw0rd!2026` |
| 4 | **sales_rep** | `priya@teamvector.co` | `Passw0rd!2026` |
| 5 | **customer** | `buyer@acme.teamvector.co` | `Passw0rd!2026` |

> The complete list is in **[§10 Demo Accounts](#10-demo-accounts)**.

---

## 📑 Table of Contents

| § | Section | What's inside |
|:--|:--|:--|
| **[1](#1-overview)** | **Overview** | What this app is and how it talks to the backend |
| [1.1](#11-related-documentation) | Related documentation | API reference, DBML, backend README |
| [1.2](#12-design-principles) | Design principles | The five rules the codebase follows |
| **[2](#2-quick-start)** | **Quick Start** | Install → run in three commands |
| [2.1](#21-prerequisites) | Prerequisites | Node version and the backend |
| [2.2](#22-installation) | Installation | Clone to running dev server |
| [2.3](#23-environment-variables) | Environment variables | `VITE_API_BASE_URL` and the timeout |
| [2.4](#24-npm-scripts) | npm scripts | Every command |
| **[3](#3-tech-stack)** | **Tech Stack** | Every dependency and why it is there |
| **[4](#4-file-structure)** | **File Structure** | Complete annotated tree |
| [4.1](#41-project-root) | Project root | Config files |
| [4.2](#42-source-tree) | Source tree | Every folder in `src/` |
| **[5](#5-architecture)** | **Architecture** | Layers and data flow |
| [5.1](#51-data-flow) | Data flow | Component → store → service → API |
| [5.2](#52-the-service-layer) | The service layer | One module per API area |
| [5.3](#53-state-management) | State management | 12 Zustand slices |
| [5.4](#54-the-lib-layer) | The lib layer | Pure, React-free helpers |
| **[6](#6-routing)** | **Routing** | Every route and its guard |
| **[7](#7-authentication--identity)** | **Authentication & Identity** | Two separate identity spaces |
| [7.1](#71-staff-vs-customer) | Staff vs customer | Routes, layouts, guards |
| [7.2](#72-token-handling) | Token handling | Rotating JWT pair in cookies |
| [7.3](#73-nobody-provisions-accounts) | Nobody provisions accounts | Self-registration only |
| **[8](#8-risk-scoring)** | **Risk Scoring** | Fetched, never computed |
| [8.1](#81-why-there-is-no-local-fallback) | Why there is no local fallback | The routing-mismatch problem |
| [8.2](#82-the-formula) | The formula | Value-weighted overage |
| [8.3](#83-caching--batching) | Caching & batching | riskCache, ensureRisk, batch requests |
| **[9](#9-roles--permissions)** | **Roles & Permissions** | Who can do what in the UI |
| **[10](#10-demo-accounts)** | **Demo Accounts** | Staff and customer logins |
| **[11](#11-demo-script)** | **Demo Script** | The eight-step walkthrough |
| **[12](#12-deployment)** | **Deployment** | Vercel and Netlify |
| **[13](#13-roadmap)** | **Roadmap** | What we'd build next |
| **[14](#14-team)** | **Team** | Team 413 — Team Vector |

---

## 1. Overview

DealFlow360 is an intelligent, **self-governing** sales operations platform:
quote → approval → fulfillment → billing → payment, with discount governance,
multi-warehouse splitting, hybrid billing and a real customer negotiation area.

This is the **frontend** — React 18 + Vite, plain JavaScript, no TypeScript.
**Every screen reads from the API.** There is no local business database, no mock mode and
no client-side scoring.

### 1.1 Related Documentation

| # | Document | What it contains |
|:--|:--|:--|
| 1 | **[`../README.md`](../README.md)** | The whole-project guide — both halves, architecture, demo |
| 2 | **[`../backend/README.md`](../backend/README.md)** | Backend setup, environment, module map |
| 3 | **[`../backend/docs/API-REFERENCE.md`](../backend/docs/API-REFERENCE.md)** | **API reference** — 116 endpoints, request/response shapes, roles, error codes |
| 4 | **[§24 — Data model](../backend/docs/API-REFERENCE.md#24-data-model)** | **ER diagrams** for all 31 tables |
| 5 | **[§24.8 — Full DBML](../backend/docs/API-REFERENCE.md#248-full-dbml-source)** | **DBML diagram** — paste into [dbdiagram.io](https://dbdiagram.io/d) |
| 6 | [§19 — Error catalogue](../backend/docs/API-REFERENCE.md#19-error-catalogue) | Every stable error code the UI branches on |
| 7 | [§22 — Role matrix](../backend/docs/API-REFERENCE.md#22-role-permission-matrix) | Per-endpoint role requirements |

### 1.2 Design Principles

1. **The API is the source of truth.** Store collections are caches of server responses.
2. **Nothing is pre-seeded.** Collections start empty; each screen shows a loading or empty
   state until its loader resolves. Fabricated rows are never rendered, not even briefly.
3. **Derived, never stored.** Totals, margins, approval requirements and invoice balances
   are recomputed from primitives, so a badge can never disagree with the table beside it.
4. **`services/` is the only place `fetch()` happens.** Components never call the network.
5. **Role checks shape the UI, they do not enforce it.** The API enforces the same matrix,
   so a devtools edit changes what is drawn, not what is permitted.

---

## 2. Quick Start

### 2.1 Prerequisites

- **Node.js 20 or newer**
- A running backend — *or nothing at all*, since the app defaults to the deployed API.

### 2.2 Installation

```bash
cd Frontend
npm install
npm run dev
```

Open **<http://localhost:5173>**.

With **no** `.env` file the app targets the deployed API
(`https://api.dealflow360.teamvector.space/api/v1`), so a fresh clone works immediately.

To run against a local backend instead:

```bash
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:5050/api/v1
```

### 2.3 Environment Variables

| # | Variable | Required | Default | Purpose |
|:--|:--|:--:|:--|:--|
| 1 | `VITE_API_BASE_URL` | No | the deployed API | API base URL, e.g. `http://localhost:5050/api/v1` |
| 2 | `VITE_API_TIMEOUT_MS` | No | `30000` | Request timeout in ms. **Validated before use** — a malformed value falls back to the default instead of aborting every request |

### 2.4 npm Scripts

| # | Command | What it does |
|:--|:--|:--|
| 1 | `npm run dev` | Vite dev server with HMR on port 5173 |
| 2 | `npm run build` | Production build to `dist/` |
| 3 | `npm run preview` | Serve the production build locally |
| 4 | `npm run lint` | ESLint over `js,jsx` — zero-warning policy |
| 5 | `npm run lint:fix` | ESLint with `--fix` |
| 6 | `npm run format` | Prettier over `src/**/*.{js,jsx,css}` |

---

## 3. Tech Stack

| # | Concern | Choice | Why |
|:--|:--|:--|:--|
| 1 | **Framework** | React 18.3 (plain JavaScript) | No TypeScript build step in the UI layer |
| 2 | **Build tool** | Vite 5.2 | Instant HMR, fast production builds |
| 3 | **Routing** | React Router 6.23 | One declarative route table in `src/routes.jsx` |
| 4 | **State** | Zustand 4.5 | 12 composed slices, no provider tree, no boilerplate |
| 5 | **Styling** | Tailwind CSS 3.4 | With `tailwind-merge` + `clsx` for conflict-free classes |
| 6 | **UI primitives** | Radix UI | Accessible dialog, dropdown, popover, select, slider, switch, tabs, tooltip, progress |
| 7 | **Tables** | TanStack Table 8.17 | Headless sorting, filtering, pagination |
| 8 | **Charts** | Recharts 2.12 | Dashboard and report visuals |
| 9 | **Drag & drop** | dnd-kit 6.1 | The pipeline kanban board |
| 10 | **Forms** | React Hook Form 7.51 | Uncontrolled inputs, minimal re-renders |
| 11 | **Animation** | Framer Motion 11.2 | Page and panel transitions |
| 12 | **Notifications** | Sonner 1.5 | Toasts |
| 13 | **Icons** | lucide-react 0.395 | Consistent icon set |
| 14 | **PDF export** | jsPDF 2.5 + jspdf-autotable 3.8 | Client-side document export |
| 15 | **Excel export** | SheetJS `xlsx` 0.18 | Report export |
| 16 | **Dates** | date-fns 3.6 | Formatting and relative time |
| 17 | **Lint** | ESLint 8 + react, hooks, jsx-a11y, refresh | Zero-warning policy |
| 18 | **Format** | Prettier 3 + tailwindcss plugin | Class-order-aware formatting |

---

## 4. File Structure

### 4.1 Project Root

```
Frontend/
│
├── index.html                       SPA shell + SEO / Open Graph meta
├── package.json                     scripts and dependencies
├── vite.config.js                   build config + @/ path alias
├── tailwind.config.js               design tokens, theme extension
├── postcss.config.js                autoprefixer pipeline
├── jsconfig.json                    editor path resolution
├── .eslintrc.cjs                    lint rules (zero-warning policy)
├── .prettierrc                      format rules
├── .env.example                     documented environment variables
├── vercel.json                      SPA rewrite for Vercel
├── netlify.toml                     build command + SPA redirect for Netlify
│
├── public/                          favicon.ico · favicon-16x16 · favicon-32x32 ·
│                                    apple-touch-icon · android-chrome-192/512 ·
│                                    site.webmanifest
├── dist/                            production build output (generated)
└── src/                             ← see 4.2
```

### 4.2 Source Tree

```
src/
│
├── main.jsx                         React root, mounts <App/>
├── App.jsx                          providers, toaster, error boundary
├── routes.jsx                       THE route table — marketing · staff ·
│                                    back-office · customer portal
│
├── services/                        ── THE ONLY PLACE fetch() HAPPENS ──
│   ├── apiClient.js                 base URL · { success, data } unwrapping · timeouts
│   │                                single-flight refresh on 401 · stable error codes
│   ├── tokenStore.js                cookie-backed access (15 min) + refresh (7 day) pair
│   ├── authService.js               staff + customer sign-in, OTP, password reset
│   ├── riskService.js               POST /risk/score · /risk/score-batch
│   ├── quotationsService.js         CRUD, lines, stage moves, comments, sharing
│   ├── approvalsService.js          queue, approve, reject, return
│   ├── fulfillmentService.js        suggested split, override, accept, backorders
│   ├── billingService.js            schedules, proration, cancellation
│   ├── invoicesService.js           issue, send, record payment, credit notes
│   ├── customerPortalService.js     the buyer-facing surface
│   ├── productsService.js           catalog + price lists
│   ├── warehousesService.js         warehouses + stock
│   ├── subscriptionPlansService.js  plans and plan products
│   ├── upsellService.js             upsell rules and suggestions
│   ├── customersService.js          customer records + tier changes
│   ├── usersService.js              directory, roles, teams
│   ├── configService.js             tier / category ceilings, approval rules
│   ├── dashboardService.js          KPIs and deal-health alerts
│   ├── reportsService.js            reporting endpoints
│   └── healthService.js             liveness / readiness
│
├── store/
│   ├── useAppStore.js               Zustand root — caches of server responses,
│   │                                empty until the API answers
│   ├── selectors.js                 derived reads (totals, badges, permissions)
│   └── slices/
│       ├── authSlice.js             two identity spaces: staff and customer
│       ├── quotationSlice.js        quotations, lines, stage machine
│       ├── riskSlice.js             riskCache · refreshRisk · ensureRisk · batching
│       ├── billingSlice.js          schedules and occurrences
│       ├── fulfillmentSlice.js      split plans, allocations, backorders
│       ├── catalogSlice.js          products, price lists, warehouses, plans
│       ├── customerSlice.js         customer records and the portal view
│       ├── configSlice.js           ceilings and approval rules
│       ├── dashboardSlice.js        KPIs and alerts
│       ├── directorySlice.js        users, roles, teams
│       ├── auditSlice.js            platform log + per-entity trail
│       └── notificationSlice.js     in-app notifications, unread count
│
├── lib/                             ── PURE, REACT-FREE HELPERS ──
│   ├── riskEngine.js                risk BANDS + labels (presentation only)
│   ├── pricing.js                   line/order rollups, tier pricing, margin impact
│   ├── warehouseSplit.js            allocation display, override validation
│   ├── billingEngine.js             schedule, proration, cancellation presentation
│   ├── upsellEngine.js              suggestion ranking with margin floors
│   ├── anomalyEngine.js             the four deal-health alert types
│   ├── stageMachine.js              transition table + canTransition guard
│   ├── customerView.js              allow-list projection for the portal
│   ├── exporters.js                 PDF / XLSX export builders
│   ├── openPdf.js                   blob → viewer handoff
│   ├── format.js                    currency, percent, date formatting
│   ├── validate.js                  shared field validators
│   ├── passwordPolicy.js            password strength rules
│   ├── notify.js                    toast helpers
│   └── utils.js                     cn() and small shared utilities
│
├── hooks/
│   ├── useRisk.js                   fetch + cache a quotation's risk score
│   ├── useQuotation.js              load one quotation with all its relations
│   ├── useUpsell.js                 suggestions for the open quote
│   ├── useCustomerQuotes.js         the portal's quotation list
│   └── useBlendedPreview.js         live re-score preview while editing
│
├── guards/
│   └── Guards.jsx                   RequireStaffAuth · RequireCustomerAuth ·
│                                    RequireRole · RedirectIfAuthenticated
│
├── layouts/
│   ├── MarketingLayout.jsx          public pages
│   ├── WorkspaceLayout.jsx          staff shell — nav, notifications, user menu
│   ├── BackendLayout.jsx            back-office configuration shell
│   └── CustomerLayout.jsx           portal shell — imports NOTHING from the workspace
│
├── pages/
│   ├── Landing.jsx                  marketing page + interactive risk demo
│   ├── Login.jsx                    staff sign-in
│   ├── Signup.jsx                   staff self-registration
│   ├── ForgotPassword.jsx           OTP-based reset
│   ├── ErrorPages.jsx               403 / 404
│   │
│   ├── workspace/                   ── STAFF ──
│   │   ├── Dashboard.jsx            KPIs + deal-health alerts
│   │   ├── Pipeline.jsx             kanban board with stage guards
│   │   ├── Quotations.jsx           list, filter, search
│   │   ├── NewQuotation.jsx         create flow
│   │   ├── QuotationBuilder.jsx     lines, discounts, ceilings, upsell
│   │   ├── QuotationApproval.jsx    per-line risk breakdown
│   │   ├── Approvals.jsx            the approver's queue
│   │   ├── QuotationFulfillment.jsx warehouse split + backorders
│   │   ├── QuotationBilling.jsx     one-time vs recurring, schedule
│   │   ├── QuotationInvoice.jsx     issue, send, record payment
│   │   └── Reports.jsx              reporting and export
│   │
│   ├── backend/                     ── BACK-OFFICE CONFIGURATION ──
│   │   ├── Products.jsx             catalog + price lists
│   │   ├── DiscountTiers.jsx        tier/category ceilings + risk sandbox
│   │   ├── Warehouses.jsx           warehouses and stock
│   │   ├── Subscriptions.jsx        plans, proration, cancellation rules
│   │   ├── UpsellRules.jsx          rules, promotion, margin floors
│   │   ├── Directory.jsx            users, roles, teams (READ-ONLY by design)
│   │   └── AuditLog.jsx             the platform audit trail
│   │
│   └── customer/                    ── CUSTOMER PORTAL ──
│       ├── CustomerLogin.jsx
│       ├── CustomerSignup.jsx       includes the claim-existing-account path
│       ├── CustomerQuotations.jsx
│       ├── CustomerQuotationDetail.jsx   counter-offer + confirm
│       └── CustomerConfirmed.jsx
│
├── components/
│   ├── ui/                          Badge · Button · Dialog · Input · Loading ·
│   │                                Misc · MultiSelect · NumberField · Table · Tabs
│   ├── shared/                      AuditTrailList · ConnectionBanner · Dialogs ·
│   │                                Indicators · Logo · PageHeader · RiskGauge ·
│   │                                StepProgress
│   ├── quotation/                   CatalogPanel · ConsolidationWatcher ·
│   │                                CustomerEmailLookup · CustomerRequestsDrawer ·
│   │                                OrderLinesTable · QuoteLoading · QuoteNav ·
│   │                                QuoteSummaryRail · RiskBreakdownTable ·
│   │                                SplitPlanner · UpsellPanel · WarehouseSplitTable
│   ├── auth/                        AuthShell · ChangePasswordDialog ·
│   │                                OtpVerification · PasswordField
│   ├── customer/                    ChatThread (negotiation messages)
│   ├── landing/                     RiskEngineDemo (interactive scorer)
│   └── glass/                       Glass (glassmorphism surface primitive)
│
├── data/seed/                       legacy static fixtures — REFERENCE ONLY.
│                                    Nothing in the running app reads them.
│                                    auditLog · customers · discountConfig · invoices ·
│                                    priceLists · products · quotations ·
│                                    subscriptionPlans · upsellRules · users · warehouses
│
└── styles/
    └── globals.css                  Tailwind entry + CSS custom properties
```

---

## 5. Architecture

### 5.1 Data Flow

```
   component
       │  reads via src/store/selectors.js
       ▼
     hook  (useRisk · useQuotation · useUpsell · …)
       │
       ▼
  store action  (src/store/slices/*.js)
       │
       ▼
  services/*.js  ──▶  apiClient.js  ──▶  API
                      · attaches the access token
                      · applies the timeout
                      · single-flight refresh on 401
                      · unwraps { success, data }
                      · throws ApiError with a stable code
       │
       ▼
  slice caches the response  ──▶  components re-render
```

### 5.2 The Service Layer

- **One module per API area**, each mirroring a section of the
  [API reference](../backend/docs/API-REFERENCE.md).
- `apiClient.js` unwraps the response envelope on success and throws an `ApiError`
  carrying the server's `code` on failure — callers branch on a **stable code**, never on a
  message string.
- Timeouts are validated, not trusted: a malformed `VITE_API_TIMEOUT_MS` becomes `NaN`,
  and `setTimeout(fn, NaN)` fires on the next tick and aborts every request. The value must
  be finite and above a floor before it is used.

### 5.3 State Management

- **12 Zustand slices** composed into one store — no provider tree, no context plumbing.
- Collections are **caches**, not a database. They start empty and are filled by loaders.
- **Every mutation goes through a store action**, and the API writes an audit entry with
  actor, timestamp and reason for every business-state change.
- Persistence: the **session** survives a refresh through the token cookies. Store data does
  not — stale rows on refresh, and a signed-out user's data left readable, are both worse
  than a refetch.

### 5.4 The lib Layer

Everything in `src/lib/` is **pure and React-free** — no hooks, no imports from `store/` or
`components/`. That is what makes each file testable in isolation and portable to Node.

---

## 6. Routing

Defined in a single table, [`src/routes.jsx`](src/routes.jsx).

| # | Surface | Routes | Guard |
|:--|:--|:--|:--|
| 1 | **Marketing** | `/` · `/login` · `/signup` · `/forgot-password` | `RedirectIfAuthenticated` |
| 2 | **Staff workspace** | `/app/dashboard` · `/app/pipeline` · `/app/quotations` · `/app/quotations/new` · `/app/quotations/:id` · `/app/quotations/:id/approval` · `/app/quotations/:id/fulfillment` · `/app/quotations/:id/billing` · `/app/quotations/:id/invoice` · `/app/approvals` · `/app/reports` | `RequireStaffAuth` |
| 3 | **Back-office** | `/app/backend/products` · `/discount-tiers` · `/warehouses` · `/subscriptions` · `/upsell-rules` · `/directory` · `/audit-log` | `RequireStaffAuth` + `RequireRole` |
| 4 | **Customer portal** | `/customer/login` · `/customer/signup` · `/customer/quotations` · `/customer/quotations/:id` · `/customer/quotations/:id/confirmed` | `RequireCustomerAuth` |
| 5 | **Errors** | `/403` · `/404` · `*` | — |

---

## 7. Authentication & Identity

### 7.1 Staff vs Customer

Staff and customers are **completely distinct**: different routes, different sign-up forms,
different sessions. Signing into one clears the other, so nobody can hold both at once.

| | Staff | Customer |
|:--|:--|:--|
| **Sign in** | `/login` | `/customer/login` |
| **Sign up** | `/signup` | `/customer/signup` |
| **Home** | `/app/dashboard` | `/customer/quotations` |
| **Layout** | `WorkspaceLayout` | `CustomerLayout` |
| **Guard** | `RequireStaffAuth` | `RequireCustomerAuth` |
| **API `type`** | `"internal"` | `"customer"` |

`CustomerLayout` and everything under `src/pages/customer/` import **nothing** from the
workspace. That isolation is what makes the customer area a genuinely separate restricted
surface rather than an internal screen with different labels — and the API enforces the same
split with its own guards, so the projection is not merely cosmetic.

### 7.2 Token Handling

- The access/refresh pair lives in **cookies** ([`src/services/tokenStore.js`](src/services/tokenStore.js)),
  so the session is shared across tabs of the same origin and the browser expires each token.
- **Access token: 15 minutes. Refresh token: 7 days.**
- Refresh **rotates** — the old refresh token is revoked, and replaying it kills every
  session. `apiClient` therefore makes refresh **single-flight**: two concurrent 401s await
  the same promise instead of burning the rotated token.

### 7.3 Nobody Provisions Accounts

Accounts exist **only** through self-registration. Not even an Admin can provision a user;
`/app/backend/directory` is read-only.

- Every account is traceable to a person who consented to it.
- The whole class of privilege-escalation bugs that comes with admin-provisioned users
  disappears.
- **The one exception is pricing tier** — commercial configuration, not account data. New
  customers start at Bronze, and only a Sales Manager or Admin can promote them, because
  tier decides the price list *and* the discount ceiling every line is measured against.

---

## 8. Risk Scoring

The UI does not decide a discount risk score or an approval route. **It asks the API and
renders the answer.**

```
component → useRisk(quoteId) → riskSlice.refreshRisk()
                                       │
                                       ▼
                            services/riskService.js
                                       │
                                       ▼
                POST /risk/score   ·   POST /risk/score-batch
```

### 8.1 Why There Is No Local Fallback

A risk score decides **who has to approve a discount**. A number the client invented is
worse than no number: the approval chain resolved from it would not match what the server
would have demanded, so a quotation could route to one approver on screen and another in the
database.

- When scoring fails, the UI **shows the error**, not a guess.
- `src/lib/riskEngine.js` is still imported — but **only** for band thresholds and labels.
  That is presentation, not arithmetic. The score, the overage, the breakdown and the
  approver list all come from the response.

### 8.2 The Formula

Every line is checked against **its own ceiling** — the stricter of its product category's
limit and the customer tier's limit — then overages are weighted by **gross line value**:

```
score = Σ (line value × points over ceiling) ÷ Σ line value
```

A ₹1,000 line inside its ceiling and a ₹2,000 line 8 points over:

```
(1000 × 0  +  2000 × 8) ÷ (1000 + 2000)  =  16,000 ÷ 3,000  =  5.33 points
```

Two independent triggers:

1. **Blended score** — catches many lines each only 2–3 points over. Individually
   unremarkable, collectively a real margin give-away.
2. **Single-line trip** — force-escalates one badly-over line even when the blend looks
   mild.

When several rules match, whichever demands **more** approvers wins — routing never goes
down. The interactive version runs on the landing page and in the back-office risk sandbox.

### 8.3 Caching & Batching

- Scores are cached in `riskCache`, keyed by a **fingerprint of the scoring inputs**, so a
  stale answer refetches automatically when a line or a ceiling changes.
- Lists and boards use **one batched request** rather than one per row.
- Actions that must not act on a stale number — submitting for approval, customer
  confirmation — call `ensureRisk()` and **await a fresh score** first.
- Scores are deliberately **not persisted** across reloads; they belong to the server and
  are refetched on boot.

---

## 9. Roles & Permissions

| # | Action | Sales Rep | Sales Manager | Finance | Admin |
|:--|:--|:---:|:---:|:---:|:---:|
| 1 | Build quotations, apply discounts | ● | ● | | ● |
| 2 | Assign a quotation to a customer | ● | ● | | ● |
| 3 | Reassign the owning rep | | ● | | ● |
| 4 | Approve at the manager step | | ● | | ● |
| 5 | Approve at the finance step | | | ● | ● |
| 6 | Accept / override warehouse split | ● | ● | ● | ● |
| 7 | **Issue an invoice** | | | ● | ● |
| 8 | **Record a payment** | | | ● | ● |
| 9 | Promote a customer's tier | | ● | | ● |
| 10 | Back-office configuration | | ● | ● | ● |
| 11 | Create an account for someone else | — | — | — | — |

**Why payments are restricted:** whoever sold the deal is not the person who confirms the
cash arrived. A rep viewing an invoice sees the balance and a clear explanation of why the
form is locked, not a dead button. Every payment records who confirmed it, and the invoice
must be issued before a payment can be logged against it.

The per-endpoint matrix is
[§22 of the API reference](../backend/docs/API-REFERENCE.md#22-role-permission-matrix).

---

## 10. Demo Accounts

Accounts come from the backend seed (`cd backend && npm run seed`), which sets
**`Passw0rd!2026`** on every account.

**Staff** — sign in at `/login`:

| # | Role | Email | Password |
|:--|:--|:--|:--|
| 1 | Admin | `admin@teamvector.co` | `Cloud123@` |
| 2 | Sales Manager | `anita@teamvector.co` | `Passw0rd!2026` |
| 3 | Finance | `vikram@teamvector.co` | `Passw0rd!2026` |
| 4 | Sales Rep | `priya@teamvector.co` | `Passw0rd!2026` |
| 5 | Sales Rep | `rahul@teamvector.co` | `Passw0rd!2026` |
| 6 | Sales Rep | `kiran@teamvector.co` | `Passw0rd!2026` |

**Customers** — sign in at `/customer/login`:

| # | Company | Email | Tier |
|:--|:--|:--|:--|
| 1 | Acme Corp | `buyer@acme.teamvector.co` | gold |
| 2 | Beta Industries | `buyer@beta.teamvector.co` | silver |
| 3 | Cygnus Retail | `buyer@cygnus.teamvector.co` | bronze |
| 4 | Forge Analytics | `buyer@forge.teamvector.co` | gold |

The full table, including what each role can do that others cannot, is in the
[project README](../README.md#61-staff-accounts).

---

## 11. Demo Script

**1. Back-office configuration**
   - Sign in as **Admin** → *Go to Back-end*.
   - Gold tier caps at 15%, Services at 10%, three warehouses, subscription plans.
   - The **risk sandbox** on the discount screen exercises the live scoring endpoint.

**2. Build a quotation**
   - Switch to **Sales Rep** → open an Acme Corp quote.
   - `Laptop Pro 14 × 8 @ 12%` (fine) and `Onboarding Setup Service @ 18%` (over its 10%
     ceiling — the hint turns red).

**3. Approval routes itself**
   - The primary button reads **"Send for Manager Approval"**, decided by the fetched score.
   - There is no manual request step — the rep never picks the approver.

**4. Accept an upsell**
   - Open **Suggestions** and add the promoted docking station.
   - Total, margin and risk update immediately.

**5. Approve, then split**
   - As **Sales Manager**, the per-line breakdown shows the service line 8 points over.
   - Approve → **Fulfillment** auto-suggests a split across two warehouses.

**6. Hybrid billing**
   - Accept the split → **Billing**.
   - One-time and recurring lines in separate sections with their own totals and a
     12-occurrence schedule.

**7. Customer negotiation**
   - New tab → `/customer/login` as the Cygnus Retail buyer.
   - Submit a **25% counter-discount** and confirm.
   - Bronze caps at 5%, so the terms are re-scored and the quote **automatically re-enters
     approval** with the audit reason *"Re-approval triggered by customer-negotiated terms"*.

**8. Invoice and payment**
   - Back in the staff tab, approve.
   - As a **Sales Rep**, open **Invoice** — the payment form is locked with an explanation.
   - Switch to **Finance** → *Send Invoice* → *Record Payment*.
   - Pay part to reach **Partially Paid**, then the rest to reach **Paid**, which moves the
     order to **Confirmed**.

### Also worth showing

- **Deal Health** — four live alert types: a stalled deal, a discount anomaly (a rep well
  above their own baseline), an approval bottleneck, and delivery slippage from an open
  backorder.
- **Auto-approve** — a quote with every line inside its ceiling has an empty approval chain.
- **Backorder consolidation** — a quote short on stock → *Simulate Restock* → a
  consolidation prompt with the shipment and the cost saving.
- **Kanban guards** — drag a Draft card to Billed; it snaps back with a toast explaining why.
- **Claim-account path** — a customer that exists commercially but has no login yet can
  register at `/customer/signup`; the signup attaches to the **existing** record instead of
  creating a duplicate, and their quotation history is immediately visible.

---

## 12. Deployment

Static SPA, no server runtime. Both configs carry the SPA rewrite, so deep links like
`/customer/quotations/Q-1042` don't 404 on a cold open.

| # | Platform | Root / base | Build command | Output | Config |
|:--|:--|:--|:--|:--|:--|
| 1 | **Vercel** | `Frontend` | `npm run build` | `dist` | [`vercel.json`](vercel.json) |
| 2 | **Netlify** | `Frontend` | `npm run build` | `dist` | [`netlify.toml`](netlify.toml) |

- Set `VITE_API_BASE_URL` in the platform's environment variables.
- Add the deployed frontend origin to the backend's **CORS allow-list**.

---

## 13. Roadmap

1. Approval **delegation** and out-of-office routing, so one absent approver can't stall the
   pipeline.
2. Co-purchase scores **learned from order history** instead of configured by hand.
3. **Multi-company** support and live FX rather than a maintained USD price book.
4. **Contract lifecycle** — renewals, uplift schedules, churn signals on the deal-health board.
5. **E-signature** on customer confirmation.
6. Remove `src/data/seed/` once nothing references it for shape documentation.

---

## 14. Team

### 👥 Team 413 — Team Vector

DealFlow360 is designed and developed by **Team Vector**.

| # | Team Member | Email | LinkedIn |
|:--|:--|:--|:--|
| 1 | **Tirth Patel** | <tirthpatel4822@gmail.com> | [linkedin.com/in/tirthpatel-7ab9ba264](https://www.linkedin.com/in/tirthpatel-7ab9ba264/) |
| 2 | **Parth Thakkar** | <parththakkar1208@gmail.com> | [linkedin.com/in/parth-thakkar-1812p5d](https://www.linkedin.com/in/parth-thakkar-1812p5d/) |
| 3 | **Neel Sheth** | <shethneel2022@gmail.com> | [linkedin.com/in/neel-sheth-91b362262](https://www.linkedin.com/in/neel-sheth-91b362262/) |
| 4 | **Ridham Rangani** | <ridhamrangani2004@gmail.com> | [linkedin.com/in/ridham-rangani](https://www.linkedin.com/in/ridham-rangani/) |

<div align="center">

**Odoo Hackathon 2026** · <https://teamvector.space>

**[⬆ Back to top](#dealflow360--frontend)**

</div>
