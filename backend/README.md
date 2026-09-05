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
npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"
```

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
| `npm run e2e`            | End-to-end walkthrough, 92 assertions    |
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
  scripts/      seed-admin, e2e, verify-risk, verify-engines
  utils/        ApiError, asyncHandler
  app.ts        Express app assembly
  server.ts     bootstrap + graceful shutdown

docs/           API-REFERENCE.md — every endpoint, in one file
postman/        importable collection covering all 113 endpoints
public/         dev-only API tester, served at / when NODE_ENV != production
drizzle/        generated migrations
schema.dbml     the data model, renderable at dbdiagram.io
```

## API

**113 endpoints** across 17 modules. The complete reference — request and response
shapes, roles, error codes — is [`docs/API-REFERENCE.md`](docs/API-REFERENCE.md).

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
npm run e2e          # 92 assertions walking the full quote-to-cash flow
```

…or import `postman/DealFlow360.postman_collection.json`.

## Verifying the business logic

The four calculation engines are asserted against the worked examples in the problem
statement, so a change that breaks one fails loudly rather than quietly:

```bash
npm run verify:risk      # 6 blended-risk reference cases
npm run verify:engines   # warehouse split, proration, cancellation
npm run e2e              # the brief's 8-step Quick Test Flow, end to end
```

`npm run e2e` needs a running server, `EXPOSE_DEV_OTP=true`, and a seeded admin. It
makes ~150 requests, so leave a minute between runs or the rate limiter will trip.

## Branches

- `main` — protected baseline
- `dev-backend` / `dev-frontend` — development
- `prod-backend` / `prod-frontend` — production
