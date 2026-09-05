# Team_413 — Backend

Node.js + TypeScript REST API built on Express 5, with Neon (serverless Postgres),
Upstash Redis, Resend, and Cloudinary.

## Stack

| Concern        | Choice                                 |
| -------------- | -------------------------------------- |
| Runtime        | Node.js 20+ (ESM)                      |
| Language       | TypeScript 5 (strict)                  |
| HTTP           | Express 5                              |
| Database       | Neon serverless Postgres + Drizzle ORM |
| Cache / limits | Upstash Redis (REST)                   |
| Email          | Resend                                 |
| Documents      | Cloudinary (generated PDFs; optional)  |
| Validation     | Zod                                    |
| Logging        | Pino                                   |

## Getting started

```bash
# 1. install dependencies
npm install

# 2. create your local environment file
cp .env.example .env      # then fill in the real values

# 3. push the schema to Neon
npm run db:push

# 4. run the dev server (hot reload)
npm run dev
```

The API is then available at `http://localhost:5050/api/v1`, and a browser-based
tester covering all 113 endpoints at `http://localhost:5050` (development only).

To create the first admin — the API deliberately cannot, since signup always produces
a `sales_rep`:

```bash
npm run seed:admin -- admin@teamvector.co "Neha Gupta" "Passw0rd!2026"
```

Or load the full demo dataset in one step — 200 products, 4 customers, 100
quotations, and the six accounts in the table below:

```bash
npm run seed
```

## Demo accounts

`npm run seed` wipes the transactional tables and rebuilds a full dataset. Every
account below can sign in immediately.

The seed sets `Passw0rd!2026` on every account; the deployed admin password was
changed afterwards. Re-running `npm run seed` resets them all to the seeded one.

### Deployed

|              | Custom domain                                     | Platform URL                                        |
| ------------ | ------------------------------------------------- | --------------------------------------------------- |
| **Frontend** | <https://dealflow360.teamvector.space>            | <https://deal-flow360-team413.vercel.app>           |
| **Backend**  | <https://api.dealflow360.teamvector.space/api/v1> | <https://dealflow360-team413-2.onrender.com/api/v1> |

### Staff — sign in with `"type": "internal"`

| Role            | Name         | Email                  | Password        | Team             | What they can do that others cannot                                               |
| --------------- | ------------ | ---------------------- | --------------- | ---------------- | --------------------------------------------------------------------------------- |
| `admin`         | Neha Gupta   | `admin@teamvector.co`  | `Cloud123@`     | Enterprise West  | Everything: the catalogue, roles, and unblocking any approval step                |
| `sales_manager` | Anita Desai  | `anita@teamvector.co`  | `Passw0rd!2026` | Enterprise West  | Approve the manager step, move discount ceilings, change a customer's tier        |
| `finance`       | Vikram Rao   | `vikram@teamvector.co` | `Passw0rd!2026` | —                | Approve the finance step, issue invoices, **record payments**, issue credit notes |
| `sales_rep`     | Priya Sharma | `priya@teamvector.co`  | `Passw0rd!2026` | Enterprise West  | Build and submit quotations she owns                                              |
| `sales_rep`     | Rahul Menon  | `rahul@teamvector.co`  | `Passw0rd!2026` | Enterprise North | Same, on his own book                                                             |
| `sales_rep`     | Kiran Nair   | `kiran@teamvector.co`  | `Passw0rd!2026` | Enterprise South | Same, on his own book                                                             |

There is **exactly one admin**, and the seed refuses to finish if that is ever not
true. No role — admin included — can create an account for anyone else; the first
admin is planted by `npm run seed:admin`, which is what keeps `admin` unreachable
through the API.

### Customers — sign in with `"type": "customer"`

| Company         | Contact        | Email                        | Tier   | Industry      |
| --------------- | -------------- | ---------------------------- | ------ | ------------- |
| Acme Corp       | Sundar Iyer    | `buyer@acme.teamvector.co`   | gold   | Manufacturing |
| Beta Industries | Meera Krishnan | `buyer@beta.teamvector.co`   | silver | Logistics     |
| Cygnus Retail   | Arjun Bose     | `buyer@cygnus.teamvector.co` | bronze | Retail        |
| Forge Analytics | Ritu Malhotra  | `buyer@forge.teamvector.co`  | gold   | Software      |

Tier is never self-selected at signup — it decides pricing, so only an admin or a
sales manager moves it.

### What the seed creates

|                        |   Count |                                                                   |
| ---------------------- | ------: | ----------------------------------------------------------------- |
| Staff                  |       6 | 1 admin, 1 manager, 1 finance, 3 reps across 3 teams              |
| Customers              |       4 | one per tier, plus a second gold                                  |
| Products               |     200 | 80 hardware, 50 service, 30 subscription, 40 accessories          |
| Price-list rows        |     600 | three tiers for every product                                     |
| Warehouses             |       3 | stocked so an 8-unit order has to split, and some lines backorder |
| Subscription plans     |       3 | one per proration rule, one per cancellation rule                 |
| Upsell rules           |      20 | a mix of promoted and margin-floored                              |
| **Quotations**         | **100** | spread across all nine stages                                     |
| Quotation lines        |    ~346 | some deliberately over their ceiling, so risk scoring fires       |
| Pending approval steps |      15 | a real queue for the manager and finance screens                  |
| Invoices               |      27 | draft, sent, partially paid and paid                              |
| Payments               |      22 | recorded by finance, as the rules require                         |

The data is **deterministic** — the same command twice produces the same database,
so a demo can be reset between run-throughs and the figures quoted on stage stay
true.

## Scripts

| Command                  | What it does                             |
| ------------------------ | ---------------------------------------- |
| `npm run dev`            | Dev server with hot reload (tsx watch)   |
| `npm run build`          | Compile TypeScript to `dist/`            |
| `npm start`              | Run the compiled build                   |
| `npm run typecheck`      | Type-check without emitting              |
| `npm run lint`           | ESLint over the whole project            |
| `npm run format`         | Format `src/` with Prettier              |
| `npm run seed:admin`     | Create or promote the first admin        |
| `npm run verify:risk`    | The 6 blended-risk reference cases       |
| `npm run verify:engines` | Warehouse split, proration, cancellation |
| `npm run db:generate`    | Generate SQL migrations from the schema  |
| `npm run db:migrate`     | Apply migrations                         |
| `npm run db:push`        | Push the schema straight to the database |
| `npm run db:studio`      | Open Drizzle Studio                      |

## Environment variables

Every variable is documented in [`.env.example`](./.env.example) and validated at
boot by `src/config/env.ts` — the process exits with a readable report if anything
is missing or malformed.

Where to get the credentials:

- **Neon** — <https://console.neon.tech> → project → _Connect_. A single pooled
  connection string (host contains `-pooler`) is all this project needs; the app
  and drizzle-kit both use `DATABASE_URL`.
- **Upstash Redis** — <https://console.upstash.com> → database → _REST API_ tab.
  Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. This is the HTTP
  API, not the `redis://` protocol.
- **Resend** — <https://resend.com/api-keys>. Verify a domain at
  <https://resend.com/domains>, or send from `onboarding@resend.dev` while testing.
- **Cloudinary** — <https://console.cloudinary.com> → _Dashboard_. Optional as a
  group: with none of the three set, the PDF endpoints stream the file back directly
  instead of returning a hosted URL, so the API stays fully usable without an account.

## Project layout

```
src/
  config/       env validation (Zod) + Pino logger
  db/           Drizzle schema and Neon client
  lib/          risk scoring, allocation, billing math, totals, references,
                audit, notify, mailer, PDF, Cloudinary, Redis, JWT, password
  middleware/   auth guards, error handling, Upstash rate limiting
  modules/      one folder per feature — routes, schemas, service
  scripts/      seed, seed-admin, verify-risk, verify-engines
  utils/        ApiError, asyncHandler
  app.ts        Express app assembly
  server.ts     bootstrap + graceful shutdown

docs/           API-REFERENCE.md — every endpoint and the data model, in one file
postman/        importable collection covering all 113 endpoints
public/         dev-only API tester, served at / when NODE_ENV != production
drizzle/        generated migrations
```

## API

**113 endpoints** across 17 modules. The complete reference — request and response
shapes, roles, error codes, and the 31-table data model as ER diagrams plus the full
DBML — is [`docs/API-REFERENCE.md`](docs/API-REFERENCE.md).

| Area                | Endpoints | Area                    | Endpoints |
| ------------------- | --------: | ----------------------- | --------: |
| Health              |         2 | Quotations              |        15 |
| Authentication      |        10 | Approvals               |         5 |
| Users, roles, teams |         5 | Fulfillment             |         5 |
| Customers           |         5 | Billing & subscriptions |         8 |
| Governance config   |        10 | Invoices & payments     |         5 |
| Catalog & pricing   |         8 | Customer portal         |         7 |
| Warehouses          |         6 | Dashboard & reports     |         6 |
| Subscription plans  |         4 | Audit & notifications   |         4 |
| Upsell rules        |         5 | Risk scoring            |         3 |

Three ways to exercise it:

```bash
npm run dev          # then open http://localhost:5050 for the API tester
```

…or import `postman/DealFlow360.postman_collection.json`.

## Verifying the business logic

The four calculation engines are asserted against the worked examples in the problem
statement, so a change that breaks one fails loudly rather than quietly:

```bash
npm run verify:risk      # 6 blended-risk reference cases
npm run verify:engines   # warehouse split, proration, cancellation
```

Both are pure computation — no server, no database, no network, and no email. They run
in under a second.

For a full walkthrough of the quote-to-cash flow, seed the database and drive it from
the browser tester at <http://localhost:5050> or the Postman collection.

## Branches

- `main` — protected baseline
- `dev-backend` / `dev-frontend` — development
- `prod-backend` / `prod-frontend` — production
