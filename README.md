<div align="center">

# DealFlow360

### An intelligent, self-governing sales operations platform

Quote → Risk Scoring → Approval Routing → Fulfillment → Billing → Invoice → Payment

**Team 413 · Team Vector** — Odoo Hackathon 2026

</div>

---

## 🔗 Links

| | Link |
|:--|:--|
| 🎥 **Demo Video** | **[Watch the demo](https://drive.google.com/drive/folders/1OEYiUbT9DnM4zff3vpSnvD0PoAuiY7Ic?usp=sharing)** |
| 🌐 **Live App** | **<https://dealflow360.teamvector.space/>** · <https://deal-flow360-team413.vercel.app> |
| ⚙️ **Live API** | **<https://api.dealflow360.teamvector.space/api/v1>** |
| 📖 **API Reference** | [`backend/docs/API-REFERENCE.md`](backend/docs/API-REFERENCE.md) — every endpoint, in one file |
| 🗂️ **DBML Diagram** | **[`backend/docs/schema.dbml`](backend/docs/schema.dbml)** |
| 🧩 **ER Diagrams** | **[§24 Data model](backend/docs/API-REFERENCE.md#24-data-model)** — 31 tables drawn per area, rendered inline on GitHub |
| 💻 **Frontend README** | [`Frontend/README.md`](Frontend/README.md) |
| 🖥️ **Backend README** | [`backend/README.md`](backend/README.md) |

---

## 👥 Team 413 — Team Vector

DealFlow360 is designed and developed by **Team Vector**.

| # | Team Member | Email | LinkedIn |
|:--|:--|:--|:--|
| 1 | **Tirth Patel** | <tirthpatel4822@gmail.com> | [linkedin.com/in/tirthpatel-7ab9ba264](https://www.linkedin.com/in/tirthpatel-7ab9ba264/) |
| 2 | **Parth Thakkar** | <parththakkar1208@gmail.com> | [linkedin.com/in/parth-thakkar-1812p5d](https://www.linkedin.com/in/parth-thakkar-1812p5d/) |
| 3 | **Neel Sheth** | <shethneel2022@gmail.com> | [linkedin.com/in/neel-sheth-91b362262](https://www.linkedin.com/in/neel-sheth-91b362262/) |
| 4 | **Ridham Rangani** | <ridhamrangani2004@gmail.com> | [linkedin.com/in/ridham-rangani](https://www.linkedin.com/in/ridham-rangani/) |

---

## 🔑 Demo Credentials

Sign in immediately with any of these. Staff use `"type": "internal"`, customers use
`"type": "customer"`.

| # | Role | Email | Password |
|:--|:--|:--|:--|
| 1 | **admin** | `admin@teamvector.co` | `Cloud123@` |
| 2 | **sales_manager** | `anita@teamvector.co` | `Passw0rd!2026` |
| 3 | **finance** | `vikram@teamvector.co` | `Passw0rd!2026` |
| 4 | **sales_rep** | `priya@teamvector.co` | `Passw0rd!2026` |
| 5 | **customer** | `buyer@acme.teamvector.co` | `Passw0rd!2026` |

> The complete account list — all six staff and all four customers, with what each role can
> do that the others cannot — is in **[§6 Demo Accounts](#6-demo-accounts)**.

---

## 📑 Table of Contents

| § | Section | What's inside |
|:--|:--|:--|
| **[1](#1-documentation)** | **Documentation** | API reference, DBML, ER diagrams, sub-project READMEs, Postman |
| **[2](#2-about-the-project)** | **About the Project** | The problem and how DealFlow360 solves it |
| [2.1](#21-the-problem) | The problem | Why discount governance breaks down |
| [2.2](#22-core-capabilities) | Core capabilities | The nine engines and where each lives |
| [2.3](#23-key-design-decisions) | Key design decisions | Server-authoritative scoring, no admin-provisioned users |
| **[3](#3-tech-stack)** | **Tech Stack** | Every library and why it is there |
| [3.1](#31-frontend-stack) | Frontend stack | React 18, Vite, Zustand, Tailwind, Radix |
| [3.2](#32-backend-stack) | Backend stack | Express 5, TypeScript, Drizzle, Neon, Upstash |
| [3.3](#33-infrastructure--tooling) | Infrastructure & tooling | Hosting, lint, format, migrations |
| **[4](#4-project-structure)** | **Project Structure** | Complete annotated file trees |
| [4.1](#41-repository-root) | Repository root | Top-level layout |
| [4.2](#42-frontend-file-structure) | Frontend file structure | Every folder and file in `Frontend/src` |
| [4.3](#43-backend-file-structure) | Backend file structure | Every folder and file in `backend/src` |
| [4.4](#44-architecture-layers) | Architecture layers | How a request flows end to end |
| **[5](#5-getting-started)** | **Getting Started** | Clone to running app |
| [5.1](#51-prerequisites) | Prerequisites | Node, accounts, tooling |
| [5.2](#52-backend-setup) | Backend setup | Install → env → schema → seed → run |
| [5.3](#53-frontend-setup) | Frontend setup | Install → env → run |
| [5.4](#54-environment-variables) | Environment variables | Both sides, and where credentials come from |
| **[6](#6-demo-accounts)** | **Demo Accounts** | Staff and customer logins |
| [6.1](#61-staff-accounts) | Staff accounts | Six roles, what each can do |
| [6.2](#62-customer-accounts) | Customer accounts | Four tiers |
| [6.3](#63-what-the-seed-creates) | What the seed creates | Deterministic dataset counts |
| **[7](#7-the-risk-engine)** | **The Risk Engine** | The formula and the routing rules |
| [7.1](#71-the-formula) | The formula | Value-weighted overage, worked example |
| [7.2](#72-the-two-triggers) | The two triggers | Blended score and single-line trip |
| [7.3](#73-approval-routing) | Approval routing | Score → approver chain |
| **[8](#8-roles--permissions)** | **Roles & Permissions** | Who can do what, and why |
| **[9](#9-api-reference)** | **API Reference** | Every endpoint, across 17 modules |
| [9.1](#91-module-breakdown) | Module breakdown | Endpoint counts per area |
| [9.2](#92-conventions) | Conventions | Envelope, auth, errors, rate limits |
| [9.3](#93-ways-to-exercise-the-api) | Ways to exercise the API | Tester, Postman, e2e |
| **[10](#10-data-model)** | **Data Model** | 31 tables, 19 enums, DBML |
| [10.1](#101-table-groups) | Table groups | What each cluster of tables holds |
| [10.2](#102-er-diagrams--dbml) | ER diagrams & DBML | The `.dbml` file vs the inline ER diagrams |
| **[11](#11-demo-script)** | **Demo Script** | The eight-step walkthrough |
| **[12](#12-testing--verification)** | **Testing & Verification** | Engine assertions and the e2e flow |
| **[13](#13-scripts-reference)** | **Scripts Reference** | Every npm script, both sides |
| **[14](#14-deployment)** | **Deployment** | Vercel / Netlify / Render |
| **[15](#15-branching-strategy)** | **Branching Strategy** | main, dev-*, prod-* |

---

## 1. Documentation

| # | Document | What it contains |
|:--|:--|:--|
| 1 | **[`backend/docs/API-REFERENCE.md`](backend/docs/API-REFERENCE.md)** | **The complete API reference** — every endpoint across 17 modules, with request/response shapes, required roles and error codes |
| 2 | **[`backend/docs/schema.dbml`](backend/docs/schema.dbml)** | **The DBML diagram** — the complete schema as a standalone file. Paste it into [dbdiagram.io](https://dbdiagram.io/d) for an interactive, laid-out ER view |
| 3 | **[§24 — Data model](backend/docs/API-REFERENCE.md#24-data-model)** | **ER diagrams** — the same 31 tables drawn per area, rendered inline on GitHub |
| 4 | **[`Frontend/README.md`](Frontend/README.md)** | **Frontend README** — setup, architecture, service layer, state, screens |
| 5 | **[`backend/README.md`](backend/README.md)** | **Backend README** — setup, environment, module map, scripts |
| 6 | [§18 — Enumerations](backend/docs/API-REFERENCE.md#18-enumerations) | Every enum value the API accepts and returns |
| 7 | [§19 — Error catalogue](backend/docs/API-REFERENCE.md#19-error-catalogue) | Every stable error code |
| 8 | [§20 — Transactional emails](backend/docs/API-REFERENCE.md#20-transactional-emails) | What triggers each email |
| 9 | [§22 — Role permission matrix](backend/docs/API-REFERENCE.md#22-role-permission-matrix) | Per-endpoint role requirements |
| 10 | [§23 — Endpoint index](backend/docs/API-REFERENCE.md#23-endpoint-index) | Numbered index of every endpoint |
| 11 | [`backend/postman/`](backend/postman) | Importable Postman collection + local environment |

---

## 2. About the Project

### 2.1 The Problem

Discounting is where B2B margin quietly disappears. The failure is rarely one outrageous
discount — it is:

- **Many small overages.** Ten lines each 2–3 points over their ceiling look harmless
  individually and are a serious give-away in aggregate.
- **Ceilings that depend on two things at once.** A discount is only acceptable relative to
  *both* the product category *and* the customer's pricing tier — whichever is stricter.
- **Approval routing decided by humans.** If a rep chooses who approves, the rep chooses
  the easiest approver.
- **A negotiation that escapes governance.** The moment a customer counters, the terms that
  were approved are no longer the terms on the table.

**DealFlow360 makes the system decide.** Every line is scored against its own ceiling, the
score picks the approval chain, and a customer counter-offer re-scores and re-routes the
quotation automatically.

### 2.2 Core Capabilities

| # | Capability | What it does | Where the logic lives |
|:--|:--|:--|:--|
| 1 | **Discount governance** | Every line measured against the stricter of its category ceiling and the customer's tier ceiling | `backend/src/lib/risk.ts` |
| 2 | **Blended risk scoring** | Line overages weighted by gross line value, plus a single-line force-escalation trip | `backend/src/lib/risk.ts` |
| 3 | **Automatic approval routing** | The score decides: auto-approve, manager, finance, or both | `backend/src/modules/approvals/` |
| 4 | **Multi-warehouse fulfillment** | Allocation across stocked warehouses, override validation, backorders, consolidation | `backend/src/lib/allocation.ts` |
| 5 | **Hybrid billing** | One-time and recurring lines on one quote; proration and cancellation rules per plan | `backend/src/lib/billing-math.ts` |
| 6 | **Invoices & payments** | Issue, part-pay, credit-note — only finance and admin can record cash | `backend/src/modules/invoices/` |
| 7 | **Customer portal** | A separate identity space; the buyer sees an allow-listed projection and can counter-offer | `backend/src/modules/portal/` |
| 8 | **Upsell suggestions** | Ranked recommendations with margin floors | `backend/src/modules/upsell/` |
| 9 | **Deal health** | Stalled deals, discount anomalies, approval bottlenecks, delivery slippage | `backend/src/modules/dashboard/` |
| 10 | **Audit trail** | Every business-state mutation records actor, timestamp and reason | `backend/src/lib/audit.ts` |

### 2.3 Key Design Decisions

- **Risk scoring is server-authoritative, with no client fallback.**
  The frontend never computes a score. It posts the quotation and renders the answer.
  A score decides the approval chain — a number the client invented would route the quote
  to one approver on screen and a different one in the database. When scoring fails, the UI
  shows the error, not a guess.

- **Nobody can create an account for anyone else — not even the admin.**
  Accounts exist only through self-registration; `/app/backend/directory` is read-only.
  Every account is traceable to a person who consented to it, and the whole class of
  privilege-escalation bugs that comes with admin-provisioned users disappears. The first
  admin is planted by a CLI script, which is what keeps the `admin` role unreachable
  through the API.

- **Pricing tier is commercial configuration, never self-selected.**
  New customers start at Bronze. Only a Sales Manager or Admin can promote them, because
  tier decides the price list *and* the discount ceiling every line is measured against.

- **Derived, never stored.**
  Totals, margins, approval requirements and invoice balances are recomputed from
  primitives rather than cached onto the quotation, so a badge can never disagree with the
  table beside it.

- **Whoever sold the deal does not confirm the cash.**
  Payment recording is restricted to finance and admin. A rep sees the balance and an
  explanation of why the form is locked — not a dead button.

- **The frontend holds no business database.**
  Store collections start empty and each screen shows a loading or empty state until its
  loader resolves. Fabricated rows are never rendered, not even for a few hundred
  milliseconds.

---

## 3. Tech Stack

### 3.1 Frontend Stack

| Concern | Choice | Why |
|:--|:--|:--|
| **Framework** | React 18.3 (plain JavaScript) | No TypeScript build step in the UI layer |
| **Build tool** | Vite 5.2 | Instant HMR, fast production builds |
| **Routing** | React Router 6.23 | One declarative route table in `src/routes.jsx` |
| **State** | Zustand 4.5 | 12 composed slices, no provider tree, no boilerplate |
| **Styling** | Tailwind CSS 3.4 | With `tailwind-merge` + `clsx` for conflict-free class composition |
| **UI primitives** | Radix UI | Accessible dialog, dropdown, popover, select, slider, switch, tabs, tooltip, progress |
| **Tables** | TanStack Table 8.17 | Headless sorting, filtering, pagination |
| **Charts** | Recharts 2.12 | Dashboard and report visuals |
| **Drag & drop** | dnd-kit 6.1 | The pipeline kanban board |
| **Forms** | React Hook Form 7.51 | Uncontrolled inputs, minimal re-renders |
| **Animation** | Framer Motion 11.2 | Page and panel transitions |
| **Notifications** | Sonner 1.5 | Toasts |
| **Icons** | lucide-react 0.395 | Consistent icon set |
| **Export** | jsPDF 2.5 + autotable, SheetJS `xlsx` 0.18 | PDF and Excel export |
| **Dates** | date-fns 3.6 | Formatting and relative time |
| **Auth transport** | Cookie-stored rotating JWT pair | Shared across tabs; the browser expires each token |

### 3.2 Backend Stack

| Concern | Choice | Why |
|:--|:--|:--|
| **Runtime** | Node.js 20+ (ESM) | Native modules, top-level await |
| **Language** | TypeScript 5.9 (strict) | Types enforced at every layer boundary |
| **HTTP framework** | Express 5.1 | Async error propagation built in |
| **Database** | Neon serverless Postgres | Pooled HTTP connections, no idle cost |
| **ORM** | Drizzle ORM 0.45 | Typed SQL, no runtime query builder magic |
| **Migrations** | drizzle-kit 0.31 | Generated SQL + snapshots in `backend/drizzle/` |
| **Cache & rate limits** | Upstash Redis (REST) | HTTP API, works on serverless hosts |
| **Email** | Resend 6.2 | Transactional email and OTP delivery |
| **PDF generation** | PDFKit 0.20 | Quotation and invoice documents |
| **Document hosting** | Cloudinary 2.11 *(optional)* | Without it, PDFs stream back directly |
| **Validation** | Zod 4.1 | Every request body, query and param |
| **Auth** | `jsonwebtoken` 9 | 15-minute access token, 7-day rotating refresh |
| **Logging** | Pino 9 + pino-http 10 | Structured JSON logs, pretty in dev |
| **Security** | Helmet 8, CORS allow-list, compression | Standard hardening at the app layer |

### 3.3 Infrastructure & Tooling

| Concern | Frontend | Backend |
|:--|:--|:--|
| **Hosting** | Vercel / Netlify (static SPA) | Render / Railway (Node 20) |
| **Lint** | ESLint 8 + react, hooks, jsx-a11y, refresh | ESLint 10 + typescript-eslint |
| **Format** | Prettier 3 + tailwindcss plugin | Prettier 3 |
| **Dev server** | `vite` | `tsx watch` |
| **Type checking** | — (JSDoc + jsconfig paths) | `tsc --noEmit` |
| **Path alias** | `@/*` → `src/*` | `.js` ESM specifiers |

---

## 4. Project Structure

### 4.1 Repository Root

```
Odoo_final/
│
├── README.md                        ← you are here — the whole-project guide
│
├── Frontend/                        React 18 + Vite SPA
└── backend/                         Express 5 + TypeScript REST API
```

### 4.2 Frontend File Structure

```
Frontend/
│
├── index.html                       SPA shell + SEO/OG meta
├── package.json                     scripts and dependencies
├── vite.config.js                   build config + @/ path alias
├── tailwind.config.js               design tokens, theme extension
├── postcss.config.js                autoprefixer pipeline
├── jsconfig.json                    editor path resolution
├── .eslintrc.cjs                    lint rules (zero-warning policy)
├── .prettierrc                      format rules
├── .env.example                     documented environment variables
├── vercel.json                      SPA rewrite for Vercel
├── netlify.toml                     build + SPA redirect for Netlify
│
├── public/                          favicons, apple-touch-icon, site.webmanifest
├── dist/                            production build output (generated)
│
└── src/
    │
    ├── main.jsx                     React root, mounts <App/>
    ├── App.jsx                      providers, toaster, error boundary
    ├── routes.jsx                   THE route table — marketing, staff, back-office, portal
    │
    ├── services/                    ── THE ONLY PLACE fetch() HAPPENS ──
    │   ├── apiClient.js             base URL · { success, data } unwrapping · timeouts
    │   │                            single-flight token refresh on 401 · stable error codes
    │   ├── tokenStore.js            cookie-backed access (15 min) + refresh (7 day) pair
    │   ├── authService.js           staff + customer sign-in, OTP, password reset
    │   ├── riskService.js           POST /risk/score · /risk/score-batch (no local fallback)
    │   ├── quotationsService.js     CRUD, lines, stage moves, comments, sharing
    │   ├── approvalsService.js      queue, approve, reject, return
    │   ├── fulfillmentService.js    suggested split, override, accept, backorders
    │   ├── billingService.js        schedules, proration, cancellation
    │   ├── invoicesService.js       issue, send, record payment, credit notes
    │   ├── customerPortalService.js the buyer-facing surface
    │   ├── productsService.js       catalog + price lists
    │   ├── warehousesService.js     warehouses + stock
    │   ├── subscriptionPlansService.js
    │   ├── upsellService.js         upsell rules and suggestions
    │   ├── customersService.js      customer records + tier changes
    │   ├── usersService.js          directory, roles, teams
    │   ├── configService.js         tier / category ceilings, approval rules
    │   ├── dashboardService.js      KPIs and deal-health alerts
    │   ├── reportsService.js        reporting endpoints
    │   └── healthService.js         liveness / readiness
    │
    ├── store/
    │   ├── useAppStore.js           Zustand root — caches of server responses,
    │   │                            empty until the API answers
    │   ├── selectors.js             derived reads (totals, badges, permissions)
    │   └── slices/
    │       ├── authSlice.js         two identity spaces: staff and customer
    │       ├── quotationSlice.js    quotations, lines, stage machine
    │       ├── riskSlice.js         riskCache, refreshRisk, ensureRisk, batching
    │       ├── billingSlice.js      schedules and occurrences
    │       ├── fulfillmentSlice.js  split plans, allocations, backorders
    │       ├── catalogSlice.js      products, price lists, warehouses, plans
    │       ├── customerSlice.js     customer records and the portal view
    │       ├── configSlice.js       ceilings and approval rules
    │       ├── dashboardSlice.js    KPIs and alerts
    │       ├── directorySlice.js    users, roles, teams
    │       ├── auditSlice.js        platform log + per-entity trail
    │       └── notificationSlice.js in-app notifications, unread count
    │
    ├── lib/                         ── PURE, REACT-FREE HELPERS ──
    │   ├── riskEngine.js            risk BANDS + labels (presentation only)
    │   ├── pricing.js               line/order rollups, tier pricing, margin impact
    │   ├── warehouseSplit.js        allocation display, override validation
    │   ├── billingEngine.js         schedule, proration, cancellation presentation
    │   ├── upsellEngine.js          suggestion ranking with margin floors
    │   ├── anomalyEngine.js         the four deal-health alert types
    │   ├── stageMachine.js          transition table + canTransition guard
    │   ├── customerView.js          allow-list projection for the portal
    │   ├── exporters.js             PDF / XLSX export builders
    │   ├── openPdf.js               blob → viewer handoff
    │   ├── format.js                currency, percent, date formatting
    │   ├── validate.js              shared field validators
    │   ├── passwordPolicy.js        password strength rules
    │   ├── notify.js                toast helpers
    │   └── utils.js                 cn() and small shared utilities
    │
    ├── hooks/
    │   ├── useRisk.js               fetch + cache a quotation's risk score
    │   ├── useQuotation.js          load one quotation with all its relations
    │   ├── useUpsell.js             suggestions for the open quote
    │   ├── useCustomerQuotes.js     the portal's quotation list
    │   └── useBlendedPreview.js     live re-score preview while editing
    │
    ├── guards/
    │   └── Guards.jsx               RequireStaffAuth · RequireCustomerAuth ·
    │                                RequireRole · RedirectIfAuthenticated
    │
    ├── layouts/
    │   ├── MarketingLayout.jsx      public pages
    │   ├── WorkspaceLayout.jsx      staff shell — nav, notifications, user menu
    │   ├── BackendLayout.jsx        back-office configuration shell
    │   └── CustomerLayout.jsx       portal shell — imports nothing from the workspace
    │
    ├── pages/
    │   ├── Landing.jsx              marketing page + interactive risk demo
    │   ├── Login.jsx                staff sign-in
    │   ├── Signup.jsx               staff self-registration
    │   ├── ForgotPassword.jsx       OTP-based reset
    │   ├── ErrorPages.jsx           403 / 404
    │   │
    │   ├── workspace/               ── STAFF ──
    │   │   ├── Dashboard.jsx        KPIs + deal-health alerts
    │   │   ├── Pipeline.jsx         kanban board with stage guards
    │   │   ├── Quotations.jsx       list, filter, search
    │   │   ├── NewQuotation.jsx     create flow
    │   │   ├── QuotationBuilder.jsx lines, discounts, ceilings, upsell
    │   │   ├── QuotationApproval.jsx per-line risk breakdown
    │   │   ├── Approvals.jsx        the approver's queue
    │   │   ├── QuotationFulfillment.jsx warehouse split + backorders
    │   │   ├── QuotationBilling.jsx one-time vs recurring, schedule
    │   │   ├── QuotationInvoice.jsx issue, send, record payment
    │   │   └── Reports.jsx          reporting and export
    │   │
    │   ├── backend/                 ── BACK-OFFICE CONFIGURATION ──
    │   │   ├── Products.jsx         catalog + price lists
    │   │   ├── DiscountTiers.jsx    tier/category ceilings + risk sandbox
    │   │   ├── Warehouses.jsx       warehouses and stock
    │   │   ├── Subscriptions.jsx    plans, proration, cancellation rules
    │   │   ├── UpsellRules.jsx      rules, promotion, margin floors
    │   │   ├── Directory.jsx        users, roles, teams (READ-ONLY by design)
    │   │   └── AuditLog.jsx         the platform audit trail
    │   │
    │   └── customer/                ── CUSTOMER PORTAL ──
    │       ├── CustomerLogin.jsx
    │       ├── CustomerSignup.jsx   includes the claim-existing-account path
    │       ├── CustomerQuotations.jsx
    │       ├── CustomerQuotationDetail.jsx  counter-offer + confirm
    │       └── CustomerConfirmed.jsx
    │
    ├── components/
    │   ├── ui/                      Badge · Button · Dialog · Input · Loading ·
    │   │                            Misc · MultiSelect · NumberField · Table · Tabs
    │   ├── shared/                  AuditTrailList · ConnectionBanner · Dialogs ·
    │   │                            Indicators · Logo · PageHeader · RiskGauge ·
    │   │                            StepProgress
    │   ├── quotation/               CatalogPanel · ConsolidationWatcher ·
    │   │                            CustomerEmailLookup · CustomerRequestsDrawer ·
    │   │                            OrderLinesTable · QuoteLoading · QuoteNav ·
    │   │                            QuoteSummaryRail · RiskBreakdownTable ·
    │   │                            SplitPlanner · UpsellPanel · WarehouseSplitTable
    │   ├── auth/                    AuthShell · ChangePasswordDialog ·
    │   │                            OtpVerification · PasswordField
    │   ├── customer/                ChatThread (negotiation messages)
    │   ├── landing/                 RiskEngineDemo (interactive scorer)
    │   └── glass/                   Glass (glassmorphism surface primitive)
    │
    ├── data/seed/                   legacy static fixtures — reference only.
    │                                Nothing in the running app reads them.
    │                                auditLog · customers · discountConfig · invoices ·
    │                                priceLists · products · quotations ·
    │                                subscriptionPlans · upsellRules · users · warehouses
    │
    └── styles/
        └── globals.css              Tailwind entry + CSS custom properties
```

### 4.3 Backend File Structure

```
backend/
│
├── package.json                     scripts and dependencies
├── tsconfig.json                    strict TypeScript config
├── drizzle.config.ts                migration + studio configuration
├── eslint.config.js                 flat ESLint config
├── .prettierrc                      format rules
├── .nvmrc                           Node 20
├── .env.example                     every variable, documented
│
├── docs/
│   ├── API-REFERENCE.md             ★ every endpoint + 31-table data model + ER diagrams
│   └── schema.dbml                  ★ the DBML diagram — paste into dbdiagram.io
│
├── postman/
│   ├── DealFlow360.postman_collection.json        every endpoint
│   └── DealFlow360.local.postman_environment.json localhost variables
│
├── drizzle/                         generated migrations
│   ├── 0000_auth_tables.sql
│   ├── 0001_drop_user_team.sql
│   ├── 0002_tier_config.sql
│   ├── 0003_customer_id.sql
│   ├── 0004_full_platform.sql
│   ├── 0005_seed_config.sql
│   ├── 0006_fk_indexes.sql
│   └── meta/                        snapshots + journal
│
├── public/                          dev-only browser API tester
│   ├── index.html                   served at / when NODE_ENV != production
│   └── app.js
│
└── src/
    │
    ├── server.ts                    bootstrap + graceful shutdown
    ├── app.ts                       Express assembly: helmet, cors, compression, pino-http
    ├── routes.ts                    THE one file where every mount point is visible
    │
    ├── config/
    │   ├── env.ts                   Zod-validated environment — exits with a readable
    │   │                            report if anything is missing or malformed
    │   └── logger.ts                Pino instance (pretty in dev, JSON in prod)
    │
    ├── db/
    │   ├── schema.ts                31 tables, 19 enums, all relations and indexes
    │   └── index.ts                 Neon serverless client + Drizzle binding
    │
    ├── lib/                         ── BUSINESS LOGIC, FRAMEWORK-FREE ──
    │   ├── risk.ts                  blended scoring + approval-chain resolution
    │   ├── allocation.ts            warehouse split, backorders, consolidation
    │   ├── billing-math.ts          proration, cancellation, occurrence schedules
    │   ├── totals.ts                line and order rollups
    │   ├── money.ts                 fixed-point currency arithmetic
    │   ├── reference.ts             document number generation (Q-, INV-, CN-)
    │   ├── audit.ts                 append-only audit entries with actor + reason
    │   ├── notify.ts                in-app notification fan-out
    │   ├── mailer.ts                Resend transport
    │   ├── emails.ts                templates for every transactional email
    │   ├── email.ts                 address normalisation and validation
    │   ├── jwt.ts                   sign / verify access and refresh tokens
    │   ├── password.ts              hashing and comparison
    │   ├── otp.ts                   generation, storage, expiry
    │   ├── otp-purpose.ts           OTP purpose enum + guards
    │   ├── pdf.ts                   PDFKit document builders
    │   ├── cloudinary.ts            optional hosted-document upload
    │   ├── redis.ts                 Upstash REST client
    │   ├── actor.ts                 resolve the acting principal from the request
    │   ├── customer-id.ts           customer reference codes
    │   └── sanitize.ts              output scrubbing
    │
    ├── middleware/
    │   ├── auth.ts                  requireAuth · requireRole · requireKind
    │   ├── error.ts                 the single error funnel → stable JSON shape
    │   └── rate-limit.ts            Upstash-backed limiting per route class
    │
    ├── modules/                     ── ONE FOLDER PER FEATURE ──
    │   │                            *.routes.ts   HTTP + guards, no business logic
    │   │                            *.schemas.ts  Zod request validation
    │   │                            *.service.ts  business logic, never touches req/res
    │   │
    │   ├── health/                  health.routes.ts
    │   ├── auth/                    routes · schemas · service
    │   ├── users/                   users.routes · roles.routes · schemas · service
    │   ├── customers/               routes · schemas · service
    │   ├── config/                  routes · schemas · service  (ceilings, approval rules)
    │   ├── catalog/                 routes · schemas · service  (products, price lists)
    │   ├── warehouses/              routes · schemas · service
    │   ├── subscriptions/           routes · schemas · service
    │   ├── upsell/                  routes · schemas · service
    │   ├── risk/                    risk.routes · risk.schemas
    │   ├── quotations/              routes · schemas · service · repo
    │   ├── approvals/               routes · schemas · service
    │   ├── fulfillment/             routes · schemas · service
    │   ├── billing/                 routes · schemas · service
    │   ├── invoices/                routes · service
    │   ├── documents/               routes · service  (quotation / invoice / portal PDFs)
    │   ├── portal/                  routes · schemas · service · projection
    │   │                            └ projection.ts = the customer allow-list
    │   ├── dashboard/               routes · service
    │   ├── reports/                 routes · schemas · service (+ teams router)
    │   ├── audit/                   audit.routes.ts
    │   └── notifications/           notifications.routes.ts
    │
    ├── scripts/
    │   ├── seed.ts                  full deterministic demo dataset
    │   ├── seed-admin.ts            plant or promote the first admin
    │   ├── e2e.ts                   92 assertions over the 8-step flow
    │   ├── verify-risk.ts           6 blended-risk reference cases
    │   └── verify-engines.ts        warehouse split, proration, cancellation
    │
    └── utils/
        ├── api-error.ts             ApiError — code + status + message
        └── async-handler.ts         async route wrapper
```

### 4.4 Architecture Layers

**Request flow, end to end:**

```
  BROWSER
     │
     ▼
  component  ──▶  hook  ──▶  store action  ──▶  services/*.js
                                                     │
                                                     ▼
                                              apiClient.js
                                    (auth header · timeout · 401 refresh)
                                                     │
     ══════════════════════ HTTPS ═══════════════════╪══════════════════
                                                     ▼
                                          app.ts  →  routes.ts
                                                     │
                                                     ▼
                                        middleware/auth.ts   (role + kind guard)
                                                     │
                                                     ▼
                                        <module>.routes.ts   (Zod validation)
                                                     │
                                                     ▼
                                        <module>.service.ts  (business logic)
                                                     │
                                    ┌────────────────┼────────────────┐
                                    ▼                ▼                ▼
                               lib/risk.ts      db/schema.ts     lib/audit.ts
                            lib/allocation.ts  (Drizzle→Neon)    lib/notify.ts
                            lib/billing-math.ts
```

**The rules that keep the layers honest:**

- Routes never contain business logic; services never touch `req` or `res`.
- Validation is **Zod at the route boundary** — a service can assume its input is shaped.
- Errors are thrown as `ApiError` and shaped **once**, in `middleware/error.ts`.
- The frontend's `services/` layer is the only place `fetch()` is called.
- Every mutation goes through a store action, and every business-state change writes an
  audit entry with actor, timestamp and reason.

---

## 5. Getting Started

### 5.1 Prerequisites

- **Node.js 20 or newer** — both halves are ESM.
- **A [Neon](https://console.neon.tech) project** — serverless Postgres, free tier is enough.
- **An [Upstash Redis](https://console.upstash.com) database** — used over its REST API.
- **A [Resend](https://resend.com) API key** — transactional email and OTP delivery.
- **A [Cloudinary](https://console.cloudinary.com) account** — *optional*; without it, PDF
  endpoints stream the file back directly instead of returning a hosted URL.

### 5.2 Backend Setup

```bash
cd backend

# 1. install dependencies
npm install

# 2. create your local environment file, then fill in the real values
cp .env.example .env

# 3. push the schema to Neon
npm run db:push

# 4. load the full demo dataset
#    200 products · 4 customers · 100 quotations · 6 staff accounts
npm run seed

# 5. run the dev server with hot reload
npm run dev
```

- **API** → <http://localhost:5050/api/v1>
- **Browser API tester** → <http://localhost:5050> *(development only)*

To create just the first admin instead of the full seed — the API deliberately cannot,
since signup always produces a `sales_rep`:

```bash
npm run seed:admin -- admin@teamvector.co "Neha Gupta" "Passw0rd!2026"
```

### 5.3 Frontend Setup

```bash
cd Frontend

# 1. install dependencies
npm install

# 2. point it at your local backend (optional — see below)
cp .env.example .env
#    VITE_API_BASE_URL=http://localhost:5050/api/v1

# 3. run the dev server
npm run dev
```

- **App** → <http://localhost:5173>

> With **no** `.env` file the app targets the deployed API, so it runs standalone.

### 5.4 Environment Variables

**Frontend** — [`Frontend/.env.example`](Frontend/.env.example)

| Variable | Required | Purpose |
|:--|:--:|:--|
| `VITE_API_BASE_URL` | No | API base URL, e.g. `http://localhost:5050/api/v1`. Unset → the deployed API. |
| `VITE_API_TIMEOUT_MS` | No | Request timeout in ms, default `30000`. Validated before use — a malformed value falls back to the default instead of aborting every request. |

**Backend** — [`backend/.env.example`](backend/.env.example) documents every variable, and
`src/config/env.ts` validates them at boot; the process exits with a readable report if
anything is missing or malformed.

Where the credentials come from:

- **Neon** — <https://console.neon.tech> → project → *Connect*. One **pooled** connection
  string (the host contains `-pooler`) as `DATABASE_URL`; the app and drizzle-kit share it.
- **Upstash Redis** — <https://console.upstash.com> → database → *REST API* tab. Copy
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. This is the **HTTP** API, not the
  `redis://` protocol.
- **Resend** — <https://resend.com/api-keys>. Verify a domain at
  <https://resend.com/domains>, or send from `onboarding@resend.dev` while testing.
- **Cloudinary** — <https://console.cloudinary.com> → *Dashboard*. Optional **as a group**:
  with none of the three variables set, the PDF endpoints stream the file back directly, so
  the API stays fully usable without an account.

---

## 6. Demo Accounts

`npm run seed` wipes the transactional tables and rebuilds a full dataset. Every account
below can sign in immediately. The seed sets **`Passw0rd!2026`** on every account; the
deployed admin password was changed afterwards, and re-running the seed resets them all.

### 6.1 Staff Accounts

Sign in at `/login` with `"type": "internal"`.

| # | Role | Name | Email | Password | Team | What they can do that others cannot |
|:--|:--|:--|:--|:--|:--|:--|
| 1 | `admin` | Neha Gupta | `admin@teamvector.co` | `Cloud123@` | Enterprise West | Everything — the catalogue, roles, and unblocking any approval step |
| 2 | `sales_manager` | Anita Desai | `anita@teamvector.co` | `Passw0rd!2026` | Enterprise West | Approve the manager step, move discount ceilings, change a customer's tier |
| 3 | `finance` | Vikram Rao | `vikram@teamvector.co` | `Passw0rd!2026` | — | Approve the finance step, issue invoices, **record payments**, issue credit notes |
| 4 | `sales_rep` | Priya Sharma | `priya@teamvector.co` | `Passw0rd!2026` | Enterprise West | Build and submit quotations she owns |
| 5 | `sales_rep` | Rahul Menon | `rahul@teamvector.co` | `Passw0rd!2026` | Enterprise North | Same, on his own book |
| 6 | `sales_rep` | Kiran Nair | `kiran@teamvector.co` | `Passw0rd!2026` | Enterprise South | Same, on his own book |

> There is **exactly one admin**, and the seed refuses to finish if that is ever not true.

### 6.2 Customer Accounts

Sign in at `/customer/login` with `"type": "customer"`.

| # | Company | Contact | Email | Tier | Industry |
|:--|:--|:--|:--|:--|:--|
| 1 | Acme Corp | Sundar Iyer | `buyer@acme.teamvector.co` | gold | Manufacturing |
| 2 | Beta Industries | Meera Krishnan | `buyer@beta.teamvector.co` | silver | Logistics |
| 3 | Cygnus Retail | Arjun Bose | `buyer@cygnus.teamvector.co` | bronze | Retail |
| 4 | Forge Analytics | Ritu Malhotra | `buyer@forge.teamvector.co` | gold | Software |

### 6.3 What the Seed Creates

| # | Entity | Count | Notes |
|:--|:--|--:|:--|
| 1 | Staff | 6 | 1 admin, 1 manager, 1 finance, 3 reps across 3 teams |
| 2 | Customers | 4 | one per tier, plus a second gold |
| 3 | Products | 200 | 80 hardware, 50 service, 30 subscription, 40 accessories |
| 4 | Price-list rows | 600 | three tiers for every product |
| 5 | Warehouses | 3 | stocked so an 8-unit order has to split, and some lines backorder |
| 6 | Subscription plans | 3 | one per proration rule, one per cancellation rule |
| 7 | Upsell rules | 20 | a mix of promoted and margin-floored |
| 8 | **Quotations** | **100** | spread across all nine stages |
| 9 | Quotation lines | ~346 | some deliberately over their ceiling, so risk scoring fires |
| 10 | Pending approval steps | 15 | a real queue for the manager and finance screens |
| 11 | Invoices | 27 | draft, sent, partially paid and paid |
| 12 | Payments | 22 | recorded by finance, as the rules require |

> The data is **deterministic** — the same command twice produces the same database, so a
> demo can be reset between run-throughs and the figures quoted on stage stay true.

---

## 7. The Risk Engine

### 7.1 The Formula

Every line is checked against **its own ceiling** — the stricter of its product category's
limit and the customer tier's limit — then overages are weighted by **gross line value**:

```
score = Σ (line value × points over ceiling) ÷ Σ line value
```

**Worked example.** A ₹1,000 line inside its ceiling, and a ₹2,000 line 8 points over:

```
(1000 × 0  +  2000 × 8) ÷ (1000 + 2000)  =  16,000 ÷ 3,000  =  5.33 points
```

Weighting by value is the whole point: a small line 20 points over should not outrank a
large line 6 points over.

### 7.2 The Two Triggers

| # | Trigger | What it catches | Why it exists |
|:--|:--|:--|:--|
| 1 | **Blended score** | Many lines each only 2–3 points over | Individually unremarkable, collectively a real margin give-away |
| 2 | **Single-line trip** | One badly-over line | Force-escalates even when the blended average looks mild |

When several rules match, **whichever demands more approvers wins** — routing never goes
down.

### 7.3 Approval Routing

- The score resolves an **approver chain**, not a suggestion. The rep never picks.
- A quotation entirely inside its ceilings has an **empty chain** and auto-approves.
- A customer counter-offer **re-scores the final terms** and re-enters approval with the
  audit reason *"Re-approval triggered by customer-negotiated terms"*.
- Actions that must not act on a stale number — submitting for approval, customer
  confirmation — await a **fresh** score before proceeding.

Scores are cached client-side, keyed by a fingerprint of the scoring inputs, so a stale
answer refetches automatically when a line or a ceiling changes. Lists and boards use one
**batched** request rather than one per row.

**Endpoints:** [§10 — Risk scoring](backend/docs/API-REFERENCE.md#10-risk-scoring)
(`POST /risk/score`, `POST /risk/score-batch`, `GET /risk/config`).

---

## 8. Roles & Permissions

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

**Client-side checks shape the UI only.** The API enforces the same matrix, so a devtools
edit changes what is drawn, not what is permitted. The per-endpoint matrix is
[§22 of the API reference](backend/docs/API-REFERENCE.md#22-role-permission-matrix).

---

## 9. API Reference

**Every endpoint, across 17 modules.** Base URL `/api/v1`.
📖 **[Read the full reference →](backend/docs/API-REFERENCE.md)**

### 9.1 Module Breakdown

| § | Area | § | Area |
|:--|:--|:--|:--|
| [1](backend/docs/API-REFERENCE.md#1-health) | Health | [11](backend/docs/API-REFERENCE.md#11-quotations) | Quotations |
| [2](backend/docs/API-REFERENCE.md#2-authentication) | Authentication | [12](backend/docs/API-REFERENCE.md#12-approvals) | Approvals |
| [3](backend/docs/API-REFERENCE.md#3-users-roles-and-teams) | Users, roles, teams | [13](backend/docs/API-REFERENCE.md#13-fulfillment) | Fulfillment |
| [4](backend/docs/API-REFERENCE.md#4-customers) | Customers | [14](backend/docs/API-REFERENCE.md#14-billing-and-subscriptions) | Billing & subscriptions |
| [5](backend/docs/API-REFERENCE.md#5-governance-configuration) | Governance config | [15](backend/docs/API-REFERENCE.md#15-invoices-and-payments) | Invoices & payments |
| [6](backend/docs/API-REFERENCE.md#6-catalog-and-pricing) | Catalog & pricing | [16](backend/docs/API-REFERENCE.md#16-customer-portal) | Customer portal |
| [7](backend/docs/API-REFERENCE.md#7-warehouses) | Warehouses | [17](backend/docs/API-REFERENCE.md#17-dashboard-reports-audit-notifications) | Dashboard, reports, audit, notifications |
| [8](backend/docs/API-REFERENCE.md#8-subscription-plans) | Subscription plans | | |
| [9](backend/docs/API-REFERENCE.md#9-upsell-rules) | Upsell rules | | |
| [10](backend/docs/API-REFERENCE.md#10-risk-scoring) | Risk scoring | | |

### 9.2 Conventions

- **Response envelope** — success is `{ "success": true, "data": { … } }`, failure is
  `{ "success": false, "error": { "code": "OTP_INVALID", "message": "…" } }`. Callers branch
  on the **stable code**, never on the message string.
- **Authentication** — a 15-minute access token plus a 7-day refresh token. Refresh
  **rotates**: the old refresh token is revoked, and replaying it kills every session. The
  frontend therefore makes refresh single-flight, so two concurrent 401s never burn the
  rotated token.
- **Two identity kinds** — `"internal"` for staff and `"customer"` for buyers. They are
  separate namespaces with separate guards; signing into one clears the other.
- **Validation** — every body, query and param is validated with Zod at the route boundary.
- **Rate limiting** — Upstash-backed, per route class. The `e2e` script makes ~150 requests,
  so leave a minute between runs.
- **Errors** — the complete list is the
  [error catalogue](backend/docs/API-REFERENCE.md#19-error-catalogue).

### 9.3 Ways to Exercise the API

| # | Method | How |
|:--|:--|:--|
| 1 | **Browser API tester** | `cd backend && npm run dev`, then open <http://localhost:5050> — covers every endpoint, development only |
| 2 | **Postman** | Import [`backend/postman/DealFlow360.postman_collection.json`](backend/postman) plus the local environment file |
| 3 | **End-to-end script** | `npm run e2e` — 92 assertions walking the full quote-to-cash flow |

---

## 10. Data Model

**31 tables · 20 enums · 38 relations.** Built with Drizzle ORM on Neon serverless Postgres.

### 10.1 Table Groups

| # | Group | Tables |
|:--|:--|:--|
| 1 | **Identity & access** | `users` · `teams` · `customers` · `refresh_tokens` |
| 2 | **Catalog & pricing** | `products` · `product_variants` · `price_lists` |
| 3 | **Inventory** | `warehouses` · `warehouse_stock` |
| 4 | **Governance config** | `tier_config` · `category_config` · `approval_rules` · `dashboard_config` |
| 5 | **Subscriptions** | `subscription_plans` · `subscription_plan_products` |
| 6 | **Upsell** | `upsell_rules` |
| 7 | **Quotation lifecycle** | `quotations` · `quotation_lines` · `line_comments` · `approval_steps` |
| 8 | **Fulfillment** | `fulfillment_plans` · `fulfillment_allocations` · `backorders` |
| 9 | **Billing & money** | `billing_occurrences` · `invoices` · `invoice_lines` · `payments` · `credit_notes` |
| 10 | **Observability** | `audit_log` · `alert_states` · `notifications` |

### 10.2 ER Diagrams & DBML

**The two are different artefacts describing the same schema — use whichever suits the moment.**

| # | Artefact | Where | What it is |
|:--|:--|:--|:--|
| 1 | 🗂️ **DBML diagram** | **[`backend/docs/schema.dbml`](backend/docs/schema.dbml)** | The complete schema as one standalone `.dbml` file — 31 tables, 20 enums, 38 relations. **Paste it into [dbdiagram.io](https://dbdiagram.io/d)** to get a laid-out, zoomable, clickable ER diagram you can export as PNG or PDF |
| 2 | 🧩 **ER diagrams** | **[§24 — Data model](backend/docs/API-REFERENCE.md#24-data-model)** | The same schema drawn **per area** as diagrams that render inline on GitHub — no external tool, and each one sits next to the prose explaining it |

**Per-area ER diagrams:**

| # | Area | Link |
|:--|:--|:--|
| 1 | Identity and access | [§24.1](backend/docs/API-REFERENCE.md#241-identity-and-access) |
| 2 | Catalog, pricing and inventory | [§24.2](backend/docs/API-REFERENCE.md#242-catalog-pricing-and-inventory) |
| 3 | Governance configuration | [§24.3](backend/docs/API-REFERENCE.md#243-governance-configuration) |
| 4 | The quotation lifecycle | [§24.4](backend/docs/API-REFERENCE.md#244-the-quotation-lifecycle) |
| 5 | Fulfillment | [§24.5](backend/docs/API-REFERENCE.md#245-fulfillment) |
| 6 | Billing, invoices and payments | [§24.6](backend/docs/API-REFERENCE.md#246-billing-invoices-and-payments) |
| 7 | Observability | [§24.7](backend/docs/API-REFERENCE.md#247-observability) |

**Source of truth:**

- **Live schema** — [`backend/src/db/schema.ts`](backend/src/db/schema.ts), the Drizzle
  definitions the API actually runs against. Both diagrams describe it.
- **Migrations** — [`backend/drizzle/`](backend/drizzle), seven SQL migrations plus snapshots.

---

## 11. Demo Script

The eight-step walkthrough of the full quote-to-cash flow.

**1. Back-office configuration**
   - Sign in as **Admin** → *Go to Back-end*.
   - Gold tier caps at 15%, Services at 10%, three warehouses, subscription plans.
   - The **risk sandbox** on the discount screen exercises the live scoring endpoint.

**2. Build a quotation**
   - Switch to **Sales Rep** → open an Acme Corp quote.
   - `Laptop Pro 14 × 8 @ 12%` — inside its ceiling.
   - `Onboarding Setup Service @ 18%` — over its 10% ceiling; the hint turns red.

**3. Approval routes itself**
   - The primary button reads **"Send for Manager Approval"**, decided by the fetched score.
   - There is no manual "request approval" step — the rep never picks the approver.

**4. Accept an upsell**
   - Open **Suggestions** and add the promoted docking station.
   - Total, margin and risk all update immediately.

**5. Approve, then split**
   - As **Sales Manager**, the per-line breakdown shows the service line 8 points over.
   - Approve → **Fulfillment** auto-suggests a split across two warehouses.

**6. Hybrid billing**
   - Accept the split → **Billing**.
   - One-time and recurring lines in separate sections, each with its own totals and a
     12-occurrence schedule.

**7. Customer negotiation**
   - New tab → `/customer/login` as the Cygnus Retail buyer.
   - Submit a **25% counter-discount** and confirm.
   - Bronze caps at 5%, so the final terms are re-scored and the quote **automatically
     re-enters approval** with the audit reason *"Re-approval triggered by
     customer-negotiated terms"*.

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

## 12. Testing & Verification

The four calculation engines are asserted against the worked examples in the problem
statement, so a change that breaks one **fails loudly** rather than quietly.

```bash
cd backend

npm run verify:risk       # 6 blended-risk reference cases
npm run verify:engines    # warehouse split, proration, cancellation
npm run e2e               # the brief's 8-step quote-to-cash flow, end to end
```

| # | Script | What it asserts | Needs a server? |
|:--|:--|:--|:--:|
| 1 | `verify:risk` | The 6 blended-risk reference cases | No |
| 2 | `verify:engines` | Warehouse split, proration, cancellation | No |
| 3 | `e2e` | 92 assertions over the full quote-to-cash flow | **Yes** |

- `verify:risk` and `verify:engines` are **pure computation** — no server, no database, no
  network, no email. They run in under a second.
- `e2e` needs a running server, `EXPOSE_DEV_OTP=true`, and a seeded admin. It makes ~150
  requests, so leave a minute between runs or the rate limiter will trip.

---

## 13. Scripts Reference

### 13.1 Frontend — `cd Frontend`

| # | Command | What it does |
|:--|:--|:--|
| 1 | `npm run dev` | Vite dev server with HMR on port 5173 |
| 2 | `npm run build` | Production build to `dist/` |
| 3 | `npm run preview` | Serve the production build locally |
| 4 | `npm run lint` | ESLint over `js,jsx` — zero-warning policy |
| 5 | `npm run lint:fix` | ESLint with `--fix` |
| 6 | `npm run format` | Prettier over `src/**/*.{js,jsx,css}` |

### 13.2 Backend — `cd backend`

| # | Command | What it does |
|:--|:--|:--|
| 1 | `npm run dev` | Dev server with hot reload (`tsx watch`) |
| 2 | `npm run build` | Compile TypeScript to `dist/` |
| 3 | `npm start` | Run the compiled build |
| 4 | `npm run typecheck` | Type-check without emitting |
| 5 | `npm run lint` / `lint:fix` | ESLint over the whole project |
| 6 | `npm run format` | Prettier over `src/` |
| 7 | `npm run seed` | Full deterministic demo dataset |
| 8 | `npm run seed:admin` | Create or promote the first admin |
| 9 | `npm run e2e` | End-to-end walkthrough, 92 assertions |
| 10 | `npm run verify:risk` | The 6 blended-risk reference cases |
| 11 | `npm run verify:engines` | Warehouse split, proration, cancellation |
| 12 | `npm run db:generate` | Generate SQL migrations from the schema |
| 13 | `npm run db:migrate` | Apply migrations |
| 14 | `npm run db:push` | Push the schema straight to the database |
| 15 | `npm run db:studio` | Open Drizzle Studio |

---

## 14. Deployment

### 14.1 Frontend — static SPA, no server runtime

Both platform configs carry the SPA rewrite, so deep links like
`/customer/quotations/Q-1042` don't 404 on a cold open.

| Platform | Root / base | Build command | Output | Config file |
|:--|:--|:--|:--|:--|
| **Vercel** | `Frontend` | `npm run build` | `dist` | [`vercel.json`](Frontend/vercel.json) |
| **Netlify** | `Frontend` | `npm run build` | `dist` | [`netlify.toml`](Frontend/netlify.toml) |

- Set `VITE_API_BASE_URL` in the platform's environment variables.

### 14.2 Backend — any Node 20 host

- Build with `npm run build`, start with `npm start`.
- Set **every** variable from `.env.example`.
- Add the deployed frontend origin to the **CORS allow-list**.
- Run `npm run db:push` (or `db:migrate`) against the production database once.

---

## 15. Branching Strategy

| # | Branch | Purpose |
|:--|:--|:--|
| 1 | `main` | Protected baseline — everything merges here through a PR |
| 2 | `dev-frontend` | Frontend development |
| 3 | `dev-backend` | Backend development |
| 4 | `prod-frontend` | Frontend production |
| 5 | `prod-backend` | Backend production |

---

<div align="center">

**Odoo Hackathon 2026**

**[⬆ Back to top](#dealflow360)**

</div>
