# Team_413 — Backend

Node.js + TypeScript REST API built on Express 5, with Neon (serverless Postgres),
Upstash Redis, Resend, and Cloudinary.

## Stack

| Concern        | Choice                                     |
| -------------- | ------------------------------------------ |
| Runtime        | Node.js 20+ (ESM)                          |
| Language       | TypeScript 5 (strict)                      |
| HTTP           | Express 5                                  |
| Database       | Neon serverless Postgres + Drizzle ORM     |
| Cache / limits | Upstash Redis (REST)                       |
| Email          | Resend                                     |
| Media          | Cloudinary                                 |
| Validation     | Zod                                        |
| Logging        | Pino                                       |

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
auth tester at `http://localhost:5050` (development only).

## Scripts

| Command               | What it does                                     |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Dev server with hot reload (tsx watch)           |
| `npm run build`       | Compile TypeScript to `dist/`                    |
| `npm start`           | Run the compiled build                           |
| `npm run typecheck`   | Type-check without emitting                      |
| `npm run format`      | Format `src/` with Prettier                      |
| `npm run db:generate` | Generate SQL migrations from the schema          |
| `npm run db:migrate`  | Apply migrations                                 |
| `npm run db:push`     | Push the schema straight to the database         |
| `npm run db:studio`   | Open Drizzle Studio                              |

## Environment variables

Every variable is documented in [`.env.example`](./.env.example) and validated at
boot by `src/config/env.ts` — the process exits with a readable report if anything
is missing or malformed.

Where to get the credentials:

- **Neon** — <https://console.neon.tech> → project → *Connect*. A single pooled
  connection string (host contains `-pooler`) is all this project needs; the app
  and drizzle-kit both use `DATABASE_URL`.
- **Upstash Redis** — <https://console.upstash.com> → database → *REST API* tab.
  Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. This is the HTTP
  API, not the `redis://` protocol.
- **Resend** — <https://resend.com/api-keys>. Verify a domain at
  <https://resend.com/domains>, or send from `onboarding@resend.dev` while testing.
- **Cloudinary** — <https://console.cloudinary.com> → *Dashboard*.

## Project layout

```
src/
  config/       env validation (Zod) + Pino logger
  db/           Drizzle schema and Neon client
  lib/          redis.ts (Upstash), email.ts (Resend), cloudinary.ts
  middleware/   error handling, Upstash rate limiting, multer upload
  modules/      feature routes (health, users)
  utils/        ApiError, asyncHandler
  app.ts        Express app assembly
  server.ts     bootstrap + graceful shutdown
```

## Endpoints

| Method | Path                        | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| GET    | `/api/v1/health`            | Liveness                                     |
| GET    | `/api/v1/health/ready`      | Readiness — checks Neon and Upstash          |
| POST   | `/api/v1/users`             | Create a user, send a welcome email (Resend) |
| GET    | `/api/v1/users/:id`         | Fetch a user through the Upstash cache       |
| POST   | `/api/v1/users/:id/avatar`  | Upload an avatar to Cloudinary               |

The `users` module is a reference implementation showing how the four services are
wired together — replace it with real features.

## Branches

- `main` — protected baseline
- `dev-backend` / `dev-frontend` — development
- `prod-backend` / `prod-frontend` — production
