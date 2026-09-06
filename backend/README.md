<div align="center">

# DealFlow360 — Backend

### Express 5 + TypeScript REST API for the DealFlow360 sales operations platform

**Team 413 · Team Vector** — Odoo Hackathon 2026

[![Node](https://img.shields.io/badge/Node-20+-339933)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6)](https://typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5.1-000000)](https://expressjs.com)
[![Drizzle](https://img.shields.io/badge/Drizzle-Neon_Postgres-c5f74f)](https://orm.drizzle.team)
[![API](https://img.shields.io/badge/API-REST_+_JWT-orange)](docs/API-REFERENCE.md)

</div>

---

## 🔗 Links

| | Link |
|:--|:--|
| 🎥 **Demo Video** | **[Watch the demo](https://drive.google.com/drive/folders/1OEYiUbT9DnM4zff3vpSnvD0PoAuiY7Ic?usp=sharing)** |
| 🌐 **Live App** | **<https://dealflow360.teamvector.space/>** |
| ⚙️ **Live API** | **<https://api.dealflow360.teamvector.space/api/v1>** |
| 📖 **API Reference** | **[`docs/API-REFERENCE.md`](docs/API-REFERENCE.md)** — every endpoint, request/response shape, role and error code |
| 🗂️ **DBML Diagram** | **[`docs/schema.dbml`](docs/schema.dbml)** |
| 🧩 **ER Diagrams** | **[§24 Data model](docs/API-REFERENCE.md#24-data-model)** — 31 tables drawn per area, rendered inline on GitHub |
| 📮 **Postman** | [`postman/`](postman) — importable collection covering every endpoint |
| 📘 **Project README** | [`../README.md`](../README.md) |
| 💻 **Frontend README** | [`../Frontend/README.md`](../Frontend/README.md) |

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

Staff sign in with `"type": "internal"`, customers with `"type": "customer"`.

| # | Role | Email | Password |
|:--|:--|:--|:--|
| 1 | **admin** | `admin@teamvector.co` | `Cloud123@` |
| 2 | **sales_manager** | `anita@teamvector.co` | `Passw0rd!2026` |
| 3 | **finance** | `vikram@teamvector.co` | `Passw0rd!2026` |
| 4 | **sales_rep** | `priya@teamvector.co` | `Passw0rd!2026` |
| 5 | **customer** | `buyer@acme.teamvector.co` | `Passw0rd!2026` |

> The complete account list is in **[§5 Demo Accounts](#5-demo-accounts)**.

---

## 📑 Table of Contents

| § | Section | What's inside |
|:--|:--|:--|
| **[1](#1-overview)** | **Overview** | What this API is and what it governs |
| [1.1](#11-design-principles) | Design principles | The five rules the codebase follows |
| **[2](#2-tech-stack)** | **Tech Stack** | Every dependency and why it is there |
| **[3](#3-getting-started)** | **Getting Started** | Install → env → schema → seed → run |
| [3.1](#31-prerequisites) | Prerequisites | Node and the four external services |
| [3.2](#32-installation) | Installation | Five commands |
| [3.3](#33-creating-the-first-admin) | Creating the first admin | Why the API cannot do it |
| **[4](#4-environment-variables)** | **Environment Variables** | Where every credential comes from |
| **[5](#5-demo-accounts)** | **Demo Accounts** | Staff, customers, and what the seed creates |
| [5.1](#51-staff-accounts) | Staff accounts | Six roles |
| [5.2](#52-customer-accounts) | Customer accounts | Four tiers |
| [5.3](#53-what-the-seed-creates) | What the seed creates | Deterministic dataset counts |
| **[6](#6-file-structure)** | **File Structure** | Complete annotated tree |
| [6.1](#61-project-root) | Project root | Config, docs, migrations |
| [6.2](#62-source-tree) | Source tree | Every folder in `src/` |
| [6.3](#63-module-anatomy) | Module anatomy | routes / schemas / service |
| **[7](#7-api)** | **API** | Every endpoint, across 17 modules |
| [7.1](#71-module-breakdown) | Module breakdown | Endpoint counts per area |
| [7.2](#72-conventions) | Conventions | Envelope, auth, errors, rate limits |
| [7.3](#73-ways-to-exercise-the-api) | Ways to exercise the API | Tester, Postman, e2e |
| **[8](#8-data-model)** | **Data Model** | 31 tables, 20 enums, 38 relations |
| [8.1](#81-the-two-diagrams) | The two diagrams | The `.dbml` file vs the inline ER diagrams |
| [8.2](#82-per-area-er-diagrams) | Per-area ER diagrams | Seven linked sections |
| [8.3](#83-source-of-truth) | Source of truth | Drizzle schema and migrations |
| **[9](#9-the-calculation-engines)** | **The Calculation Engines** | Risk, allocation, billing, upsell |
| **[10](#10-testing--verification)** | **Testing & Verification** | Engine assertions and the e2e flow |
| **[11](#11-scripts-reference)** | **Scripts Reference** | Every npm script |
| **[12](#12-deployment)** | **Deployment** | Any Node 20 host |
| **[13](#13-branching-strategy)** | **Branching Strategy** | main, dev-*, prod-* |

---

## 1. Overview

The DealFlow360 backend is a Node.js + TypeScript REST API built on **Express 5**, with
**Neon** (serverless Postgres), **Upstash Redis**, **Resend** and **Cloudinary**.

It owns everything the platform governs: discount ceilings, blended risk scoring, approval
routing, multi-warehouse allocation, hybrid billing, invoices and payments, the customer
portal projection, and an append-only audit trail.

### 1.1 Design Principles

1. **Routes never contain business logic; services never touch `req`/`res`.**
   Each module is `*.routes.ts` (HTTP + guards) · `*.schemas.ts` (Zod) · `*.service.ts`
   (logic), so each layer is testable and replaceable on its own.
2. **Validation is Zod at the route boundary.** A service can assume its input is shaped.
3. **Errors are shaped once.** Everything throws `ApiError`; `middleware/error.ts` is the
   single funnel that turns it into a stable JSON code.
4. **Risk scoring is authoritative here, nowhere else.** The score decides the approval
   chain, so the client is never allowed to compute it.
5. **The API cannot create an account for anyone.** Signup always produces a `sales_rep`;
   the first admin is planted by a CLI script. That is what keeps `admin` unreachable
   through the API.

---

## 2. Tech Stack

| # | Concern | Choice | Why |
|:--|:--|:--|:--|
| 1 | **Runtime** | Node.js 20+ (ESM) | Native modules, top-level await |
| 2 | **Language** | TypeScript 5.9 (strict) | Types enforced at every layer boundary |
| 3 | **HTTP framework** | Express 5.1 | Async error propagation built in |
| 4 | **Database** | Neon serverless Postgres | Pooled HTTP connections, no idle cost |
| 5 | **ORM** | Drizzle ORM 0.45 | Typed SQL, no query-builder magic |
| 6 | **Migrations** | drizzle-kit 0.31 | Generated SQL + snapshots in `drizzle/` |
| 7 | **Cache & rate limits** | Upstash Redis (REST) | HTTP API, works on serverless hosts |
| 8 | **Email** | Resend 6.2 | Transactional email and OTP delivery |
| 9 | **PDF generation** | PDFKit 0.20 | Quotation and invoice documents |
| 10 | **Document hosting** | Cloudinary 2.11 *(optional)* | Without it, PDFs stream back directly |
| 11 | **Validation** | Zod 4.1 | Every body, query and param |
| 12 | **Auth** | `jsonwebtoken` 9 | 15-min access token, 7-day rotating refresh |
| 13 | **Logging** | Pino 9 + pino-http 10 | Structured JSON logs, pretty in dev |
| 14 | **Security** | Helmet 8, CORS allow-list, compression | Standard app-layer hardening |
| 15 | **Dev server** | tsx 4 | Hot reload without a build step |
| 16 | **Lint / format** | ESLint 10 + typescript-eslint, Prettier 3 | Consistent style |

---

## 3. Getting Started

### 3.1 Prerequisites

- **Node.js 20 or newer** (see [`.nvmrc`](.nvmrc))
- **[Neon](https://console.neon.tech)** — serverless Postgres project
- **[Upstash Redis](https://console.upstash.com)** — used over its REST API
- **[Resend](https://resend.com)** — transactional email and OTP delivery
- **[Cloudinary](https://console.cloudinary.com)** — *optional*; without it, PDF endpoints
  stream the file back directly instead of returning a hosted URL

### 3.2 Installation

```bash
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

### 3.3 Creating the First Admin

The API deliberately **cannot** create an admin, since signup always produces a
`sales_rep`. To plant one without loading the full seed:

```bash
npm run seed:admin -- admin@teamvector.co "Neha Gupta" "Passw0rd!2026"
```

> There is **exactly one admin**, and `npm run seed` refuses to finish if that is ever not
> true. No role — admin included — can create an account for anyone else.

---

## 4. Environment Variables

Every variable is documented in [`.env.example`](./.env.example) and validated at boot by
[`src/config/env.ts`](src/config/env.ts) — the process exits with a readable report if
anything is missing or malformed.

Where the credentials come from:

| # | Service | Where to get it | Notes |
|:--|:--|:--|:--|
| 1 | **Neon** | <https://console.neon.tech> → project → *Connect* | One **pooled** connection string (host contains `-pooler`) as `DATABASE_URL`; the app and drizzle-kit share it |
| 2 | **Upstash Redis** | <https://console.upstash.com> → database → *REST API* tab | Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. This is the **HTTP** API, not the `redis://` protocol |
| 3 | **Resend** | <https://resend.com/api-keys> | Verify a domain at <https://resend.com/domains>, or send from `onboarding@resend.dev` while testing |
| 4 | **Cloudinary** | <https://console.cloudinary.com> → *Dashboard* | Optional **as a group**: with none of the three set, PDF endpoints stream the file back directly, so the API stays fully usable without an account |

---

## 5. Demo Accounts

`npm run seed` wipes the transactional tables and rebuilds a full dataset. Every account
below can sign in immediately. The seed sets **`Passw0rd!2026`** on every account; the
deployed admin password was changed afterwards, and re-running the seed resets them all.

### 5.1 Staff Accounts

Sign in with `"type": "internal"`.

| # | Role | Name | Email | Password | Team | What they can do that others cannot |
|:--|:--|:--|:--|:--|:--|:--|
| 1 | `admin` | Neha Gupta | `admin@teamvector.co` | `Cloud123@` | Enterprise West | Everything — the catalogue, roles, and unblocking any approval step |
| 2 | `sales_manager` | Anita Desai | `anita@teamvector.co` | `Passw0rd!2026` | Enterprise West | Approve the manager step, move discount ceilings, change a customer's tier |
| 3 | `finance` | Vikram Rao | `vikram@teamvector.co` | `Passw0rd!2026` | — | Approve the finance step, issue invoices, **record payments**, issue credit notes |
| 4 | `sales_rep` | Priya Sharma | `priya@teamvector.co` | `Passw0rd!2026` | Enterprise West | Build and submit quotations she owns |
| 5 | `sales_rep` | Rahul Menon | `rahul@teamvector.co` | `Passw0rd!2026` | Enterprise North | Same, on his own book |
| 6 | `sales_rep` | Kiran Nair | `kiran@teamvector.co` | `Passw0rd!2026` | Enterprise South | Same, on his own book |

### 5.2 Customer Accounts

Sign in with `"type": "customer"`.

| # | Company | Contact | Email | Tier | Industry |
|:--|:--|:--|:--|:--|:--|
| 1 | Acme Corp | Sundar Iyer | `buyer@acme.teamvector.co` | gold | Manufacturing |
| 2 | Beta Industries | Meera Krishnan | `buyer@beta.teamvector.co` | silver | Logistics |
| 3 | Cygnus Retail | Arjun Bose | `buyer@cygnus.teamvector.co` | bronze | Retail |
| 4 | Forge Analytics | Ritu Malhotra | `buyer@forge.teamvector.co` | gold | Software |

> Tier is **never** self-selected at signup — it decides pricing, so only an admin or a
> sales manager moves it.

### 5.3 What the Seed Creates

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

## 6. File Structure

### 6.1 Project Root

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
└── src/                             ← see 6.2
```

### 6.2 Source Tree

```
src/
│
├── server.ts                        bootstrap + graceful shutdown
├── app.ts                           Express assembly: helmet, cors, compression, pino-http
├── routes.ts                        THE one file where every mount point is visible
│
├── config/
│   ├── env.ts                       Zod-validated environment — exits with a readable
│   │                                report if anything is missing or malformed
│   └── logger.ts                    Pino instance (pretty in dev, JSON in prod)
│
├── db/
│   ├── schema.ts                    31 tables, 19 enums, all relations and indexes
│   └── index.ts                     Neon serverless client + Drizzle binding
│
├── lib/                             ── BUSINESS LOGIC, FRAMEWORK-FREE ──
│   ├── risk.ts                      blended scoring + approval-chain resolution
│   ├── allocation.ts                warehouse split, backorders, consolidation
│   ├── billing-math.ts              proration, cancellation, occurrence schedules
│   ├── totals.ts                    line and order rollups
│   ├── money.ts                     fixed-point currency arithmetic
│   ├── reference.ts                 document number generation (Q-, INV-, CN-)
│   ├── audit.ts                     append-only audit entries with actor + reason
│   ├── notify.ts                    in-app notification fan-out
│   ├── mailer.ts                    Resend transport
│   ├── emails.ts                    templates for every transactional email
│   ├── email.ts                     address normalisation and validation
│   ├── jwt.ts                       sign / verify access and refresh tokens
│   ├── password.ts                  hashing and comparison
│   ├── otp.ts                       generation, storage, expiry
│   ├── otp-purpose.ts               OTP purpose enum + guards
│   ├── pdf.ts                       PDFKit document builders
│   ├── cloudinary.ts                optional hosted-document upload
│   ├── redis.ts                     Upstash REST client
│   ├── actor.ts                     resolve the acting principal from the request
│   ├── customer-id.ts               customer reference codes
│   └── sanitize.ts                  output scrubbing
│
├── middleware/
│   ├── auth.ts                      requireAuth · requireRole · requireKind
│   ├── error.ts                     the single error funnel → stable JSON shape
│   └── rate-limit.ts                Upstash-backed limiting per route class
│
├── modules/                         ── ONE FOLDER PER FEATURE — see 6.3 ──
│   ├── health/                      health.routes.ts
│   ├── auth/                        routes · schemas · service
│   ├── users/                       users.routes · roles.routes · schemas · service
│   ├── customers/                   routes · schemas · service
│   ├── config/                      routes · schemas · service   (ceilings, approval rules)
│   ├── catalog/                     routes · schemas · service   (products, price lists)
│   ├── warehouses/                  routes · schemas · service
│   ├── subscriptions/               routes · schemas · service
│   ├── upsell/                      routes · schemas · service
│   ├── risk/                        risk.routes · risk.schemas
│   ├── quotations/                  routes · schemas · service · repo
│   ├── approvals/                   routes · schemas · service
│   ├── fulfillment/                 routes · schemas · service
│   ├── billing/                     routes · schemas · service
│   ├── invoices/                    routes · service
│   ├── documents/                   routes · service   (quotation / invoice / portal PDFs)
│   ├── portal/                      routes · schemas · service · projection
│   │                                └ portal.projection.ts = the customer allow-list
│   ├── dashboard/                   routes · service
│   ├── reports/                     routes · schemas · service  (+ teams router)
│   ├── audit/                       audit.routes.ts
│   └── notifications/               notifications.routes.ts
│
├── scripts/
│   ├── seed.ts                      full deterministic demo dataset
│   ├── seed-admin.ts                plant or promote the first admin
│   ├── e2e.ts                       92 assertions over the 8-step flow
│   ├── verify-risk.ts               6 blended-risk reference cases
│   └── verify-engines.ts            warehouse split, proration, cancellation
│
└── utils/
    ├── api-error.ts                 ApiError — code + status + message
    └── async-handler.ts             async route wrapper
```

### 6.3 Module Anatomy

Every feature folder follows the same three-file shape:

| # | File | Responsibility | Never does |
|:--|:--|:--|:--|
| 1 | `<name>.routes.ts` | HTTP verbs, paths, auth guards, calls the service | Business logic |
| 2 | `<name>.schemas.ts` | Zod schemas for body, query and params | Database access |
| 3 | `<name>.service.ts` | The business logic, database access, audit + notify | Touch `req` or `res` |

Two modules add a fourth file:

- `quotations/quotations.repo.ts` — the read layer, kept apart from the write logic.
- `portal/portal.projection.ts` — the **allow-list** that defines exactly what a customer
  may see. Enforced here, server-side, so it is access control rather than presentation.

---

## 7. API

**Every endpoint, across 17 modules.** Base URL `/api/v1`.

📖 The complete reference — request and response shapes, roles, error codes, and the
31-table data model as [ER diagrams](docs/API-REFERENCE.md#24-data-model) plus the
[full DBML](docs/API-REFERENCE.md#248-full-dbml-source) — is
**[`docs/API-REFERENCE.md`](docs/API-REFERENCE.md)**.

### 7.1 Module Breakdown

| § | Area | § | Area |
|:--|:--|:--|:--|
| [1](docs/API-REFERENCE.md#1-health) | Health | [11](docs/API-REFERENCE.md#11-quotations) | Quotations |
| [2](docs/API-REFERENCE.md#2-authentication) | Authentication | [12](docs/API-REFERENCE.md#12-approvals) | Approvals |
| [3](docs/API-REFERENCE.md#3-users-roles-and-teams) | Users, roles, teams | [13](docs/API-REFERENCE.md#13-fulfillment) | Fulfillment |
| [4](docs/API-REFERENCE.md#4-customers) | Customers | [14](docs/API-REFERENCE.md#14-billing-and-subscriptions) | Billing & subscriptions |
| [5](docs/API-REFERENCE.md#5-governance-configuration) | Governance config | [15](docs/API-REFERENCE.md#15-invoices-and-payments) | Invoices & payments |
| [6](docs/API-REFERENCE.md#6-catalog-and-pricing) | Catalog & pricing | [16](docs/API-REFERENCE.md#16-customer-portal) | Customer portal |
| [7](docs/API-REFERENCE.md#7-warehouses) | Warehouses | [17](docs/API-REFERENCE.md#17-dashboard-reports-audit-notifications) | Dashboard, reports, audit, notifications |
| [8](docs/API-REFERENCE.md#8-subscription-plans) | Subscription plans | | |
| [9](docs/API-REFERENCE.md#9-upsell-rules) | Upsell rules | | |
| [10](docs/API-REFERENCE.md#10-risk-scoring) | Risk scoring | | |

### 7.2 Conventions

- **Response envelope** — success is `{ "success": true, "data": { … } }`, failure is
  `{ "success": false, "error": { "code": "OTP_INVALID", "message": "…" } }`. Clients branch
  on the **stable code**, never on the message string. Logout returns `204 No Content`.
- **Authentication** — a 15-minute access token plus a 7-day refresh token. Refresh
  **rotates**: the old refresh token is revoked, and replaying it kills every session.
- **Two identity kinds** — `"internal"` for staff and `"customer"` for buyers, with separate
  guards (`requireKind`). They are different surfaces, not different labels.
- **Validation** — every body, query and param is validated with Zod at the route boundary.
- **Rate limiting** — Upstash-backed, per route class.
- **Errors** — the complete list is the
  [error catalogue](docs/API-REFERENCE.md#19-error-catalogue).
- **Roles** — the per-endpoint matrix is
  [§22](docs/API-REFERENCE.md#22-role-permission-matrix).

### 7.3 Ways to Exercise the API

| # | Method | How |
|:--|:--|:--|
| 1 | **Browser API tester** | `npm run dev`, then open <http://localhost:5050> — covers every endpoint, development only |
| 2 | **Postman** | Import [`postman/DealFlow360.postman_collection.json`](postman) plus the local environment file |
| 3 | **End-to-end script** | `npm run e2e` — 92 assertions walking the full quote-to-cash flow |

---

## 8. Data Model

**31 tables · 20 enums · 38 relations**, defined in [`src/db/schema.ts`](src/db/schema.ts) with Drizzle ORM
on Neon serverless Postgres.

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

### 8.1 The Two Diagrams

They are **different artefacts** describing the same schema — use whichever suits the moment.

| # | Artefact | Where | What it is |
|:--|:--|:--|:--|
| 1 | 🗂️ **DBML diagram** | **[`docs/schema.dbml`](docs/schema.dbml)** | The complete schema as one standalone `.dbml` file — 31 tables, 20 enums, 38 relations. **Paste it into [dbdiagram.io](https://dbdiagram.io/d)** for a laid-out, zoomable, clickable ER diagram you can export as PNG or PDF |
| 2 | 🧩 **ER diagrams** | **[§24 — Data model](docs/API-REFERENCE.md#24-data-model)** | The same schema drawn **per area** as diagrams that render inline on GitHub — no external tool, and each one sits next to the prose explaining it |

To render the DBML:

```bash
# copy the file, then paste it at https://dbdiagram.io/d
pbcopy < docs/schema.dbml          # macOS
xclip -sel clip < docs/schema.dbml # Linux
```

### 8.2 Per-Area ER Diagrams

| # | Area | Link |
|:--|:--|:--|
| 1 | Identity and access | [§24.1](docs/API-REFERENCE.md#241-identity-and-access) |
| 2 | Catalog, pricing and inventory | [§24.2](docs/API-REFERENCE.md#242-catalog-pricing-and-inventory) |
| 3 | Governance configuration | [§24.3](docs/API-REFERENCE.md#243-governance-configuration) |
| 4 | The quotation lifecycle | [§24.4](docs/API-REFERENCE.md#244-the-quotation-lifecycle) |
| 5 | Fulfillment | [§24.5](docs/API-REFERENCE.md#245-fulfillment) |
| 6 | Billing, invoices and payments | [§24.6](docs/API-REFERENCE.md#246-billing-invoices-and-payments) |
| 7 | Observability | [§24.7](docs/API-REFERENCE.md#247-observability) |

### 8.3 Source of Truth

- **Live schema** — [`src/db/schema.ts`](src/db/schema.ts), the Drizzle definitions the API
  actually runs against. Both `docs/schema.dbml` and the ER diagrams describe it.
- **Migrations** — [`drizzle/`](drizzle), seven SQL migrations plus snapshots.

---

## 9. The Calculation Engines

| # | Engine | File | What it decides |
|:--|:--|:--|:--|
| 1 | **Risk scoring** | [`src/lib/risk.ts`](src/lib/risk.ts) | The blended discount score and the approval chain |
| 2 | **Warehouse allocation** | [`src/lib/allocation.ts`](src/lib/allocation.ts) | How an order splits across stocked warehouses, what backorders, and when a restock allows consolidation |
| 3 | **Billing math** | [`src/lib/billing-math.ts`](src/lib/billing-math.ts) | Occurrence schedules, proration on mid-cycle change, and cancellation refunds |
| 4 | **Upsell ranking** | [`src/modules/upsell/`](src/modules/upsell) | Which suggestions surface, subject to margin floors |

### The risk formula

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

1. **Blended score** — many lines each only 2–3 points over: individually unremarkable,
   collectively a real margin give-away.
2. **Single-line trip** — force-escalates one badly-over line even when the blend looks mild.

When several rules match, whichever demands **more** approvers wins — routing never goes
down. A customer counter-offer re-scores the final terms and re-enters approval
automatically.

---

## 10. Testing & Verification

The four calculation engines are asserted against the worked examples in the problem
statement, so a change that breaks one **fails loudly** rather than quietly.

```bash
npm run verify:risk       # 6 blended-risk reference cases
npm run verify:engines    # warehouse split, proration, cancellation
npm run e2e               # the brief's 8-step Quick Test Flow, end to end
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

## 11. Scripts Reference

| # | Command | What it does |
|:--|:--|:--|
| 1 | `npm run dev` | Dev server with hot reload (`tsx watch`) |
| 2 | `npm run build` | Compile TypeScript to `dist/` |
| 3 | `npm start` | Run the compiled build |
| 4 | `npm run typecheck` | Type-check without emitting |
| 5 | `npm run lint` | ESLint over the whole project |
| 6 | `npm run lint:fix` | ESLint with `--fix` |
| 7 | `npm run format` | Format `src/` with Prettier |
| 8 | `npm run seed` | Full deterministic demo dataset |
| 9 | `npm run seed:admin` | Create or promote the first admin |
| 10 | `npm run e2e` | End-to-end walkthrough, 92 assertions |
| 11 | `npm run verify:risk` | The 6 blended-risk reference cases |
| 12 | `npm run verify:engines` | Warehouse split, proration, cancellation |
| 13 | `npm run db:generate` | Generate SQL migrations from the schema |
| 14 | `npm run db:migrate` | Apply migrations |
| 15 | `npm run db:push` | Push the schema straight to the database |
| 16 | `npm run db:studio` | Open Drizzle Studio |

---

## 12. Deployment

Any **Node 20** host — the deployment runs on Render, and the same steps work on Railway,
Fly, or a plain VM.

1. Build with `npm run build`, start with `npm start`.
2. Set **every** variable from [`.env.example`](./.env.example).
3. Add the deployed frontend origin to the **CORS allow-list**.
4. Run `npm run db:push` (or `db:migrate`) against the production database once.
5. `NODE_ENV=production` disables the browser API tester at `/`.

---

## 13. Branching Strategy

| # | Branch | Purpose |
|:--|:--|:--|
| 1 | `main` | Protected baseline — everything merges here through a PR |
| 2 | `dev-backend` | Backend development |
| 3 | `dev-frontend` | Frontend development |
| 4 | `prod-backend` | Backend production |
| 5 | `prod-frontend` | Frontend production |

---

<div align="center">

**Odoo Hackathon 2026**

**[⬆ Back to top](#dealflow360--backend)**

</div>
