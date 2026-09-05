# DealFlow360 — API Reference

> Complete REST API for the DealFlow360 platform, grouped by module.
> Every endpoint maps back to a module in the problem statement
> (`backend/DealFlow360.pdf`, sections A1–A7 and B1–B10).
>
> Companion document: [`01-PROJECT-OVERVIEW.md`](./01-PROJECT-OVERVIEW.md)

---

## Table of Contents

**Conventions**
- [0. Conventions](#0-conventions) — base URL, auth, envelope, errors, pagination

**A · Backend Configuration**
- [1. Authentication & Session](#1-authentication--session) — A1
- [2. Users & Roles](#2-users--roles)
- [3. Customers & Tiers](#3-customers--tiers)
- [4. Catalog — Products, Categories, Variants](#4-catalog--products-categories-variants) — A2
- [5. Price Lists](#5-price-lists) — A2
- [6. Discount Governance & Approval Chain](#6-discount-governance--approval-chain) — A3
- [7. Warehouses & Inventory](#7-warehouses--inventory) — A4
- [8. Subscription Plans](#8-subscription-plans) — A5
- [9. Upsell / Cross-Sell Rules](#9-upsell--cross-sell-rules) — A6

**B · Sales Workspace**
- [10. Quotations](#10-quotations) — B2, B3
- [11. Risk & Approvals](#11-risk--approvals) — B4
- [12. Upsell Suggestions](#12-upsell-suggestions) — B5
- [13. Fulfillment & Warehouse Split](#13-fulfillment--warehouse-split) — B6
- [14. Subscriptions & Billing](#14-subscriptions--billing) — B7
- [15. Invoices & Payments](#15-invoices--payments) — B10
- [16. Credit Notes & Refunds](#16-credit-notes--refunds) — B7
- [17. Customer Portal](#17-customer-portal) — B8 · **separate restricted surface**
- [18. Deal Health & Alerts](#18-deal-health--alerts) — B9
- [19. Reporting & Exports](#19-reporting--exports) — A7
- [20. Audit Log](#20-audit-log)
- [21. Notifications](#21-notifications)

**Appendix**
- [22. Enumerations](#22-enumerations)
- [23. Error Catalogue](#23-error-catalogue)
- [24. Endpoint Index](#24-endpoint-index)

---

## 0. Conventions

### 0.1 Base URL

```
Local        http://localhost:5000/api/v1
Production   https://api.teamvector.space/api/v1
```

All endpoints below are relative to the base URL unless the path begins with
`/portal`, which is documented in [§17](#17-customer-portal).

### 0.2 Two authentication surfaces

```
┌───────────────────────────────────────────────────────────────────────────┐
│ INTERNAL SURFACE                    │ PORTAL SURFACE                      │
│ /api/v1/*                           │ /api/v1/portal/*                    │
├─────────────────────────────────────┼─────────────────────────────────────┤
│ Authorization: Bearer <JWT>         │ Opaque token in the URL path        │
│ Carries userId + role               │ Scoped to ONE quotation             │
│ Role-gated per endpoint             │ No role, no user account needed     │
│ Full field visibility               │ Fields stripped by toPortalView()   │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

### 0.3 Response envelope

Every successful response:

```json
{
  "success": true,
  "data": { }
}
```

Every error response:

```json
{
  "success": false,
  "error": {
    "message": "Human-readable description",
    "details": []
  }
}
```

### 0.4 Pagination

List endpoints accept `page` (default `1`) and `limit` (default `25`, max `100`).

```http
GET /api/v1/quotations?page=2&limit=25
```

```json
{
  "success": true,
  "data": [ ],
  "meta": { "page": 2, "limit": 25, "total": 142, "totalPages": 6 }
}
```

### 0.5 Common query parameters

| Param | Applies to | Example |
|---|---|---|
| `q` | searchable lists | `?q=laptop` |
| `sort` | lists | `?sort=-createdAt` (`-` = descending) |
| `from` / `to` | date-filterable lists | `?from=2026-01-01&to=2026-03-31` |
| `include` | detail endpoints | `?include=lines,risk,totals` |

### 0.6 Money, dates, identifiers

| Concept | Rule |
|---|---|
| Money | Numbers in **major units** (`1250.50`), never strings. Currency on the parent object. |
| Percentages | Numbers `0`–`100` (`12.5` means 12.5%). |
| Dates | ISO-8601. Date-only: `2026-03-12`. Timestamps: `2026-03-12T10:32:00.000Z` (UTC). |
| IDs | Opaque strings. Quotations use `Q-1042`; invoices `INV-2041`; others UUID. |

### 0.7 Derived fields are never accepted on write

`totals`, `marginPct`, `riskScore`, `amountPaid`, `balanceRemaining`, and
`requiresApproval` are **computed server-side** and returned read-only. Sending them
in a request body is ignored.

### 0.8 Idempotency

`POST` endpoints that create money movements (`/payments`, `/credit-notes`) accept an
`Idempotency-Key` header. Replaying the same key within 24h returns the original
response instead of creating a duplicate.

```http
Idempotency-Key: 9f2c1a44-7b3e-4a91-b2d8-5e6f0c1a2b3d
```

### 0.9 Rate limits

| Surface | Limit |
|---|---|
| Internal | 100 requests / 60s per user |
| Portal | 30 requests / 60s per token |

Responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`; exceeding returns `429`.

---

## 1. Authentication & Session

> Module **A1** — internal users sign up and log in with standard credentials.
> Customers access their quotations through a portal login using **email and password**.
>
> **One login endpoint serves both.** The `type` field in the request body selects
> which identity store to authenticate against.

```
SIGNUP (both kinds)             POST /auth/signup      → OTP emailed, no token
                                POST /auth/verify-otp  → email proved, TOKEN issued

                                Customers self-register too. They get a
                                CUSTOMER CODE (CUST-0001) which they give
                                to their sales rep, who then quotes them.

                                Signup takes ONLY email + password (+ name
                                for staff). role=sales_rep and tier=bronze
                                are forced by the server, never sent.

FORGOT PASSWORD (both kinds)    POST /auth/forgot-password → OTP emailed
                                POST /auth/reset-password  → OTP + new password

LOGIN (both kinds)
POST /auth/login  { email, password, type }
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
          type: "internal"                          type: "customer"
                 │                                         │
        search the USERS table                  search the CUSTOMERS table
                 │                                         │
        JWT { kind: "staff",                    JWT { kind: "customer",
               role: <from the row> }                  customerId: <row id> }
                                                        ← no role field at all
```

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/signup` | public | Create an account (both kinds) · sends OTP |
| `POST` | `/auth/verify-otp` | public | Prove the email · **issues the token** |
| `POST` | `/auth/resend-otp` | public | New code if the first expired |
| `POST` | `/auth/forgot-password` | public | Step 1 of a reset · sends OTP |
| `POST` | `/auth/reset-password` | public | Step 2 · OTP + new password |
| `POST` | `/auth/change-password` | any authenticated | Knows the current password |
| `POST` | `/auth/login` | public | Both kinds — see `type` |
| `POST` | `/auth/refresh` | public (refresh token) | New access token |
| `POST` | `/auth/logout` | any authenticated | Revoke refresh token |
| `GET` | `/auth/me` | any authenticated | Session restore |
| `POST` | `/auth/switch-role` | staff *(demo only)* | Walk the approval chain |

### Two rules the implementation must follow

```
1. ROLE COMES FROM THE DATABASE ROW — NEVER FROM THE REQUEST

   ✅  token.role = record.role          ← read from the row that matched
   ❌  token.role = req.body.role        ← client-controlled: privilege escalation

   `type` only chooses WHICH TABLE to search. It never decides what the
   user is allowed to do. A customer row has no role column, so a customer
   can never come out of login holding one.

2. EVERY ENDPOINT CHECKS `kind`

   customer token  →  /api/v1/quotations         →  403
   staff token     →  /api/v1/portal/quotations  →  403

   This server-side check IS the separation between the two applications.
   Hiding buttons in the UI is not access control.
```

---

### `POST /auth/signup`

Creates an account. **Both kinds self-register** — `type` selects which table the row
is written to. Customers are never created by a rep.

#### Internal user

**Request**

```json
{
  "name": "Priya Sharma",
  "email": "priya@teamvector.space",
  "password": "S3cure!pass",
  "type": "internal"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `name` | string | ✅ | 1–120 chars |
| `email` | string | ✅ | valid email, unique |
| `password` | string | ✅ | min 8 chars |
| `type` | enum | ✅ | `internal` |

#### Customer

**Request**

```json
{
  "name": "Acme Corp",
  "email": "buyer@acmecorp.com",
  "password": "Acme@2026",
  "type": "customer"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `name` | string | ✅ | 1–200 chars — the company / account name |
| `email` | string | ✅ | valid email, unique |
| `password` | string | ✅ | min 8 chars |
| `type` | enum | ✅ | `customer` |

---

> ### ⚠ Fields the signup body does NOT accept
>
> | Field | Set to | Changed later by |
> |---|---|---|
> | `role` | always `sales_rep` | admin — `PATCH /users/:id { "role": "sales_manager" }` |
> | `team` | `null` | admin — `PATCH /users/:id { "team": "West" }` |
> | `tier` | always `bronze` | admin / manager — `PATCH /customers/:id { "tier": "gold" }` |
> | `currency` | `INR` | rep — `PATCH /customers/:id { "currency": "USD" }` |
> >
> Sending any of these returns **`400 FIELD_NOT_ALLOWED`**, naming the offending field.
>
> **Why reject rather than ignore.** `role` and `tier` are the two fields that decide
> what a person can do and what they pay. If the body silently accepts and drops them,
> a later refactor that starts trusting the body turns a signup form into privilege
> escalation. A field that is never accepted cannot be honoured by accident.
>
> **Seeding the first admin.** Since every signup produces a `sales_rep`, the first
> `admin` must come from seed data — nobody can self-register as one. That is the
> point.

### Signup behaviour

```
POST /auth/signup
        ↓
  Does this email already exist?
        │
        ├── NO ──────────────→ create the row, email an OTP
        │                      201  { message: "OTP sent successfully" }
        │
        └── YES ── password correct?
                     │
                     ├── YES, already verified ──→ 200  tokens issued
                     │                                  (behaves as a login)
                     ├── YES, not yet verified ──→ 201  new OTP emailed
                     │                                  { message: "OTP sent successfully" }
                     └── NO ─────────────────────→ 401  Invalid email or password
```

---

#### Response `201` — new signup

Nothing but the confirmation. No account details, no token.

```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

The same body is returned when an **unverified** account signs up again — it simply
gets a fresh code. The client cannot tell the two apart, so the endpoint reveals
nothing about which emails are registered.

---

#### Response `200` — existing verified account

The credentials were correct, so tokens are issued and the user goes straight in.

Internal:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_8f21c3",
      "name": "Priya Sharma",
      "email": "priya@teamvector.space",
      "role": "sales_rep"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_4c8a91e0...",
    "expiresIn": 604800
  }
}
```

Customer:

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "cus_9f2c1a44",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": null,
      "email": "buyer@acmecorp.com",
      "tier": "bronze",
      "currency": "INR"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_2f81c003...",
    "expiresIn": 86400
  }
}
```

> `kind` is **not** in the response body. It lives inside the JWT, where the server
> reads it to authorise every request. The client already knows which app to open —
> it sent `type` in the request — and the payload carries either `user` or `customer`.

---

**Errors**

| Code | Cause |
|---|---|
| `400` | Validation failed, or a server-assigned field was sent (`FIELD_NOT_ALLOWED`) |
| `401` | Email exists but the password is wrong — same wording as login: *"Invalid email or password"* |

---

### `POST /auth/verify-otp`

Signup does **not** create a usable account on its own. The address must be proved
first: signup emails a 6-digit code, and this endpoint checks it. For a customer,
this is also where the `customerCode` becomes active.

```
POST /auth/signup          account created, emailVerified = false
        ↓                  6-digit OTP emailed, valid 10 minutes
        ↓                  NO accessToken issued yet
POST /auth/verify-otp      code checked
        ↓                  emailVerified = true
        ↓                  accessToken issued — user is now logged in
```

**Request**

```json
{
  "email": "priya@teamvector.space",
  "otp": "418302"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `email` | string | ✅ | the address that received the code |
| `otp` | string | ✅ | exactly 6 digits |

> The client does not say what the code is for. The server stores the purpose on the
> OTP row when it issues the code, and reads it back on verification — the same reason
> `role` and `tier` are never taken from the request. A signup code cannot be replayed
> against a password reset, because the stored purpose will not match the endpoint.

**Response `200`**

Internal:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_8f21c3",
      "name": "Priya Sharma",
      "email": "priya@teamvector.space",
      "role": "sales_rep"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_4c8a91e0...",
    "expiresIn": 604800
  }
}
```

Customer — this is where `customerCode` becomes active:

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "cus_9f2c1a44",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": null,
      "email": "buyer@acmecorp.com",
      "tier": "bronze",
      "currency": "INR"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_2f81c003...",
    "expiresIn": 86400
  }
}
```

Identical in shape to the signup response for an existing account, so the frontend
handles one payload either way.

**Errors**

| Code | `error.code` | Cause |
|---|---|---|
| `400` | `OTP_INVALID` | Wrong code |
| `410` | `OTP_EXPIRED` | Older than 10 minutes — request a new one |
| `429` | `OTP_TOO_MANY_ATTEMPTS` | 5 wrong attempts; the code is burned, request a new one |

**OTP rules**

```
length          6 digits
lifetime        10 minutes
attempts        5, then the code is destroyed
reuse           single-use — destroyed on success
storage         hashed, never stored in plain text
concurrent      requesting a new code invalidates the previous one
```

---

### `POST /auth/resend-otp`

**Request** `{ "email": "priya@teamvector.space", "purpose": "signup" }`

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `email` | string | ✅ | |
| `purpose` | enum | ✅ | `signup` \| `password_reset` \| `email_change` |

> `purpose` **is** required here, unlike `verify-otp`. The previous code may have
> expired and been cleaned up, so there is no stored row for the server to read it
> from — it has to be told which kind of code to send. It selects an email template;
> it grants nothing.

**Response `200`** — always the same message, whether or not the address exists.

```json
{
  "success": true,
  "data": { "message": "If that address needs a code, one has been sent.", "retryAfterSeconds": 60 }
}
```

**Errors** — `429` a new code was requested less than 60 seconds ago

---

### `POST /auth/forgot-password`

Step 1 of a password reset. Emails a 6-digit code. Works for **both** kinds — `type`
selects which store to look in, exactly as at login.

**Request**

```json
{ "email": "buyer@acmecorp.com", "type": "customer" }
```

**Response `200`** — always `200`, always this message

```json
{
  "success": true,
  "data": { "message": "If that address matches an account, a reset code has been sent.", "retryAfterSeconds": 60 }
}
```

> Never reveal whether the address exists. A different response for a real address
> turns this endpoint into a way to discover your users and customers.

---

### `POST /auth/reset-password`

Step 2. Verifies the code and sets the new password in one call.

**Request**

```json
{
  "email": "buyer@acmecorp.com",
  "otp": "740915",
  "newPassword": "N3wS3cure!pass",
  "type": "customer"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `email` | string | ✅ | |
| `otp` | string | ✅ | 6 digits, from the reset email |
| `newPassword` | string | ✅ | min 8 chars; must differ from the current one |
| `type` | enum | ✅ | `internal` \| `customer` |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "message": "Password updated. Please sign in with your new password.",
    "sessionsRevoked": 3
  }
}
```

> **All existing refresh tokens are revoked** (`sessionsRevoked`). If the account was
> compromised, resetting the password logs the attacker out everywhere. The user signs
> in again — no token is issued here.


**Errors**

| Code | `error.code` | Cause |
|---|---|---|
| `400` | `OTP_INVALID` | Wrong code |
| `400` | `PASSWORD_REUSED` | Same as the current password |
| `410` | `OTP_EXPIRED` | Older than 10 minutes |
| `429` | `OTP_TOO_MANY_ATTEMPTS` | 5 wrong attempts |

---

### `POST /auth/change-password`

For a user who is already signed in and knows their current password. No OTP needed.

**Request**

```json
{ "currentPassword": "S3cure!pass", "newPassword": "N3wS3cure!pass" }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `currentPassword` | string | ✅ | must match the stored hash |
| `newPassword` | string | ✅ | min 8 chars; must differ from the current one |

**Response `200`**

```json
{
  "success": true,
  "data": { "message": "Password updated.", "sessionsRevoked": 2, "currentSessionKept": true }
}
```

Other sessions are revoked; the session making the request stays signed in.

**Errors** — `401` `currentPassword` is wrong · `400` `PASSWORD_REUSED`

---

### `POST /auth/login`

The single login endpoint for both applications.

```http
POST /api/v1/auth/login
Content-Type: application/json
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `email` | string | ✅ | valid email |
| `password` | string | ✅ | min 8 chars |
| `type` | enum | ✅ | `internal` \| `customer` — selects the identity store |

---

#### Internal user

**Request**

```json
{
  "email": "anita@teamvector.space",
  "password": "S3cure!pass",
  "type": "internal"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_2b77de",
      "name": "Anita Desai",
      "email": "anita@teamvector.space",
      "role": "sales_manager"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_9d21b4f7...",
    "expiresIn": 604800
  }
}
```

Token payload: `{ "sub": "usr_2b77de", "kind": "staff", "role": "sales_manager" }`

---

#### Customer

**Request**

```json
{
  "email": "buyer@acmecorp.com",
  "password": "Acme@2026",
  "type": "customer"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "cus_acme01",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": "R. Iyer",
      "email": "buyer@acmecorp.com",
      "tier": "gold",
      "currency": "INR"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_2f81c003...",
    "expiresIn": 86400
  }
}
```

Token payload: `{ "sub": "cus_acme01", "kind": "customer" }` — **no `role` field.**

> `tier` is returned because the portal shows tier-resolved prices. It is a label,
> not a permission — it grants nothing.

---

#### Errors

Every failure returns the **same** `401` with the **same** message, whether the email
does not exist, the password is wrong, or the email exists only in the *other* store.
Distinct messages would let an attacker discover who your customers are.

```json
{
  "success": false,
  "error": { "message": "Invalid email or password" }
}
```

`400` is returned only for a malformed body (missing `type`, invalid email format).

`403 EMAIL_NOT_VERIFIED` is returned when the credentials are correct but the signup
OTP was never confirmed. The frontend sends the user to its own verify-code screen and
calls `POST /auth/resend-otp` for a fresh code.

---

### `POST /auth/refresh`

Works for both kinds. The new token carries the same `kind` and `role` as the original,
inside the JWT — the response body stays minimal.

**Request** `{ "refreshToken": "rt_9d21b4f7..." }`

**Response `200`**

```json
{
  "success": true,
  "data": { "accessToken": "eyJ...", "expiresIn": 604800 }
}
```

**Errors** — `401` expired or revoked refresh token

---

### `POST /auth/logout`

Revokes the refresh token. Works for both kinds.

**Request** `{ "refreshToken": "rt_9d21b4f7..." }`

**Response `204`** (no body)

---

### `GET /auth/me`

Who am I, and what may I do. Call this on page load to restore a session.

**Response `200` — staff**

```json
{
  "success": true,
  "data": {
    "kind": "staff",
    "id": "usr_2b77de",
    "name": "Anita Desai",
    "role": "sales_manager",
    "team": "National",
    "permissions": {
      "canConfigureCatalog": false,
      "canConfigureDiscounts": true,
      "canApproveManagerStep": true,
      "canApproveFinanceStep": false,
      "canViewReports": true,
      "canAccessBackend": true
    }
  }
}
```

**Response `200` — customer**

```json
{
  "success": true,
  "data": {
    "kind": "customer",
    "id": "cus_acme01",
    "customerCode": "CUST-0001",
    "name": "Acme Corp",
    "tier": "gold",
    "openQuotationCount": 2
  }
}
```

The customer response carries **no `permissions` object and no `role`** — there is
nothing to gate, because the portal exposes only that customer's own quotations.

---

### `POST /auth/switch-role`

Demo convenience so one laptop can walk a Rep → Manager → Finance approval chain
without three separate logins. **Staff tokens only** — a customer token gets `403`.
Disable in production.

**Request** `{ "role": "finance" }`

**Response `200`** — a new `accessToken` carrying the requested role.

**Errors** — `403` demo mode disabled, or the caller is not `kind: "staff"`

---

## 2. Users & Roles

| Method | Path | Roles |
|---|---|---|
| `GET` | `/users` | admin, manager |
| `POST` | `/users` | admin |
| `GET` | `/users/:id` | admin, manager |
| `PATCH` | `/users/:id` | admin |
| `DELETE` | `/users/:id` | admin |
| `GET` | `/roles` | any authenticated |

---

### `GET /users`

```http
GET /api/v1/users?role=sales_rep&team=West&page=1&limit=25
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "usr_8f21c3", "name": "Priya Sharma", "email": "priya@teamvector.space",
      "role": "sales_rep", "team": "West", "active": true }
  ],
  "meta": { "page": 1, "limit": 25, "total": 6, "totalPages": 1 }
}
```

---

### `POST /users`

**Request**

```json
{ "name": "Vikram Rao", "email": "vikram@teamvector.space",
  "password": "S3cure!pass", "role": "finance", "team": "National" }
```

**Response `201`** — the created user. **Errors** — `409` duplicate email

---

### `PATCH /users/:id`

Every signup produces a `sales_rep` with no team. **This is where an admin promotes
them and assigns a team** — the two fields `/auth/signup` refuses to accept.

**Request** — any subset of writable fields

```json
{ "role": "sales_manager", "team": "National", "active": true }
```

| Field | Type | Rules |
|---|---|---|
| `role` | enum | `sales_rep` \| `sales_manager` \| `finance` \| `admin` — **admin only** |
| `team` | string \| null | free text |
| `name` | string | 1–120 chars |
| `active` | boolean | `false` disables login without deleting history |

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "usr_8f21c3",
    "name": "Priya Sharma",
    "role": "sales_manager",
    "previousRole": "sales_rep",
    "team": "National",
    "active": true,
    "changedByName": "Neha Gupta",
    "auditEntryId": "aud_c118"
  }
}
```

> A role change alters what that person can approve, so it is **admin only** and always
> writes an audit entry. A user cannot change their own role — that returns `403`.

---

### `GET /roles`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "key": "sales_rep",     "label": "Sales Rep",     "description": "Creates and manages deals" },
    { "key": "sales_manager", "label": "Sales Manager",  "description": "Approves risky discounts" },
    { "key": "finance",       "label": "Finance / Ops",  "description": "Second-level approval, fulfillment, billing" },
    { "key": "admin",         "label": "Admin",          "description": "Backend configuration and analytics" }
  ]
}
```

---

## 3. Customers & Tiers

| Method | Path | Roles |
|---|---|---|
| `GET` | `/customers` | any internal |
| `POST` | `/customers` | admin, manager, rep |
| `GET` | `/customers/:id` | any internal |
| `PATCH` | `/customers/:id` | admin, manager, rep |
| `DELETE` | `/customers/:id` | admin |
| `GET` | `/customer-tiers` | any internal |
| `PATCH` | `/customer-tiers/:tier` | admin, manager |

---

### `GET /customers`

```http
GET /api/v1/customers?tier=gold&q=acme
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "cus_acme01",
      "name": "Acme Corp",
      "tier": "gold",
      "contactName": "R. Iyer",
      "email": "buyer@acmecorp.com",
      "currency": "INR",
      "openQuotations": 3,
      "lifetimeValue": 8420000
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 8, "totalPages": 1 }
}
```

---

### `POST /customers`

**Request**

```json
{ "name": "Nova Tech", "tier": "silver", "contactName": "S. Menon",
  "email": "procurement@novatech.io", "currency": "INR" }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `name` | string | ✅ | unique per company |
| `tier` | enum | ✅ | `bronze` \| `silver` \| `gold` |
| `contactName` | string | ➖ | |
| `email` | string | ✅ | valid email — used for portal access |
| `currency` | string | ➖ | ISO-4217, default `INR` |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "cus_nova01",
    "customerCode": "CUST-0009",
    "name": "Nova Tech",
    "tier": "silver",
    "contactName": "S. Menon",
    "email": "procurement@novatech.io",
    "currency": "INR",
    "emailVerified": false,
    "passwordSet": false,
    "portalAccess": false
  }
}
```

> ### This is NOT the normal way a customer appears
>
> Customers **self-register** at [`POST /auth/signup`](#post-authsignup) with
> `type: "customer"`, and give their `customerCode` to the rep. This endpoint exists
> only so a rep can record a company that has not signed up yet — for example, quoting
> a prospect who asked by phone.
>
> A row created here has `passwordSet: false` and `portalAccess: false`. **It cannot
> log in.** No invite is emailed and no password is set. If that company later
> self-registers with the same email, the signup **links to this existing row** rather
> than creating a duplicate, and keeps the tier the rep assigned.

**Errors** — `409` a customer with that email already exists

---

### Finding a customer by their code

When a customer says *"my customer ID is CUST-0001"*, the rep looks them up:

```http
GET /api/v1/customers?q=CUST-0001
```

`q` matches `customerCode`, company name, or email.

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "cus_9f2c1a44",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "tier": "bronze",
      "contactName": "R. Iyer",
      "email": "buyer@acmecorp.com",
      "currency": "INR",
      "emailVerified": true,
      "portalAccess": true,
      "selfRegistered": true,
      "openQuotations": 0
    }
  ],
  "meta": { "total": 1 }
}
```

The rep then raises the tier if the commercial relationship warrants it:

```http
PATCH /api/v1/customers/cus_9f2c1a44
```

```json
{ "tier": "gold" }
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "cus_9f2c1a44",
    "customerCode": "CUST-0001",
    "tier": "gold",
    "previousTier": "bronze",
    "changedByName": "Anita Desai",
    "auditEntryId": "aud_b204"
  }
}
```

> Raising a tier changes what that customer pays and how much discount they may
> receive, so it is **restricted to admin and sales_manager** and always writes an
> audit entry. A rep cannot upgrade their own customer.

---

### `GET /customer-tiers`

Headline discount ceilings per tier.

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "tier": "bronze", "label": "Bronze", "maxDiscountPct": 5,  "customerCount": 2 },
    { "tier": "silver", "label": "Silver", "maxDiscountPct": 10, "customerCount": 3 },
    { "tier": "gold",   "label": "Gold",   "maxDiscountPct": 15, "customerCount": 3 }
  ]
}
```

---

### `PATCH /customer-tiers/:tier`

```http
PATCH /api/v1/customer-tiers/gold
```

**Request** `{ "maxDiscountPct": 18 }`

**Response `200`** — the updated tier. Writes an audit entry.

**Errors** — `400` when `maxDiscountPct` is outside `0`–`100`

---

## 4. Catalog — Products, Categories, Variants

> Module **A2** — General Info (Name, Category, Price, Unit, Tax, Description),
> Variants (Attribute, Values, Extra prices), Price Lists.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/products` | any internal |
| `POST` | `/products` | admin |
| `GET` | `/products/:id` | any internal |
| `PATCH` | `/products/:id` | admin |
| `DELETE` | `/products/:id` | admin *(archive)* |
| `GET` | `/products/:id/variants` | any internal |
| `POST` | `/products/:id/variants` | admin |
| `PATCH` | `/products/:id/variants/:variantId` | admin |
| `DELETE` | `/products/:id/variants/:variantId` | admin |
| `GET` | `/categories` | any internal |
| `POST` | `/categories` | admin |
| `PATCH` | `/categories/:id` | admin |

---

### `GET /products`

```http
GET /api/v1/products?category=hardware&active=true&q=laptop&sort=-basePrice
```

| Query | Type | Description |
|---|---|---|
| `category` | enum | `hardware` \| `service` \| `subscription` \| `accessories` |
| `active` | boolean | filter archived products |
| `q` | string | name or SKU search |
| `tier` | enum | when set, `resolvedPrice` reflects that tier's price list |

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "prd_lap14",
      "name": "Laptop Pro 14",
      "sku": "HW-LAP-14",
      "category": "hardware",
      "basePrice": 95000,
      "costPrice": 68000,
      "marginPct": 28.42,
      "unit": "piece",
      "taxPct": 18,
      "description": "14-inch business laptop",
      "variantCount": 3,
      "active": true
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 22, "totalPages": 1 }
}
```

> `marginPct` is **derived** as `(basePrice − costPrice) / basePrice × 100` and is
> never stored, so it can never drift.

---

### `POST /products`

**Request**

```json
{
  "name": "Onboarding Setup Service",
  "sku": "SV-SETUP-01",
  "category": "service",
  "basePrice": 20000,
  "costPrice": 9000,
  "unit": "engagement",
  "taxPct": 18,
  "description": "One-time onboarding and configuration",
  "active": true
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `name` | string | ✅ | 1–200 chars |
| `sku` | string | ✅ | unique |
| `category` | enum | ✅ | see [§22](#22-enumerations) |
| `basePrice` | number | ✅ | `≥ 0` |
| `costPrice` | number | ✅ | `≥ 0`; **warns** (does not block) when `> basePrice` |
| `unit` | string | ✅ | e.g. `piece`, `hour`, `licence` |
| `taxPct` | number | ✅ | `0`–`100` |
| `description` | string | ➖ | |
| `active` | boolean | ➖ | default `true` |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "prd_setup1",
    "name": "Onboarding Setup Service",
    "sku": "SV-SETUP-01",
    "category": "service",
    "basePrice": 20000,
    "costPrice": 9000,
    "marginPct": 55,
    "unit": "engagement",
    "taxPct": 18,
    "active": true,
    "createdAt": "2026-03-01T09:14:00.000Z"
  },
  "warnings": []
}
```

**Errors** — `400` validation · `409` duplicate SKU

---

### `GET /products/:id`

```http
GET /api/v1/products/prd_lap14?tier=gold&include=variants,priceLists,stock
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "prd_lap14",
    "name": "Laptop Pro 14",
    "category": "hardware",
    "basePrice": 95000,
    "costPrice": 68000,
    "marginPct": 28.42,
    "resolvedPrice": 87400,
    "variants": [
      { "id": "var_16gb", "attribute": "RAM", "value": "16GB", "extraPrice": 0 },
      { "id": "var_32gb", "attribute": "RAM", "value": "32GB", "extraPrice": 12000 },
      { "id": "var_64gb", "attribute": "RAM", "value": "64GB", "extraPrice": 28000 }
    ],
    "priceLists": [
      { "tier": "bronze", "currency": "INR", "price": 95000 },
      { "tier": "silver", "currency": "INR", "price": 91200 },
      { "tier": "gold",   "currency": "INR", "price": 87400 }
    ],
    "stock": { "total": 10, "byWarehouse": [
      { "warehouseId": "wh_main", "name": "Main Warehouse", "qty": 6 },
      { "warehouseId": "wh_east", "name": "East Depot",     "qty": 4 },
      { "warehouseId": "wh_west", "name": "West Hub",       "qty": 0 }
    ]}
  }
}
```

---

### `POST /products/:id/variants`

**Request** `{ "attribute": "RAM", "value": "32GB", "extraPrice": 12000 }`

**Response `201`** — the created variant.

---

### `DELETE /products/:id`

Archives rather than hard-deletes, so historical quotation lines stay resolvable.

**Response `200`** `{ "success": true, "data": { "id": "prd_lap14", "active": false } }`

**Errors** — `409` when the product is on an open quotation and `force` is not set

---

### `GET /categories`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "hardware",     "label": "Hardware",     "productCount": 8, "maxDiscountPct": 15 },
    { "id": "service",      "label": "Service",      "productCount": 6, "maxDiscountPct": 10 },
    { "id": "subscription", "label": "Subscription", "productCount": 5, "maxDiscountPct": 12 },
    { "id": "accessories",  "label": "Accessories",  "productCount": 3, "maxDiscountPct": 20 }
  ]
}
```

---

## 5. Price Lists

> Module **A2** — customer-tier based pricing, currency-specific rules.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/price-lists` | any internal |
| `PUT` | `/price-lists` | admin |
| `POST` | `/price-lists/bulk` | admin |
| `DELETE` | `/price-lists` | admin |
| `GET` | `/price-lists/resolve` | any internal |

---

### `GET /price-lists`

```http
GET /api/v1/price-lists?productId=prd_lap14&currency=INR
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "productId": "prd_lap14", "tier": "bronze", "currency": "INR", "price": 95000, "offBasePct": 0 },
    { "productId": "prd_lap14", "tier": "silver", "currency": "INR", "price": 91200, "offBasePct": 4 },
    { "productId": "prd_lap14", "tier": "gold",   "currency": "INR", "price": 87400, "offBasePct": 8 }
  ]
}
```

`offBasePct` is derived: `(basePrice − price) / basePrice × 100`.

---

### `PUT /price-lists`

Upsert a single entry — the natural key is `(productId, tier, currency)`.

**Request**

```json
{ "productId": "prd_lap14", "tier": "gold", "currency": "INR", "price": 86000 }
```

**Response `200`** — the upserted entry with recalculated `offBasePct`.

**Errors** — `400` negative price · `404` unknown product

---

### `POST /price-lists/bulk`

**Request**

```json
{
  "entries": [
    { "productId": "prd_lap14",  "tier": "gold", "currency": "USD", "price": 1050 },
    { "productId": "prd_setup1", "tier": "gold", "currency": "USD", "price": 240 }
  ]
}
```

**Response `200`** `{ "success": true, "data": { "upserted": 2, "failed": [] } }`

---

### `GET /price-lists/resolve`

Resolve the effective unit price the quotation builder should apply.

```http
GET /api/v1/price-lists/resolve?productId=prd_lap14&tier=gold&currency=INR&variantId=var_32gb
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "productId": "prd_lap14",
    "basePrice": 95000,
    "tierPrice": 87400,
    "variantExtra": 12000,
    "resolvedPrice": 99400,
    "source": "price_list",
    "currency": "INR"
  }
}
```

`source` is `price_list` when a tier entry exists, otherwise `base_price` (fallback).

---

## 6. Discount Governance & Approval Chain

> Module **A3** — tier ceilings, category ceilings, approval chain.
> When a quote mixes categories with different ceilings, the system computes a
> **blended risk score** and routes to the highest required level.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/discount-config` | any internal |
| `PUT` | `/discount-config/tier-ceilings/:tier` | admin, manager |
| `PUT` | `/discount-config/category-ceilings/:category` | admin, manager |
| `GET` | `/approval-chain` | any internal |
| `POST` | `/approval-chain` | admin, manager |
| `PATCH` | `/approval-chain/:ruleId` | admin, manager |
| `DELETE` | `/approval-chain/:ruleId` | admin, manager |
| `PUT` | `/approval-chain/reorder` | admin, manager |
| `POST` | `/risk/simulate` | any internal |

---

### `GET /discount-config`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "tierCeilings":     { "bronze": 5, "silver": 10, "gold": 15 },
    "categoryCeilings": { "hardware": 15, "service": 10, "subscription": 12, "accessories": 20 },
    "note": "Category ceilings are stricter PER-LINE limits that override the tier headline number.",
    "updatedAt": "2026-03-01T08:00:00.000Z"
  }
}
```

---

### `PUT /discount-config/category-ceilings/:category`

```http
PUT /api/v1/discount-config/category-ceilings/service
```

**Request** `{ "maxDiscountPct": 12 }`

**Response `200`**

```json
{
  "success": true,
  "data": { "category": "service", "maxDiscountPct": 12, "previous": 10 }
}
```

Writes an audit entry. Existing quotations are **not** retroactively re-scored;
risk is recomputed on the next mutation or `Reload Data`.

---

### `GET /approval-chain`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "rule_auto", "order": 1, "minScore": 0, "maxScore": 0,
      "singleLineTrip": null, "approvers": [], "label": "Auto-approve" },
    { "id": "rule_mgr",  "order": 2, "minScore": 0, "maxScore": 5,
      "singleLineTrip": 5, "approvers": ["sales_manager"], "label": "Manager approval" },
    { "id": "rule_fin",  "order": 3, "minScore": 5, "maxScore": null,
      "singleLineTrip": null, "approvers": ["sales_manager", "finance"],
      "label": "Manager + Finance" }
  ],
  "meta": { "valid": true, "gaps": [], "overlaps": [] }
}
```

`meta.valid` is `false` when ranges overlap or leave a gap; `gaps`/`overlaps` name
the offending ranges so the UI can show an inline warning.

---

### `POST /approval-chain`

**Request**

```json
{ "minScore": 10, "maxScore": null, "singleLineTrip": 12,
  "approvers": ["sales_manager", "finance", "admin"] }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `minScore` | number | ✅ | `≥ 0`, exclusive lower bound |
| `maxScore` | number \| null | ✅ | `null` = unbounded; must be `> minScore` |
| `singleLineTrip` | number \| null | ➖ | forces escalation when any one line exceeds this overage |
| `approvers` | Role[] | ✅ | ordered; empty array = auto-approve |

**Response `201`** — the created rule.

**Errors** — `400` `maxScore ≤ minScore` · `409` range overlaps an existing rule

---

### `PUT /approval-chain/reorder`

**Request** `{ "ruleIds": ["rule_auto", "rule_mgr", "rule_fin"] }`

**Response `200`** — the reordered chain.

---

### `POST /risk/simulate`

The **risk sandbox**. Runs the production `computeBlendedRisk` on hypothetical lines
without creating a quotation. Powers the A3 sandbox and the landing-page widget.

**Request**

```json
{
  "tier": "gold",
  "orderDiscountPct": 0,
  "lines": [
    { "category": "hardware", "qty": 1, "unitPrice": 100000, "discountPct": 12 },
    { "category": "service",  "qty": 1, "unitPrice": 20000,  "discountPct": 18 }
  ]
}
```

**Response `200`** — the PDF's worked example

```json
{
  "success": true,
  "data": {
    "score": 1.26,
    "band": "medium",
    "worstSingleOverage": 8,
    "violationCount": 1,
    "totalValue": 104400,
    "lineBreakdown": [
      { "productName": "Line 1", "category": "hardware", "value": 88000,
        "givenPct": 12, "ceilingPct": 15, "overBy": 0, "isViolation": false, "contribution": 0 },
      { "productName": "Line 2", "category": "service", "value": 16400,
        "givenPct": 18, "ceilingPct": 10, "overBy": 8, "isViolation": true, "contribution": 1.26 }
    ],
    "approvalPath": {
      "approvers": ["sales_manager"],
      "label": "Manager approval",
      "matchedRuleId": "rule_mgr",
      "escalatedBySingleLine": true
    }
  }
}
```

---

## 7. Warehouses & Inventory

> Module **A4** — create/manage warehouses, configure stock and replenishment rules,
> define the shipping-cost weighting used by the auto-split logic.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/warehouses` | any internal |
| `POST` | `/warehouses` | admin, finance |
| `GET` | `/warehouses/:id` | any internal |
| `PATCH` | `/warehouses/:id` | admin, finance |
| `DELETE` | `/warehouses/:id` | admin |
| `GET` | `/warehouses/:id/stock` | any internal |
| `PUT` | `/warehouses/:id/stock/:productId` | admin, finance |
| `POST` | `/warehouses/:id/stock/bulk` | admin, finance |
| `POST` | `/warehouses/:id/restock` | admin, finance |
| `GET` | `/inventory` | any internal |

---

### `GET /warehouses`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "wh_main",
      "name": "Main Warehouse",
      "location": "Mumbai",
      "shippingCostWeight": 1.0,
      "baseShipCost": 400,
      "replenishThreshold": 5,
      "replenishQty": 40,
      "replenishLeadDays": 7,
      "totalSkus": 18,
      "totalUnits": 412,
      "lowStockCount": 2
    },
    { "id": "wh_east", "name": "East Depot", "location": "Kolkata",
      "shippingCostWeight": 1.4, "baseShipCost": 400, "replenishThreshold": 5,
      "replenishQty": 30, "replenishLeadDays": 10, "totalSkus": 12,
      "totalUnits": 168, "lowStockCount": 5 },
    { "id": "wh_west", "name": "West Hub", "location": "Pune",
      "shippingCostWeight": 1.8, "baseShipCost": 400, "replenishThreshold": 3,
      "replenishQty": 20, "replenishLeadDays": 14, "totalSkus": 7,
      "totalUnits": 54, "lowStockCount": 6 }
  ]
}
```

---

### `POST /warehouses`

**Request**

```json
{
  "name": "South Depot",
  "location": "Chennai",
  "shippingCostWeight": 1.2,
  "baseShipCost": 400,
  "replenishThreshold": 5,
  "replenishQty": 30,
  "replenishLeadDays": 9
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `name` | string | ✅ | unique |
| `location` | string | ✅ | |
| `shippingCostWeight` | number | ✅ | `0.5`–`3.0`; **higher = the splitter prefers cheaper warehouses** |
| `baseShipCost` | number | ✅ | `≥ 0` |
| `replenishThreshold` | number | ✅ | low-stock trigger |
| `replenishQty` | number | ✅ | units added by a restock |
| `replenishLeadDays` | number | ✅ | drives backorder ETA |

**Response `201`** — the created warehouse.

---

### `GET /warehouses/:id/stock`

```http
GET /api/v1/warehouses/wh_main/stock?lowOnly=true
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "warehouseId": "wh_main",
    "replenishThreshold": 5,
    "items": [
      { "productId": "prd_lap14", "name": "Laptop Pro 14", "qty": 6,  "isLow": false },
      { "productId": "prd_dock",  "name": "Docking Station","qty": 3, "isLow": true }
    ]
  }
}
```

---

### `PUT /warehouses/:id/stock/:productId`

```http
PUT /api/v1/warehouses/wh_main/stock/prd_lap14
```

**Request** `{ "qty": 24 }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "warehouseId": "wh_main", "productId": "prd_lap14",
    "qty": 24, "previousQty": 6, "isLow": false,
    "consolidationOpportunities": ["Q-1051"]
  }
}
```

> `consolidationOpportunities` lists quotations with an **open backorder** that this
> stock increase could now cover — the trigger for the B6 *Consolidate Remaining
> Backorder* prompt.

---

### `POST /warehouses/:id/restock`

Adds `replenishQty` to one or all products. The deterministic demo trigger for the
consolidation prompt.

**Request** `{ "productId": "prd_lap14" }` *(omit `productId` to restock everything below threshold)*

**Response `200`**

```json
{
  "success": true,
  "data": {
    "warehouseId": "wh_main",
    "restocked": [ { "productId": "prd_lap14", "from": 0, "to": 40 } ],
    "consolidationOpportunities": ["Q-1051"]
  }
}
```

---

### `GET /inventory`

Stock for one product across every warehouse.

```http
GET /api/v1/inventory?productId=prd_lap14
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "productId": "prd_lap14",
    "totalAvailable": 10,
    "byWarehouse": [
      { "warehouseId": "wh_main", "name": "Main Warehouse", "qty": 6, "shippingCostWeight": 1.0 },
      { "warehouseId": "wh_east", "name": "East Depot",     "qty": 4, "shippingCostWeight": 1.4 },
      { "warehouseId": "wh_west", "name": "West Hub",       "qty": 0, "shippingCostWeight": 1.8 }
    ],
    "availability": "partial"
  }
}
```

`availability` — `in_stock` · `partial` · `backorder`.

---

## 8. Subscription Plans

> Module **A5** — recurring plans (monthly, quarterly, yearly) attachable to products
> or services; proration rules for mid-cycle changes; cancellation and partial-refund rules.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/subscription-plans` | any internal |
| `POST` | `/subscription-plans` | admin, finance |
| `GET` | `/subscription-plans/:id` | any internal |
| `PATCH` | `/subscription-plans/:id` | admin, finance |
| `DELETE` | `/subscription-plans/:id` | admin |
| `POST` | `/subscription-plans/:id/preview-proration` | any internal |

---

### `GET /subscription-plans`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "plan_std_m",
      "name": "DealFlow Cloud Standard — Monthly",
      "cadence": "monthly",
      "billingDayOfCycle": 1,
      "productIds": ["prd_cloud_std"],
      "prorationRule": "daily_prorate",
      "cancellationRule": "refund_unused",
      "minCommitmentMonths": 0,
      "trialDays": 14,
      "active": true,
      "activeSubscriptions": 12
    }
  ]
}
```

---

### `POST /subscription-plans`

**Request**

```json
{
  "name": "Security Add-on — Quarterly",
  "cadence": "quarterly",
  "billingDayOfCycle": 1,
  "productIds": ["prd_sec_addon"],
  "prorationRule": "next_cycle_adjust",
  "cancellationRule": "credit_note_only",
  "minCommitmentMonths": 3,
  "trialDays": 0
}
```

| Field | Type | Required | Values |
|---|---|:---:|---|
| `cadence` | enum | ✅ | `monthly` \| `quarterly` \| `yearly` |
| `prorationRule` | enum | ✅ | `daily_prorate` \| `full_period` \| `next_cycle_adjust` |
| `cancellationRule` | enum | ✅ | `refund_unused` \| `no_refund` \| `credit_note_only` |
| `billingDayOfCycle` | number | ➖ | `1`–`28`, default `1` |
| `minCommitmentMonths` | number | ➖ | default `0` |
| `trialDays` | number | ➖ | default `0` |

**Response `201`** — the created plan.

---

### `POST /subscription-plans/:id/preview-proration`

Worked example for the selected strategy — used by the explainer card next to the
proration selector. Pure calculation, mutates nothing.

**Request**

```json
{ "unitPrice": 1200, "discountPct": 0, "oldQty": 3, "newQty": 5,
  "cycleStartDate": "2026-03-01", "changeDate": "2026-03-12" }
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "prorationRule": "daily_prorate",
    "daysInCycle": 31,
    "daysUsed": 11,
    "daysRemaining": 20,
    "qtyDelta": 2,
    "amountNow": 1548.39,
    "type": "charge",
    "explanation": "Day 11 of 31: +2 unit(s) × ₹1200.00 × 20/31 days = ₹1548.39 charged now."
  }
}
```

---

## 9. Upsell / Cross-Sell Rules

> Module **A6** *(optional per the PDF)* — product pairings from historical co-purchase
> data, promoted flags, minimum margin thresholds.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/upsell-rules` | any internal |
| `POST` | `/upsell-rules` | admin, manager |
| `PATCH` | `/upsell-rules/:id` | admin, manager |
| `DELETE` | `/upsell-rules/:id` | admin, manager |
| `POST` | `/upsell-rules/preview` | any internal |

---

### `GET /upsell-rules`

```http
GET /api/v1/upsell-rules?triggerProductId=prd_lap14&active=true
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "ups_lap_dock",
      "triggerProductId": "prd_lap14",
      "triggerProductName": "Laptop Pro 14",
      "suggestedProductId": "prd_dock",
      "suggestedProductName": "Docking Station",
      "coPurchaseScore": 82,
      "promoted": true,
      "minMarginPct": 20,
      "active": true
    }
  ]
}
```

---

### `POST /upsell-rules`

**Request**

```json
{ "triggerProductId": "prd_cloud_std", "suggestedProductId": "prd_sec_addon",
  "coPurchaseScore": 74, "promoted": false, "minMarginPct": 25, "active": true }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `coPurchaseScore` | number | ✅ | `0`–`100` |
| `promoted` | boolean | ➖ | adds `+25` to the rank score |
| `minMarginPct` | number | ✅ | suggestions below this margin are filtered out |

**Response `201`** — the created rule.

**Errors** — `400` trigger equals suggestion · `409` duplicate pairing

---

### `POST /upsell-rules/preview`

The **suggestion previewer** — shows the exact ranked list the builder would produce
for a hypothetical cart, with the score breakdown so ranking is not a black box.

**Request** `{ "tier": "gold", "productIds": ["prd_lap14", "prd_cloud_std"] }`

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "productId": "prd_dock",
      "productName": "Docking Station",
      "category": "accessories",
      "price": 11040,
      "marginPct": 38.4,
      "marginDelta": 4240,
      "revenueDelta": 11040,
      "promoted": true,
      "coPurchaseScore": 82,
      "reason": "Frequently bought with Laptop Pro 14",
      "rankScore": 118.52,
      "breakdown": { "coPurchase": 82, "promotionBoost": 25, "marginWeight": 11.52 }
    }
  ]
}
```

Ranking: `coPurchaseScore + (promoted ? 25 : 0) + marginPct × 0.3`.

---

## 10. Quotations

> Modules **B2** (list / pipeline) and **B3** (builder).

| Method | Path | Roles |
|---|---|---|
| `GET` | `/quotations` | any internal |
| `POST` | `/quotations` | rep, manager, admin |
| `GET` | `/quotations/:id` | any internal |
| `PATCH` | `/quotations/:id` | owner, manager, admin |
| `DELETE` | `/quotations/:id` | owner *(draft only)*, admin |
| `POST` | `/quotations/:id/lines` | owner, manager, admin |
| `PATCH` | `/quotations/:id/lines/:lineId` | owner, manager, admin |
| `DELETE` | `/quotations/:id/lines/:lineId` | owner, manager, admin |
| `PUT` | `/quotations/:id/order-discount` | owner, manager, admin |
| `GET` | `/quotations/:id/totals` | any internal |
| `POST` | `/quotations/:id/stage` | role-dependent |
| `POST` | `/quotations/:id/send-to-customer` | owner, manager, admin |
| `GET` | `/pipeline` | any internal |

---

### `GET /quotations`

```http
GET /api/v1/quotations?stage=pending_approval&ownerId=usr_8f21c3&tier=gold
    &from=2026-01-01&to=2026-03-31&sort=-lastActivityAt&page=1&limit=25
```

| Query | Type | Description |
|---|---|---|
| `stage` | enum \| csv | `draft,pending_approval,…` |
| `ownerId` | string | filter by rep |
| `customerId` | string | filter by customer |
| `tier` | enum | `bronze` \| `silver` \| `gold` |
| `riskBand` | enum | `low` \| `medium` \| `high` |
| `q` | string | quote number or customer name |
| `stale` | boolean | only quotes past the stall threshold |

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "Q-1042",
      "customerId": "cus_acme01",
      "customerName": "Acme Corp",
      "tier": "gold",
      "ownerId": "usr_8f21c3",
      "ownerName": "Priya Sharma",
      "stage": "pending_approval",
      "negotiationStatus": "none",
      "lineCount": 3,
      "grandTotal": 2269423.2,
      "effectiveDiscountPct": 12.9,
      "riskScore": 1.36,
      "riskBand": "medium",
      "createdAt": "2026-03-01T10:12:00.000Z",
      "lastActivityAt": "2026-03-02T09:31:00.000Z",
      "isStale": false
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 14, "totalPages": 1 }
}
```

---

### `POST /quotations`

Creates a draft. The tier is resolved from the customer.

**Request**

```json
{
  "customerId": "cus_acme01",
  "promisedDeliveryDate": "2026-03-20",
  "validUntil": "2026-03-30"
}
```

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "customerId": "cus_acme01",
    "customerName": "Acme Corp",
    "tier": "gold",
    "ownerId": "usr_8f21c3",
    "stage": "draft",
    "negotiationStatus": "none",
    "lines": [],
    "orderDiscountPct": 0,
    "approvalSteps": [],
    "portalUrl": "https://app.teamvector.space/portal/quotations/Q-1042",
    "promisedDeliveryDate": "2026-03-20",
    "validUntil": "2026-03-30",
    "createdAt": "2026-03-01T10:12:00.000Z",
    "lastActivityAt": "2026-03-01T10:12:00.000Z"
  }
}
```

**Errors** — `404` unknown customer

---

### `GET /quotations/:id`

```http
GET /api/v1/quotations/Q-1042?include=lines,totals,risk,approval,suggestions
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "customerName": "Acme Corp",
    "tier": "gold",
    "ownerName": "Priya Sharma",
    "stage": "pending_approval",
    "negotiationStatus": "none",
    "orderDiscountPct": 0,
    "lines": [
      {
        "id": "ln_001",
        "productId": "prd_lap14",
        "productName": "Laptop Pro 14",
        "category": "hardware",
        "qty": 20,
        "unitPrice": 87400,
        "costPrice": 68000,
        "discountPct": 12,
        "taxPct": 18,
        "isSubscription": false,
        "planId": null,
        "lineSubtotal": 1748000,
        "lineTotal": 1538240,
        "marginAmount": 178240,
        "marginPct": 11.59,
        "ceilingPct": 15,
        "isOverCeiling": false,
        "commentCount": 0
      },
      {
        "id": "ln_002",
        "productId": "prd_setup1",
        "productName": "Onboarding Setup Service",
        "category": "service",
        "qty": 20,
        "unitPrice": 20000,
        "costPrice": 9000,
        "discountPct": 18,
        "taxPct": 18,
        "isSubscription": false,
        "lineSubtotal": 400000,
        "lineTotal": 328000,
        "marginAmount": 148000,
        "marginPct": 45.12,
        "ceilingPct": 10,
        "isOverCeiling": true,
        "overBy": 8,
        "commentCount": 1
      },
      {
        "id": "ln_003",
        "productId": "prd_cloud_std",
        "productName": "DealFlow Cloud Standard",
        "category": "subscription",
        "qty": 20,
        "unitPrice": 3000,
        "costPrice": 900,
        "discountPct": 5,
        "taxPct": 18,
        "isSubscription": true,
        "planId": "plan_std_m",
        "planCadence": "monthly",
        "lineSubtotal": 60000,
        "lineTotal": 57000,
        "ceilingPct": 12,
        "isOverCeiling": false
      }
    ],
    "totals": {
      "subtotal": 2208000,
      "lineDiscountAmount": 284760,
      "orderDiscountAmount": 0,
      "netBeforeTax": 1923240,
      "tax": 346183.2,
      "grandTotal": 2269423.2,
      "marginAmount": 365240,
      "marginPct": 18.99,
      "effectiveDiscountPct": 12.9
    },
    "risk": {
      "score": 1.36,
      "band": "medium",
      "worstSingleOverage": 8,
      "violationCount": 1,
      "approvalPath": { "approvers": ["sales_manager"], "label": "Manager approval" }
    },
    "approval": {
      "steps": [
        { "role": "sales_manager", "status": "pending", "reviewerId": null, "at": null, "reason": null }
      ],
      "currentStep": "sales_manager"
    },
    "portalUrl": "https://app.teamvector.space/portal/quotations/Q-1042",
    "lastActivityAt": "2026-03-02T09:31:00.000Z"
  }
}
```

**Errors** — `403` rep viewing another rep's quote when scoped · `404` unknown id

---

### `POST /quotations/:id/lines`

Adds a line. Unit price, cost price, tax, and category are resolved from the catalog
and the customer's tier price list — the client does not supply them.

**Request**

```json
{ "productId": "prd_setup1", "qty": 20, "discountPct": 18, "variantId": null, "planId": null }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `productId` | string | ✅ | must be active |
| `qty` | number | ✅ | integer `≥ 1` |
| `discountPct` | number | ➖ | `0`–`100`, default `0` |
| `variantId` | string | ➖ | adds `extraPrice` |
| `planId` | string | ➖ | **required** when the product is a subscription |

**Response `201`** — the created line, plus recomputed `totals` and `risk`:

```json
{
  "success": true,
  "data": {
    "line": { "id": "ln_002", "productName": "Onboarding Setup Service",
              "category": "service", "qty": 20, "unitPrice": 20000,
              "discountPct": 18, "lineTotal": 328000,
              "ceilingPct": 10, "isOverCeiling": true, "overBy": 8 },
    "totals": { "grandTotal": 2269423.2, "marginPct": 18.99 },
    "risk":   { "score": 1.36, "band": "medium",
                "approvalPath": { "approvers": ["sales_manager"], "label": "Manager approval" } }
  }
}
```

**Errors** — `400` subscription product without `planId` · `404` unknown product ·
`409` quotation is not editable in its current stage

---

### `PATCH /quotations/:id/lines/:lineId`

**Request** `{ "qty": 25, "discountPct": 14, "unitPrice": 86000 }` — any subset.

**Response `200`** — same shape as the create response (line + totals + risk), so the
summary rail can update from a single round-trip.

---

### `PUT /quotations/:id/order-discount`

Applied **on top of** line discounts and included in the risk calculation.

**Request** `{ "orderDiscountPct": 3 }`

**Response `200`** — recomputed `totals` and `risk`.

---

### `GET /quotations/:id/totals`

Lightweight endpoint for the live summary rail (debounced from the builder).

**Response `200`**

```json
{
  "success": true,
  "data": {
    "subtotal": 2208000,
    "lineDiscountAmount": 284760,
    "orderDiscountAmount": 0,
    "netBeforeTax": 1923240,
    "tax": 346183.2,
    "grandTotal": 2269423.2,
    "marginAmount": 365240,
    "marginPct": 18.99,
    "effectiveDiscountPct": 12.9
  }
}
```

---

### `POST /quotations/:id/stage`

Every stage change — buttons, Kanban drags, portal confirmations — passes through
`canTransition()`.

**Request** `{ "toStage": "lost", "reason": "Customer chose a competitor" }`

**Response `200`**

```json
{
  "success": true,
  "data": { "id": "Q-1042", "stage": "lost", "previousStage": "pending_approval" }
}
```

**Response `409`** when the move is not allowed — the message explains **why**:

```json
{
  "success": false,
  "error": {
    "message": "Can't move to Billed — this quote still needs Finance approval",
    "details": { "from": "pending_approval", "to": "billed", "blockedBy": "approval_incomplete" }
  }
}
```

---

### `POST /quotations/:id/send-to-customer`

Marks the quote `sent`, ensures a portal token exists, returns the shareable link.

**Request** `{ "message": "Please review at your convenience." }` *(optional)*

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "sent",
    "negotiationStatus": "sent",
    "portalUrl": "https://app.teamvector.space/portal/quotations/Q-1042",
    "expiresAt": "2026-03-30T23:59:59.000Z"
  }
}
```

---

### `GET /pipeline`

Kanban columns with counts and summed value (B2).

```http
GET /api/v1/pipeline?ownerId=usr_8f21c3
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "stage": "draft", "label": "Draft", "count": 3, "totalValue": 840000,
      "quotations": [
        { "id": "Q-1051", "customerName": "ABC Corp", "grandTotal": 240000,
          "tier": "bronze", "riskBand": "low", "daysInStage": 2, "ownerName": "Priya Sharma" }
      ]},
    { "stage": "pending_approval", "label": "Pending Approval", "count": 2,
      "totalValue": 5100000, "quotations": [] },
    { "stage": "approved",    "label": "Approved",    "count": 2, "totalValue": 1900000, "quotations": [] },
    { "stage": "fulfillment", "label": "Fulfillment", "count": 1, "totalValue": 760000,  "quotations": [] },
    { "stage": "billed",      "label": "Billed",      "count": 1, "totalValue": 430000,  "quotations": [] },
    { "stage": "confirmed",   "label": "Confirmed",   "count": 2, "totalValue": 7300000, "quotations": [] },
    { "stage": "lost",        "label": "Lost",        "count": 1, "totalValue": 180000,  "quotations": [] }
  ]
}
```

---

## 11. Risk & Approvals

> Module **B4** — blended risk score, approval steps (Sales Manager, and Finance only
> when required), approve / reject / return, full audit trail.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/quotations/:id/risk` | any internal |
| `POST` | `/quotations/:id/submit-for-approval` | owner, manager, admin |
| `GET` | `/quotations/:id/approval` | any internal |
| `POST` | `/quotations/:id/approval/approve` | **role must match the pending step** |
| `POST` | `/quotations/:id/approval/reject` | **role must match the pending step** |
| `POST` | `/quotations/:id/approval/return` | **role must match the pending step** |
| `GET` | `/approvals/pending` | manager, finance, admin |

---

### `GET /quotations/:id/risk`

The full auditable breakdown rendered on the approval screen.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "score": 1.36,
    "band": "medium",
    "worstSingleOverage": 8,
    "violationCount": 1,
    "totalValue": 1923240,
    "tierCeiling": 15,
    "lineBreakdown": [
      { "lineId": "ln_001", "productName": "Laptop Pro 14", "category": "hardware",
        "value": 1538240, "givenPct": 12, "ceilingPct": 15, "overBy": 0,
        "isViolation": false, "contribution": 0 },
      { "lineId": "ln_002", "productName": "Onboarding Setup Service", "category": "service",
        "value": 328000, "givenPct": 18, "ceilingPct": 10, "overBy": 8,
        "isViolation": true, "contribution": 1.36 },
      { "lineId": "ln_003", "productName": "DealFlow Cloud Standard", "category": "subscription",
        "value": 57000, "givenPct": 5, "ceilingPct": 12, "overBy": 0,
        "isViolation": false, "contribution": 0 }
    ],
    "approvalPath": {
      "approvers": ["sales_manager"],
      "label": "Manager approval",
      "matchedRuleId": "rule_mgr",
      "escalatedBySingleLine": true
    }
  }
}
```

The `contribution` column sums to `score`, so the number is verifiable by eye.

---

### `POST /quotations/:id/submit-for-approval`

Recomputes risk from scratch, resolves the chain, and either auto-approves or routes.
**The rep never chooses the approver.**

**Request** `{}` *(no body required)*

**Response `200` — routed**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "pending_approval",
    "risk": { "score": 1.36, "band": "medium" },
    "approvalSteps": [
      { "role": "sales_manager", "status": "pending", "reviewerId": null, "at": null }
    ],
    "currentStep": "sales_manager",
    "notified": ["usr_2b77de"],
    "auditEntryId": "aud_71c2"
  }
}
```

**Response `200` — auto-approved** (risk `0`, all lines within ceilings)

```json
{
  "success": true,
  "data": {
    "id": "Q-1043",
    "stage": "approved",
    "risk": { "score": 0, "band": "low" },
    "approvalSteps": [],
    "autoApproved": true,
    "auditReason": "Auto-approved (within all ceilings)"
  }
}
```

**Errors** — `409` quotation has no lines, or is not in a submittable stage

---

### `GET /quotations/:id/approval`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "customerName": "Acme Corp",
    "tier": "gold",
    "grandTotal": 2269423.2,
    "requestedById": "usr_8f21c3",
    "requestedByName": "Priya Sharma",
    "requestedAt": "2026-03-02T09:31:00.000Z",
    "stage": "pending_approval",
    "steps": [
      { "order": 1, "role": "sales_manager", "status": "approved",
        "reviewerId": "usr_2b77de", "reviewerName": "Anita Desai",
        "at": "2026-03-02T11:04:00.000Z", "reason": "Strategic account" },
      { "order": 2, "role": "finance", "status": "pending",
        "reviewerId": null, "reviewerName": null, "at": null, "reason": null }
    ],
    "currentStep": "finance",
    "canActingUserAct": false,
    "waitingOnLabel": "Waiting on Finance",
    "auditTrail": [
      { "id": "aud_71c2", "action": "submitted", "actorName": "Priya Sharma",
        "actorRole": "sales_rep", "at": "2026-03-02T09:31:00.000Z", "reason": null },
      { "id": "aud_71c9", "action": "approved", "actorName": "Anita Desai",
        "actorRole": "sales_manager", "at": "2026-03-02T11:04:00.000Z",
        "reason": "Strategic account" }
    ]
  }
}
```

`canActingUserAct` tells the UI whether to render the action panel or a read-only
"Waiting on …" card.

---

### `POST /quotations/:id/approval/approve`

**Request** `{ "comment": "Service overage acceptable for this account" }` *(optional)*

**Response `200` — more steps remain**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "pending_approval",
    "approvedStep": "sales_manager",
    "nextStep": "finance",
    "steps": [
      { "role": "sales_manager", "status": "approved", "reviewerName": "Anita Desai",
        "at": "2026-03-02T11:04:00.000Z" },
      { "role": "finance", "status": "pending" }
    ]
  }
}
```

**Response `200` — final step**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "approved",
    "approvedStep": "finance",
    "nextStep": null,
    "fulfillmentReady": true,
    "message": "Approved — fulfillment split ready"
  }
}
```

**Errors**

| Code | Cause |
|---|---|
| `403` | Caller's role does not match the pending step (Finance cannot approve before the Manager) |
| `409` | No pending step, or the quotation is not in `pending_approval` |

---

### `POST /quotations/:id/approval/reject`

**Reason is mandatory**, minimum 10 characters.

**Request** `{ "reason": "Service discount is not sustainable at this volume" }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "lost",
    "rejectedBy": "sales_manager",
    "reason": "Service discount is not sustainable at this volume",
    "steps": [
      { "role": "sales_manager", "status": "rejected", "at": "2026-03-02T11:40:00.000Z" },
      { "role": "finance", "status": "skipped" }
    ],
    "notified": ["usr_8f21c3"]
  }
}
```

---

### `POST /quotations/:id/approval/return`

Returns for revision. **Reason is mandatory.** All steps are cleared; a later
resubmission recomputes risk from scratch.

**Request** `{ "reason": "Please bring the Setup Service line down to 12% or below" }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "Q-1042",
    "stage": "draft",
    "returnedBy": "sales_manager",
    "reason": "Please bring the Setup Service line down to 12% or below",
    "steps": [],
    "notified": ["usr_8f21c3"]
  }
}
```

---

### `GET /approvals/pending`

The approver's queue.

```http
GET /api/v1/approvals/pending?role=sales_manager&sort=oldest
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "quotationId": "Q-1042", "customerName": "Acme Corp", "tier": "gold",
      "grandTotal": 2269423.2, "riskScore": 1.36, "riskBand": "medium",
      "requestedByName": "Priya Sharma",
      "waitingSinceHours": 26, "breachesSla": true, "step": "sales_manager" }
  ],
  "meta": { "total": 3, "oldestWaitingHours": 74 }
}
```

---

## 12. Upsell Suggestions

> Module **B5** — ranked list shown alongside the cart; adding one updates the margin
> indicator immediately.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/quotations/:id/suggestions` | owner, manager, admin |
| `POST` | `/quotations/:id/suggestions/:productId/accept` | owner, manager, admin |
| `POST` | `/quotations/:id/suggestions/:productId/dismiss` | owner, manager, admin |
| `DELETE` | `/quotations/:id/suggestions/:productId/dismiss` | owner, manager, admin |

---

### `GET /quotations/:id/suggestions`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "productId": "prd_dock",
        "productName": "Docking Station",
        "category": "accessories",
        "price": 11040,
        "marginPct": 38.4,
        "marginDelta": 4240,
        "revenueDelta": 11040,
        "promoted": true,
        "coPurchaseScore": 82,
        "reason": "Frequently bought with Laptop Pro 14",
        "rankScore": 118.52
      },
      {
        "productId": "prd_warranty",
        "productName": "Extended Warranty",
        "category": "accessories",
        "price": 8280,
        "marginPct": 62.1,
        "marginDelta": 5142,
        "revenueDelta": 8280,
        "promoted": false,
        "coPurchaseScore": 67,
        "reason": "Frequently bought with Laptop Pro 14",
        "rankScore": 85.63
      }
    ],
    "dismissed": [
      { "productId": "prd_cable", "productName": "Cable Bundle", "dismissedAt": "2026-03-01T10:40:00.000Z" }
    ]
  }
}
```

Empty `suggestions` means nothing cleared the margin floor for this cart.

---

### `POST /quotations/:id/suggestions/:productId/accept`

```http
POST /api/v1/quotations/Q-1042/suggestions/prd_dock/accept
```

**Request** `{ "qty": 20 }` *(default `1`)*

**Response `201`** — the new line plus the recomputed values the UI animates:

```json
{
  "success": true,
  "data": {
    "line": { "id": "ln_004", "productName": "Docking Station",
              "qty": 20, "unitPrice": 11040, "discountPct": 0, "lineTotal": 220800 },
    "totals": { "grandTotal": 2529967.2, "marginPct": 20.99, "previousMarginPct": 18.99 },
    "risk":   { "score": 1.22, "band": "medium", "previousScore": 1.36 },
    "suggestions": []
  }
}
```

> Note how `marginPct` **rose** and the blended `score` **fell** — adding a healthy-margin
> line dilutes the value-weighted overage. This is the visible demo checkpoint the PDF calls out.

---

### `POST /quotations/:id/suggestions/:productId/dismiss`

Non-destructive — the card collapses into a "Dismissed" tray.

**Response `200`** `{ "success": true, "data": { "productId": "prd_cable", "dismissed": true } }`

### `DELETE /quotations/:id/suggestions/:productId/dismiss`

Undo. **Response `200`** `{ "success": true, "data": { "productId": "prd_cable", "dismissed": false } }`

---

## 13. Fulfillment & Warehouse Split

> Module **B6** — recommended split based on live stock, shipment count and cost,
> accept or manually override, backorders, consolidation prompt.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/quotations/:id/fulfillment` | any internal |
| `POST` | `/quotations/:id/fulfillment/accept` | rep, finance, manager, admin |
| `POST` | `/quotations/:id/fulfillment/validate` | rep, finance, manager, admin |
| `POST` | `/quotations/:id/fulfillment/override` | rep, finance, manager, admin |
| `POST` | `/quotations/:id/fulfillment/reset` | rep, finance, manager, admin |
| `GET` | `/quotations/:id/fulfillment/backorders` | any internal |
| `POST` | `/quotations/:id/fulfillment/backorder-policy` | rep, finance, manager, admin |
| `POST` | `/quotations/:id/fulfillment/consolidate` | rep, finance, manager, admin |

---

### `GET /quotations/:id/fulfillment`

Computes the suggested split from live stock. Read-only — nothing is reserved yet.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "status": "suggested",
    "allocations": [
      { "lineId": "ln_001", "productName": "Laptop Pro 14", "qtyOrdered": 20,
        "splits": [
          { "warehouseId": "wh_main", "warehouseName": "Main Warehouse", "qty": 6,
            "shippingCostWeight": 1.0 },
          { "warehouseId": "wh_east", "warehouseName": "East Depot", "qty": 4,
            "shippingCostWeight": 1.4 }
        ],
        "fulfilled": 10, "shortfall": 10 }
    ],
    "backorders": [
      { "lineId": "ln_001", "productName": "Laptop Pro 14", "qty": 10,
        "etaDate": "2026-03-09", "sourceWarehouseId": "wh_main" }
    ],
    "shipmentCount": 2,
    "estimatedCost": 960,
    "warehousesInvolved": ["wh_main", "wh_east"],
    "isOverride": false,
    "acceptedAt": null
  }
}
```

Subscription and service lines are excluded — they are not shipped.

**Errors** — `409` quotation is not yet `approved`

---

### `POST /quotations/:id/fulfillment/accept`

Accepts the suggestion, reserves stock, moves the stage to `fulfillment`.

**Request** `{}`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "stage": "fulfillment",
    "status": "accepted",
    "shipmentCount": 2,
    "estimatedCost": 960,
    "acceptedAt": "2026-03-02T12:10:00.000Z",
    "backorderCount": 1
  }
}
```

---

### `POST /quotations/:id/fulfillment/validate`

Dry-run for the override editor — validates without saving, so the UI can show
inline errors and the live cost delta on every keystroke.

**Request**

```json
{
  "allocations": [
    { "lineId": "ln_001", "warehouseId": "wh_main", "qty": 6 },
    { "lineId": "ln_001", "warehouseId": "wh_east", "qty": 12 }
  ]
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "valid": false,
    "errors": [
      { "lineId": "ln_001", "warehouseId": "wh_east",
        "message": "Only 4 available at East Depot", "available": 4, "requested": 12 }
    ],
    "shipmentCount": 2,
    "estimatedCost": 960,
    "suggestedCost": 960,
    "costDelta": 0
  }
}
```

---

### `POST /quotations/:id/fulfillment/override`

Saves a manual split. **Rejected** if any cell fails validation.

**Request**

```json
{
  "allocations": [
    { "lineId": "ln_001", "warehouseId": "wh_main", "qty": 6 },
    { "lineId": "ln_001", "warehouseId": "wh_east", "qty": 4 }
  ],
  "reason": "Customer requested Kolkata dispatch for the second batch"
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "stage": "fulfillment",
    "status": "overridden",
    "isOverride": true,
    "shipmentCount": 2,
    "estimatedCost": 960,
    "suggestedCost": 960,
    "costDelta": 0,
    "acceptedAt": "2026-03-02T12:15:00.000Z"
  }
}
```

**Errors `400`**

```json
{
  "success": false,
  "error": {
    "message": "Override is invalid",
    "details": [
      { "lineId": "ln_001", "message": "Over-allocated: 24 of 20" },
      { "lineId": "ln_002", "warehouseId": "wh_west", "message": "Only 0 available at West Hub" }
    ]
  }
}
```

---

### `GET /quotations/:id/fulfillment/backorders`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "policy": "ship_available_now",
    "promisedDeliveryDate": "2026-03-20",
    "backorders": [
      { "lineId": "ln_001", "productName": "Laptop Pro 14", "qty": 10,
        "etaDate": "2026-03-09", "daysLate": 0, "sourceWarehouseId": "wh_main" }
    ],
    "hasSlippage": false
  }
}
```

`hasSlippage` is `true` when any `etaDate` is later than `promisedDeliveryDate` —
this is what raises the `delivery_slippage` alert in [§18](#18-deal-health--alerts).

---

### `POST /quotations/:id/fulfillment/backorder-policy`

**Request** `{ "policy": "hold_until_complete" }`

| Value | Meaning |
|---|---|
| `ship_available_now` | Ship what is in stock, backorder the rest |
| `hold_until_complete` | Hold the entire order until it can ship in full |

**Response `200`** — the updated plan with recomputed shipment count.

---

### `POST /quotations/:id/fulfillment/consolidate`

Merges an open backorder into fewer shipments after a restock.

**Request** `{}`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "consolidated": true,
    "shipmentsSaved": 1,
    "costSaved": 560,
    "before": { "shipmentCount": 3, "estimatedCost": 1520 },
    "after":  { "shipmentCount": 2, "estimatedCost": 960 },
    "backordersCleared": 1
  }
}
```

**Errors** — `409` no open backorder, or stock still insufficient

---

## 14. Subscriptions & Billing

> Module **B7** — one-time and recurring lines shown separately within the same order,
> upcoming billing schedule, mid-cycle proration, cancel/modify with automatic partial
> refund or credit note.

| Method | Path | Roles |
|---|---|---|
| `POST` | `/quotations/:id/billing/build` | rep, finance, manager, admin |
| `GET` | `/quotations/:id/billing` | any internal |
| `GET` | `/subscriptions/:id` | any internal |
| `GET` | `/subscriptions/:id/schedule` | any internal |
| `POST` | `/subscriptions/:id/preview-change` | any internal |
| `POST` | `/subscriptions/:id/change` | finance, manager, admin |
| `POST` | `/subscriptions/:id/cancel` | finance, manager, admin |

---

### `POST /quotations/:id/billing/build`

Splits the order into its two streams: generates the one-time invoice and the
recurring schedules.

**Request** `{ "startDate": "2026-03-01", "horizonOccurrences": 12, "dueDays": 15 }`

**Response `201`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "oneTime":  { "invoiceId": "INV-2041", "lineCount": 2, "total": 2202163.2, "status": "draft" },
    "recurring": {
      "subscriptionIds": ["sub_9d21"],
      "lineCount": 1,
      "perCycleTotal": 57000,
      "annualContractValue": 684000
    },
    "stage": "billed"
  }
}
```

---

### `GET /quotations/:id/billing`

The full B7 view.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "quotationId": "Q-1042",
    "currency": "INR",
    "oneTime": {
      "invoiceId": "INV-2041",
      "status": "draft",
      "lines": [
        { "lineId": "ln_001", "productName": "Laptop Pro 14", "qty": 20,
          "unitPrice": 87400, "discountPct": 12, "total": 1538240 },
        { "lineId": "ln_002", "productName": "Onboarding Setup Service", "qty": 20,
          "unitPrice": 20000, "discountPct": 18, "total": 328000 }
      ],
      "subtotal": 1866240, "tax": 335923.2, "totalBilledOnce": 2202163.2
    },
    "recurring": {
      "lines": [
        {
          "subscriptionId": "sub_9d21",
          "lineId": "ln_003",
          "productName": "DealFlow Cloud Standard",
          "planId": "plan_std_m",
          "planName": "DealFlow Cloud Standard — Monthly",
          "cadence": "monthly",
          "qty": 20,
          "unitPrice": 3000,
          "discountPct": 5,
          "perCycleAmount": 57000,
          "startDate": "2026-03-01",
          "nextBillingDate": "2026-04-01",
          "status": "active",
          "prorationRule": "daily_prorate",
          "cancellationRule": "refund_unused"
        }
      ],
      "annualContractValue": 684000
    },
    "creditNotes": []
  }
}
```

---

### `GET /subscriptions/:id/schedule`

```http
GET /api/v1/subscriptions/sub_9d21/schedule?occurrences=12
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_9d21",
    "cadence": "monthly",
    "perCycleAmount": 57000,
    "occurrences": [
      { "id": "sub_9d21-occ-0",  "date": "2026-03-01", "amount": 57000, "status": "invoiced" },
      { "id": "sub_9d21-occ-1",  "date": "2026-04-01", "amount": 57000, "status": "scheduled" },
      { "id": "sub_9d21-occ-2",  "date": "2026-05-01", "amount": 57000, "status": "scheduled" },
      { "id": "sub_9d21-occ-11", "date": "2027-02-01", "amount": 57000, "status": "scheduled" }
    ],
    "groupedBy": "monthly",
    "annualContractValue": 684000
  }
}
```

Occurrence status — `scheduled` · `invoiced` · `paid` · `refunded` · `cancelled`.

---

### `POST /subscriptions/:id/preview-change`

**Mutates nothing.** Returns the proration preview shown *before* the user commits.

**Request** `{ "newQty": 25, "changeDate": "2026-03-12" }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_9d21",
    "prorationRule": "daily_prorate",
    "oldQty": 20,
    "newQty": 25,
    "qtyDelta": 5,
    "cycleStartDate": "2026-03-01",
    "changeDate": "2026-03-12",
    "daysInCycle": 31,
    "daysUsed": 11,
    "daysRemaining": 20,
    "amountNow": 9193.55,
    "type": "charge",
    "explanation": "Day 11 of 31: +5 unit(s) × ₹2850.00 × 20/31 days = ₹9193.55 charged now.",
    "nextCycleAmount": 71250
  }
}
```

**`full_period` response**

```json
{
  "amountNow": 0, "type": "none",
  "explanation": "No mid-cycle charge. New quantity (25) applies from the next monthly cycle.",
  "nextCycleAmount": 71250
}
```

**`next_cycle_adjust` response**

```json
{
  "amountNow": 0, "deferredAmount": 14250, "type": "deferred",
  "explanation": "₹14250 added to the next cycle's invoice."
}
```

---

### `POST /subscriptions/:id/change`

Applies the change, creating a proration charge or credit as the plan's rule dictates.

**Request** `{ "newQty": 25, "changeDate": "2026-03-12", "planId": null }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_9d21",
    "qty": 25,
    "perCycleAmount": 71250,
    "proration": { "amountNow": 9193.55, "type": "charge" },
    "creditNoteId": null,
    "scheduleUpdated": true,
    "auditEntryId": "aud_8b31"
  }
}
```

When `type` is `credit`, a `CreditNote` is created and its id is returned in `creditNoteId`.

---

### `POST /subscriptions/:id/cancel`

**Request** `{ "cancelDate": "2026-03-12", "reason": "Customer downsizing" }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "subscriptionId": "sub_9d21",
    "status": "cancelled",
    "cancellationRule": "refund_unused",
    "daysRemaining": 20,
    "amount": 36774.19,
    "type": "refund",
    "explanation": "₹36774.19 refunded for 20 unused days.",
    "refundId": "ref_4a91",
    "creditNoteId": null,
    "occurrencesCancelled": 11
  }
}
```

| `cancellationRule` | `type` | Effect |
|---|---|---|
| `refund_unused` | `refund` | Partial-refund record created |
| `no_refund` | `null` | `amount: 0`, service runs to end of paid cycle |
| `credit_note_only` | `credit_note` | Credit note created for the unused value |

All future `scheduled` occurrences become `cancelled` in every case.

---

## 15. Invoices & Payments

> Module **B10** — required by Quick Test Flow step 8: *"Confirm the order, record a
> payment, and check that the invoice status updates correctly."*

| Method | Path | Roles |
|---|---|---|
| `GET` | `/invoices` | any internal |
| `GET` | `/invoices/:id` | any internal |
| `POST` | `/invoices` | finance, manager, admin |
| `POST` | `/invoices/:id/send` | finance, manager, admin |
| `GET` | `/invoices/:id/payments` | any internal |
| `POST` | `/invoices/:id/payments` | finance, admin |
| `GET` | `/invoices/:id/pdf` | any internal |

---

### `GET /invoices`

```http
GET /api/v1/invoices?status=partially_paid&customerId=cus_acme01&from=2026-01-01
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "INV-2041", "quotationId": "Q-1042", "customerName": "Acme Corp",
      "status": "partially_paid", "total": 2202163.2,
      "amountPaid": 1000000, "balanceRemaining": 1202163.2,
      "issueDate": "2026-03-02", "dueDate": "2026-03-17", "isOverdue": false }
  ],
  "meta": { "page": 1, "limit": 25, "total": 6, "totalPages": 1 }
}
```

---

### `GET /invoices/:id`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "id": "INV-2041",
    "quotationId": "Q-1042",
    "customerName": "Acme Corp",
    "billTo": {
      "name": "Acme Corp", "contactName": "R. Iyer",
      "email": "buyer@acmecorp.com", "address": "Plot 14, Andheri East, Mumbai 400069"
    },
    "status": "partially_paid",
    "lines": [
      { "lineId": "ln_001", "productName": "Laptop Pro 14", "qty": 20,
        "unitPrice": 87400, "discountPct": 12, "total": 1538240 },
      { "lineId": "ln_002", "productName": "Onboarding Setup Service", "qty": 20,
        "unitPrice": 20000, "discountPct": 18, "total": 328000 }
    ],
    "subtotal": 1866240,
    "tax": 335923.2,
    "total": 2202163.2,
    "amountPaid": 1000000,
    "balanceRemaining": 1202163.2,
    "issueDate": "2026-03-02",
    "dueDate": "2026-03-17",
    "payments": [
      { "id": "pay_1", "amount": 1000000, "method": "bank_transfer",
        "reference": "TXN-8891", "date": "2026-03-05",
        "recordedByName": "Vikram Rao", "balanceAfter": 1202163.2 }
    ],
    "hybridNote": {
      "hasRecurring": true,
      "recurringLineCount": 1,
      "message": "This invoice covers one-time charges. 1 recurring line is billed on its own schedule."
    }
  }
}
```

> `amountPaid` and `balanceRemaining` are **derived** from `payments` on every read.

---

### `POST /invoices`

Generate an invoice from a quotation's **one-time lines only**.

**Request** `{ "quotationId": "Q-1042", "issueDate": "2026-03-02", "dueDays": 15 }`

**Response `201`** — the created invoice in `draft`.

**Errors** — `409` an invoice already exists for this quotation · `400` no one-time lines

---

### `POST /invoices/:id/send`

**Response `200`**

```json
{ "success": true, "data": { "id": "INV-2041", "status": "sent", "sentAt": "2026-03-02T14:00:00.000Z" } }
```

**Errors** — `409` invoice is not in `draft`

---

### `POST /invoices/:id/payments`

Records a payment and advances the status. Supports `Idempotency-Key`.

**Request**

```json
{
  "amount": 1202163.2,
  "method": "bank_transfer",
  "reference": "TXN-9042",
  "date": "2026-03-10",
  "notes": "Final settlement"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `amount` | number | ✅ | `> 0` and `≤ balanceRemaining` — **overpayment is blocked** |
| `method` | enum | ✅ | `card` \| `bank_transfer` \| `cheque` \| `upi` \| `other` |
| `reference` | string | ➖ | transaction id |
| `date` | date | ➖ | defaults to today |
| `notes` | string | ➖ | |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "payment": { "id": "pay_2", "amount": 1202163.2, "method": "bank_transfer",
                 "reference": "TXN-9042", "date": "2026-03-10",
                 "recordedById": "usr_vikram", "balanceAfter": 0 },
    "invoice": { "id": "INV-2041", "status": "paid",
                 "previousStatus": "partially_paid",
                 "amountPaid": 2202163.2, "balanceRemaining": 0 },
    "quotation": { "id": "Q-1042", "stage": "confirmed", "previousStage": "billed" },
    "auditEntryId": "aud_9c02"
  }
}
```

Status transition: `balanceRemaining == 0` → `paid`; otherwise `partially_paid`.
When the invoice reaches `paid`, the quotation stage advances to `confirmed`.

**Errors `400` — overpayment**

```json
{
  "success": false,
  "error": {
    "message": "Payment exceeds the outstanding balance",
    "details": { "amount": 1500000, "balanceRemaining": 1202163.2 }
  }
}
```

---

### `GET /invoices/:id/pdf`

Returns `application/pdf`.

```http
GET /api/v1/invoices/INV-2041/pdf
Accept: application/pdf
```

```
200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="INV-2041.pdf"
```

---

## 16. Credit Notes & Refunds

| Method | Path | Roles |
|---|---|---|
| `GET` | `/credit-notes` | any internal |
| `POST` | `/credit-notes` | finance, admin |
| `GET` | `/credit-notes/:id` | any internal |

---

### `GET /credit-notes`

```http
GET /api/v1/credit-notes?quotationId=Q-1042
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "cn_5501", "quotationId": "Q-1042", "lineId": "ln_003",
      "amount": 36774.19, "type": "credit_note",
      "reason": "Subscription cancelled — 20 unused days",
      "createdAt": "2026-03-12T10:00:00.000Z", "createdByName": "Vikram Rao" }
  ]
}
```

---

### `POST /credit-notes`

**Request**

```json
{ "quotationId": "Q-1042", "lineId": "ln_003", "amount": 12000,
  "type": "credit_note", "reason": "Goodwill adjustment for delayed delivery" }
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `amount` | number | ✅ | `> 0` |
| `type` | enum | ✅ | `refund` \| `credit_note` |
| `reason` | string | ✅ | min 10 chars |

**Response `201`** — the created record. Writes an audit entry.

---

## 17. Customer Portal

> Module **B8**. A **genuinely separate, narrower surface** — PDF §7 hard requirement.

```
┌──────────────────────────────────────────────────────────────────┐
│ • Requires a token with  kind: "customer"  — a staff token gets   │
│   403 here, and a customer token gets 403 on every internal route │
│ • Every query is filtered by customerId TAKEN FROM THE TOKEN,     │
│   never from a query parameter the client could change            │
│ • Every response passes through toPortalView() SERVER-SIDE        │
│ • NEVER returned: costPrice · margin · risk score · ceilings ·    │
│   internalNotes · ownerId · approval details · other customers    │
└──────────────────────────────────────────────────────────────────┘
```

All portal endpoints take the customer JWT in the standard header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

| Method | Path | Auth |
|---|---|---|
| `GET` | `/portal/quotations` | customer token |
| `GET` | `/portal/quotations/:id` | customer token |
| `GET` | `/portal/quotations/:id/status` | customer token |
| `GET` | `/portal/quotations/:id/comments` | customer token |
| `POST` | `/portal/quotations/:id/comments` | customer token |
| `POST` | `/portal/quotations/:id/request` | customer token |
| `POST` | `/portal/quotations/:id/confirm` | customer token |

### Scoping rule

```
customerId is read from the JWT, never from the request.

  GET /portal/quotations/Q-9999      ← belongs to another customer
  → 404 Not Found   (NOT 403)

404 rather than 403 so the customer cannot even confirm that
another quotation exists.
```

---

### `GET /portal/quotations`

The customer's own quotation list — the portal landing screen after login.

```http
GET /api/v1/portal/quotations
Authorization: Bearer <customer token>
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "reference": "Q-1042",
      "status": "sent",
      "statusLabel": "Sent",
      "total": 2269423.2,
      "currency": "INR",
      "validUntil": "2026-03-30",
      "lineCount": 3,
      "updatedAt": "2026-03-02T09:31:00.000Z",
      "hasUnreadReply": false
    },
    {
      "reference": "Q-1018",
      "status": "confirmed",
      "statusLabel": "Confirmed",
      "total": 840000,
      "currency": "INR",
      "validUntil": "2026-02-14",
      "lineCount": 2,
      "updatedAt": "2026-02-10T14:02:00.000Z",
      "hasUnreadReply": false
    }
  ],
  "meta": { "total": 2 }
}
```

Only quotations belonging to the token's `customerId` are ever returned. There is no
`customerId` query parameter — supplying one is ignored.

---

### `GET /portal/quotations/:id`

```http
GET /api/v1/portal/quotations/Q-1042
Authorization: Bearer <customer token>
```

**Response `200`** — note what is *absent*

```json
{
  "success": true,
  "data": {
    "reference": "Q-1042",
    "customerName": "Acme Corp",
    "status": "sent",
    "statusLabel": "Sent",
    "validUntil": "2026-03-30",
    "currency": "INR",
    "lines": [
      {
        "id": "ln_001",
        "productName": "Laptop Pro 14",
        "description": "14-inch business laptop",
        "qty": 20,
        "unitPrice": 87400,
        "youSave": 209760,
        "lineTotal": 1538240,
        "isRecurring": false,
        "commentCount": 0
      },
      {
        "id": "ln_003",
        "productName": "DealFlow Cloud Standard",
        "description": "Cloud platform subscription",
        "qty": 20,
        "unitPrice": 3000,
        "youSave": 3000,
        "lineTotal": 57000,
        "isRecurring": true,
        "billingLabel": "billed every month",
        "commentCount": 0
      }
    ],
    "summary": {
      "subtotal": 2208000,
      "youSaveTotal": 284760,
      "tax": 346183.2,
      "total": 2269423.2
    },
    "currentDiscountPct": 12.9,
    "terms": "Delivery within 15 working days of confirmation.",
    "canEdit": true
  }
}
```

**Errors**

| Code | Meaning |
|---|---|
| `401` | Missing or expired token |
| `403` | Token is `kind: "staff"` — internal users cannot read the portal surface |
| `404` | No such quotation **for this customer** |
| `410` | Past `validUntil` — the UI renders an "expired quotation" card |

---

### `GET /portal/quotations/:id/status`

Lightweight poll for the status pill.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "reference": "Q-1042",
    "status": "pending_reapproval",
    "statusLabel": "Pending Re-approval",
    "message": "Your requested terms are being reviewed. We'll update this page shortly.",
    "canEdit": false,
    "updatedAt": "2026-03-03T09:15:00.000Z"
  }
}
```

Customer-visible statuses: `sent` · `under_negotiation` · `pending_reapproval` ·
`confirmed` · `expired`. Internal stages such as `fulfillment` and `billed` are
**never** exposed.

---

### `POST /portal/quotations/:id/comments`

Line-level question or comment.

**Request**

```json
{
  "lineId": "ln_002",
  "message": "Can the onboarding be split across two phases?",
  "requestType": "spec"
}
```

| Field | Type | Required | Values |
|---|---|:---:|---|
| `lineId` | string | ➖ | omit for an order-level comment |
| `message` | string | ✅ | 1–2000 chars |
| `requestType` | enum | ➖ | `price` \| `quantity` \| `spec` \| `delivery` |

**Response `201`**

```json
{
  "success": true,
  "data": {
    "id": "cmt_4471",
    "lineId": "ln_002",
    "author": "Acme Corp",
    "role": "customer",
    "message": "Can the onboarding be split across two phases?",
    "requestType": "spec",
    "at": "2026-03-03T08:40:00.000Z"
  }
}
```

Side effects: a notification is created for the owning rep, and an audit entry is
written with `actorRole: "customer"`.

---

### `GET /portal/quotations/:id/comments`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "cmt_4471", "lineId": "ln_002", "author": "Acme Corp", "role": "customer",
      "message": "Can the onboarding be split across two phases?",
      "at": "2026-03-03T08:40:00.000Z" },
    { "id": "cmt_4472", "lineId": "ln_002", "author": "Priya Sharma", "role": "sales_rep",
      "message": "Yes — we can phase it 60/40 at no extra cost.",
      "at": "2026-03-03T09:02:00.000Z" }
  ]
}
```

Rep replies appear here; internal notes never do.

---

### `POST /portal/quotations/:id/request`

Submit comments plus a counter-discount proposal.

**Request**

```json
{
  "counterDiscountPct": 25,
  "justification": "Competing quote came in 18% lower on the service component."
}
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "reference": "Q-1042",
    "status": "under_negotiation",
    "statusLabel": "Under Negotiation",
    "counterDiscountPct": 25,
    "message": "Your request has been sent to the sales team.",
    "canEdit": false
  }
}
```

Side effects: `negotiationStatus → under_negotiation`, the owning rep is notified,
and an audit entry is written. Further customer edits are disabled until the rep responds.

**Errors** — `409` quotation already `confirmed` · `410` past `validUntil`

---

### `POST /portal/quotations/:id/confirm`

**The most important endpoint in the platform.** Recomputes the blended risk on the
**final agreed terms** and branches automatically — no rep action required.

**Request** `{ "acceptedTerms": true }`

**Response `200` — within limits → confirmed**

```json
{
  "success": true,
  "data": {
    "reference": "Q-1042",
    "status": "confirmed",
    "statusLabel": "Confirmed",
    "confirmedAt": "2026-03-03T10:20:00.000Z",
    "orderReference": "ORD-3018",
    "nextSteps": [
      "Your order is being prepared for fulfillment.",
      "An invoice for the one-time items will follow.",
      "Your monthly subscription starts on 2026-03-01."
    ],
    "redirectTo": "/portal/quotations/Q-1042/confirmed"
  }
}
```

**Response `200` — exceeds limits → automatic re-approval**

```json
{
  "success": true,
  "data": {
    "reference": "Q-1042",
    "status": "pending_reapproval",
    "statusLabel": "Pending Re-approval",
    "message": "Thanks — your requested terms need a quick internal review. We'll be in touch shortly.",
    "canEdit": false,
    "requiresReapproval": true
  }
}
```

Internally, on the re-approval branch:

```
stage            → pending_approval
approvalSteps    → REBUILT from the chain and RESET to pending
audit entry      → "Re-approval triggered by customer-negotiated terms"
notifications    → sent to the first approver in the rebuilt chain
```

> The customer response **never** contains the risk score, the approver roles, or the
> reason detail — only the fact that a review is in progress.

**Errors** — `409` already confirmed · `410` past `validUntil`

---
## 18. Deal Health & Alerts

> Module **B9** — stalled deals, discount anomalies, delivery-promise slippage;
> clicking an alert opens the related quotation; nudge or escalate from the alert.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/dashboard/deal-health` | manager, finance, admin, rep *(own)* |
| `GET` | `/alerts` | manager, finance, admin, rep *(own)* |
| `POST` | `/alerts/recompute` | any internal |
| `POST` | `/alerts/:id/nudge` | manager, admin |
| `POST` | `/alerts/:id/escalate` | manager, finance, admin |
| `GET` | `/dashboard/config` | manager, finance, admin |
| `PUT` | `/dashboard/config` | manager, admin |

---

### `GET /dashboard/deal-health`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "kpis": {
      "activeDeals": 54,
      "activeValue": 82000000,
      "stalledDeals": 5,
      "openAnomalies": 3,
      "pendingApprovals": 7,
      "oldestApprovalWaitingHours": 74,
      "avgCycleTimeDays": 12.8,
      "winRatePct": 38.4
    },
    "charts": {
      "dealsByStage": [
        { "stage": "draft", "count": 3, "value": 840000 },
        { "stage": "pending_approval", "count": 7, "value": 12400000 },
        { "stage": "approved", "count": 2, "value": 1900000 },
        { "stage": "confirmed", "count": 2, "value": 7300000 }
      ],
      "discountTrend": [
        { "date": "2026-01", "avgDiscountPct": 9.2, "ceilingPct": 15 },
        { "date": "2026-02", "avgDiscountPct": 11.8, "ceilingPct": 15 },
        { "date": "2026-03", "avgDiscountPct": 12.9, "ceilingPct": 15 }
      ],
      "agingBuckets": [
        { "bucket": "0-3",  "count": 22 },
        { "bucket": "4-7",  "count": 17 },
        { "bucket": "8-14", "count": 10 },
        { "bucket": "15+",  "count": 5 }
      ]
    }
  }
}
```

---

### `GET /alerts`

```http
GET /api/v1/alerts?type=discount_anomaly&severity=high&sort=-severity
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "disc-Q-1044",
      "type": "discount_anomaly",
      "severity": "high",
      "quotationId": "Q-1044",
      "customerName": "Cygnus Retail",
      "ownerName": "Rahul Mehta",
      "title": "22.0% discount vs Rahul Mehta's 8.4% average",
      "detail": "2.6× this rep's 90-day average",
      "meta": { "given": 22.0, "avg": 8.4, "ratio": 2.62 },
      "detectedAt": "2026-03-03T06:00:00.000Z",
      "ageHours": 4,
      "linkTo": "/app/quotations/Q-1044"
    },
    {
      "id": "stall-Q-1031",
      "type": "stalled",
      "severity": "medium",
      "quotationId": "Q-1031",
      "customerName": "Beta Industries",
      "title": "Beta Industries — no activity for 9 days",
      "detail": "Stage \"draft\" · threshold is 5 days",
      "meta": { "idle": 9, "threshold": 5, "ratio": 1.8 },
      "detectedAt": "2026-03-03T06:00:00.000Z",
      "linkTo": "/app/quotations/Q-1031"
    },
    {
      "id": "slip-Q-1061",
      "type": "delivery_slippage",
      "severity": "medium",
      "quotationId": "Q-1061",
      "title": "Promised Mar 12, current ETA Mar 19",
      "detail": "7 days late",
      "meta": { "promised": "2026-03-12", "eta": "2026-03-19", "daysLate": 7 },
      "linkTo": "/app/quotations/Q-1061/fulfillment"
    },
    {
      "id": "appr-Q-1052",
      "type": "approval_bottleneck",
      "severity": "medium",
      "quotationId": "Q-1052",
      "title": "Waiting on finance for 3 days",
      "detail": "SLA is 24h",
      "meta": { "hrs": 74, "slaHours": 24 },
      "linkTo": "/app/quotations/Q-1052/approval"
    }
  ],
  "meta": { "total": 4, "bySeverity": { "high": 1, "medium": 3, "low": 0 } }
}
```

`linkTo` routes to the right screen per alert type — builder, approval, or fulfillment.

---

### `POST /alerts/recompute`

Re-runs every detector. Backs the workspace **Reload Data** action, which also
recomputes each quotation's risk score and refreshes stock-derived fulfillment suggestions.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "alertsFound": 4,
    "byType": { "stalled": 1, "discount_anomaly": 1, "delivery_slippage": 1, "approval_bottleneck": 1 },
    "quotationsRescored": 14,
    "fulfillmentPlansRefreshed": 3,
    "computedAt": "2026-03-03T10:00:00.000Z"
  }
}
```

---

### `POST /alerts/:id/nudge`

**Request** `{ "message": "Can you follow up with Beta Industries today?" }` *(optional)*

**Response `200`**

```json
{
  "success": true,
  "data": {
    "alertId": "stall-Q-1031",
    "nudgedUserId": "usr_rahul",
    "nudgedUserName": "Rahul Mehta",
    "notificationId": "ntf_9921",
    "auditEntryId": "aud_a104"
  }
}
```

---

### `POST /alerts/:id/escalate`

**Request** `{ "reason": "Third week without movement on a ₹5.1L deal" }`

**Response `200`**

```json
{
  "success": true,
  "data": {
    "alertId": "stall-Q-1031",
    "severity": "high",
    "previousSeverity": "medium",
    "escalatedToUserId": "usr_2b77de",
    "escalatedToName": "Anita Desai",
    "notificationId": "ntf_9922",
    "auditEntryId": "aud_a105"
  }
}
```

---

### `GET` / `PUT /dashboard/config`

Thresholds feeding the real detection functions.

**`PUT` request**

```json
{ "stallThresholdDays": 5, "anomalySensitivity": 2.0, "approvalSlaHours": 24 }
```

| Field | Type | Rules | Used by |
|---|---|---|---|
| `stallThresholdDays` | number | `≥ 1` | stalled detector |
| `anomalySensitivity` | number | `≥ 1.0` — multiple of the rep's average | discount-anomaly detector |
| `approvalSlaHours` | number | `≥ 1` | approval-bottleneck detector |

**Response `200`** — the saved config, plus `alertsAffected` so the UI can preview impact.

---

## 19. Reporting & Exports

> Module **A7** — filters: Period, Sales Team / Rep, Approval Status, Product / Category.
> Exports: PDF / XLS.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/reports/summary` | manager, finance, admin, rep *(own)* |
| `GET` | `/reports/by-rep` | manager, finance, admin |
| `GET` | `/reports/discount-distribution` | manager, finance, admin |
| `GET` | `/reports/approval-funnel` | manager, finance, admin |
| `GET` | `/reports/revenue-mix` | manager, finance, admin |
| `GET` | `/reports/top-products` | manager, finance, admin |
| `POST` | `/reports/export` | manager, finance, admin |

### Shared filter parameters

Every reporting endpoint accepts the same filters:

| Param | Type | Example | PDF purpose |
|---|---|---|---|
| `period` | enum | `today` \| `week` \| `month` \| `custom` | View quotations/orders within a date range |
| `from` / `to` | date | `2026-01-01` / `2026-03-31` | Custom range |
| `repIds` | csv | `usr_8f21c3,usr_rahul` | Analyze individual or team performance |
| `teams` | csv | `West,National` | |
| `approvalStatus` | csv | `draft,pending_approval,approved,lost` | Filter by pending / approved / rejected |
| `productIds` | csv | `prd_lap14` | Track best-selling items |
| `categories` | csv | `hardware,service` | Track most-discounted items |

---

### `GET /reports/summary`

```http
GET /api/v1/reports/summary?period=month&repIds=usr_8f21c3&approvalStatus=approved
```

**Response `200`**

```json
{
  "success": true,
  "data": {
    "filters": { "period": "month", "from": "2026-03-01", "to": "2026-03-31",
                 "repIds": ["usr_8f21c3"], "approvalStatus": ["approved"] },
    "kpis": {
      "totalQuotations": 142,
      "totalValue": 82000000,
      "winRatePct": 38.4,
      "avgDiscountPct": 11.2,
      "avgApprovalTurnaroundHours": 6.4,
      "avgDealCycleDays": 12.8
    }
  }
}
```

---

### `GET /reports/by-rep`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "repId": "usr_8f21c3", "repName": "Priya Sharma", "team": "West",
      "quotationCount": 42, "totalValue": 28400000, "wonValue": 11200000,
      "winRatePct": 39.4, "avgDiscountPct": 8.4 },
    { "repId": "usr_rahul", "repName": "Rahul Mehta", "team": "East",
      "quotationCount": 38, "totalValue": 22100000, "wonValue": 7600000,
      "winRatePct": 34.4, "avgDiscountPct": 12.1 }
  ]
}
```

---

### `GET /reports/discount-distribution`

Histogram with the tier ceilings as reference lines.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "buckets": [
      { "range": "0-5",   "count": 34 },
      { "range": "5-10",  "count": 58 },
      { "range": "10-15", "count": 39 },
      { "range": "15-20", "count": 9 },
      { "range": "20+",   "count": 2 }
    ],
    "referenceLines": [
      { "label": "Bronze ceiling", "value": 5 },
      { "label": "Silver ceiling", "value": 10 },
      { "label": "Gold ceiling",   "value": 15 }
    ]
  }
}
```

---

### `GET /reports/approval-funnel`

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "stage": "draft",     "label": "Draft",     "count": 142, "value": 82000000 },
    { "stage": "approved",  "label": "Approved",  "count": 96,  "value": 61200000 },
    { "stage": "confirmed", "label": "Confirmed", "count": 61,  "value": 38400000 },
    { "stage": "billed",    "label": "Billed",    "count": 54,  "value": 33100000 }
  ]
}
```

---

### `GET /reports/revenue-mix`

Stacked area: one-time vs recurring over time.

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "period": "2026-01", "oneTime": 8400000, "recurring": 1240000, "total": 9640000 },
    { "period": "2026-02", "oneTime": 9100000, "recurring": 1680000, "total": 10780000 },
    { "period": "2026-03", "oneTime": 7600000, "recurring": 2140000, "total": 9740000 }
  ]
}
```

---

### `GET /reports/top-products`

```http
GET /api/v1/reports/top-products?sort=-totalValue&limit=10
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "productId": "prd_lap14", "productName": "Laptop Pro 14", "category": "hardware",
      "unitsSold": 284, "totalValue": 24800000, "avgDiscountPct": 10.8,
      "totalDiscountGiven": 2680000 },
    { "productId": "prd_setup1", "productName": "Onboarding Setup Service", "category": "service",
      "unitsSold": 190, "totalValue": 3800000, "avgDiscountPct": 16.2,
      "totalDiscountGiven": 615600 }
  ]
}
```

---

### `POST /reports/export`

Exports the **currently filtered** dataset, not the whole database.

**Request**

```json
{
  "format": "pdf",
  "report": "summary",
  "filters": {
    "period": "custom", "from": "2026-01-01", "to": "2026-03-31",
    "repIds": ["usr_8f21c3"], "approvalStatus": ["approved"],
    "categories": ["hardware", "service"]
  }
}
```

| Field | Type | Values |
|---|---|---|
| `format` | enum | `pdf` \| `xls` |
| `report` | enum | `summary` \| `by-rep` \| `discount-distribution` \| `approval-funnel` \| `revenue-mix` \| `top-products` \| `all` |

**Response `200`** — binary

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="dealflow360-summary-2026-01-01_2026-03-31.pdf"
```

XLS returns `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
The PDF header includes the active filter summary.

---

## 20. Audit Log

> PDF requirement: *all approvals, rejections, and edits must be logged with user,
> timestamp, and reason.* Append-only — there is no update or delete endpoint.

| Method | Path | Roles |
|---|---|---|
| `GET` | `/audit-log` | manager, finance, admin |
| `GET` | `/quotations/:id/audit-log` | any internal |

---

### `GET /audit-log`

```http
GET /api/v1/audit-log?entityType=quotation&entityId=Q-1042&action=approved
    &actorId=usr_2b77de&from=2026-03-01&page=1&limit=50
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    {
      "id": "aud_71c2",
      "entityType": "quotation",
      "entityId": "Q-1042",
      "action": "submitted_for_approval",
      "actorId": "usr_8f21c3",
      "actorName": "Priya Sharma",
      "actorRole": "sales_rep",
      "reason": null,
      "meta": { "riskScore": 1.36, "approvers": ["sales_manager"] },
      "at": "2026-03-02T09:31:00.000Z"
    },
    {
      "id": "aud_71c9",
      "entityType": "quotation",
      "entityId": "Q-1042",
      "action": "approved",
      "actorId": "usr_2b77de",
      "actorName": "Anita Desai",
      "actorRole": "sales_manager",
      "reason": "Strategic account — service overage acceptable",
      "meta": { "step": "sales_manager" },
      "at": "2026-03-02T11:04:00.000Z"
    },
    {
      "id": "aud_7204",
      "entityType": "quotation",
      "entityId": "Q-1042",
      "action": "reapproval_triggered",
      "actorId": null,
      "actorName": "System",
      "actorRole": "customer",
      "reason": "Re-approval triggered by customer-negotiated terms",
      "meta": { "counterDiscountPct": 25, "newRiskScore": 7.4 },
      "at": "2026-03-03T10:20:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 40, "totalPages": 1 }
}
```

### Logged actions

| Domain | Actions |
|---|---|
| Config | `product_created` · `product_updated` · `product_archived` · `price_list_updated` · `tier_ceiling_updated` · `category_ceiling_updated` · `approval_rule_created` · `approval_rule_updated` · `approval_rule_deleted` · `warehouse_created` · `warehouse_updated` · `stock_updated` · `restock_simulated` · `plan_created` · `plan_updated` · `upsell_rule_created` |
| Quotation | `quotation_created` · `line_added` · `line_updated` · `line_removed` · `order_discount_set` · `stage_changed` · `sent_to_customer` |
| Approval | `submitted_for_approval` · `auto_approved` · `approved` · `rejected` · `returned_for_revision` · `reapproval_triggered` |
| Fulfillment | `split_accepted` · `split_overridden` · `backorder_policy_set` · `backorder_consolidated` |
| Billing | `billing_built` · `subscription_changed` · `subscription_cancelled` · `credit_note_created` |
| Invoice | `invoice_created` · `invoice_sent` · `payment_recorded` |
| Portal | `customer_comment` · `customer_request_submitted` · `customer_confirmed` |
| Alerts | `alert_nudged` · `alert_escalated` |

---

## 21. Notifications

| Method | Path | Roles |
|---|---|---|
| `GET` | `/notifications` | any authenticated |
| `POST` | `/notifications/:id/read` | recipient |
| `POST` | `/notifications/read-all` | any authenticated |

---

### `GET /notifications`

```http
GET /api/v1/notifications?unreadOnly=true
```

**Response `200`**

```json
{
  "success": true,
  "data": [
    { "id": "ntf_9921", "type": "approval_request", "title": "Q-1042 needs your approval",
      "detail": "Acme Corp · ₹22,69,423 · risk 1.36",
      "quotationId": "Q-1042", "read": false, "at": "2026-03-02T09:31:00.000Z" },
    { "id": "ntf_9930", "type": "negotiation_reply", "title": "Acme Corp requested 25% discount",
      "detail": "Competing quote came in 18% lower",
      "quotationId": "Q-1042", "read": false, "at": "2026-03-03T08:40:00.000Z" }
  ],
  "meta": { "unreadCount": 2 }
}
```

Types — `approval_request` · `approval_result` · `negotiation_reply` · `anomaly_alert` ·
`nudge` · `escalation` · `payment_recorded`.

---

## 22. Enumerations

| Enum | Values |
|---|---|
| `Role` | `sales_rep` · `sales_manager` · `finance` · `admin` |
| `Category` | `hardware` · `service` · `subscription` · `accessories` |
| `Tier` | `bronze` · `silver` · `gold` |
| `Stage` | `draft` · `sent` · `under_negotiation` · `pending_approval` · `approved` · `fulfillment` · `billed` · `confirmed` · `lost` |
| `NegotiationStatus` | `none` · `sent` · `under_negotiation` · `pending_reapproval` · `confirmed` |
| `ApprovalStepStatus` | `pending` · `approved` · `rejected` · `returned` · `skipped` |
| `RiskBand` | `low` (score 0) · `medium` (≤ 5) · `high` (> 5) |
| `Cadence` | `monthly` · `quarterly` · `yearly` |
| `ProrationRule` | `daily_prorate` · `full_period` · `next_cycle_adjust` |
| `CancellationRule` | `refund_unused` · `no_refund` · `credit_note_only` |
| `OccurrenceStatus` | `scheduled` · `invoiced` · `paid` · `refunded` · `cancelled` |
| `InvoiceStatus` | `draft` · `sent` · `partially_paid` · `paid` |
| `PaymentMethod` | `card` · `bank_transfer` · `cheque` · `upi` · `other` |
| `CreditNoteType` | `refund` · `credit_note` |
| `AlertType` | `stalled` · `discount_anomaly` · `delivery_slippage` · `approval_bottleneck` |
| `Severity` | `low` · `medium` · `high` |
| `BackorderPolicy` | `ship_available_now` · `hold_until_complete` |
| `Availability` | `in_stock` · `partial` · `backorder` |

---

## 23. Error Catalogue

### HTTP status codes

| Code | Meaning | Typical cause |
|---|---|---|
| `200` | OK | Successful read or update |
| `201` | Created | Resource created |
| `204` | No Content | Logout, delete |
| `400` | Bad Request | Validation failed, overpayment, invalid override |
| `401` | Unauthorized | Missing / expired token |
| `403` | Forbidden | Role does not permit the action, or wrong approval step |
| `404` | Not Found | Unknown id, or a quotation not belonging to this customer |
| `409` | Conflict | Illegal stage transition, duplicate, wrong state |
| `410` | Gone | Quotation past `validUntil`, or an expired OTP |
| `422` | Unprocessable | Semantically invalid business request |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Unhandled — logged with a trace id |

### Validation error shape

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "details": [
      { "path": ["discountPct"], "message": "Number must be less than or equal to 100" },
      { "path": ["qty"], "message": "Expected number, received string" }
    ]
  }
}
```

### Domain error codes

| `error.code` | HTTP | Meaning |
|---|---|---|
| `INVALID_TRANSITION` | `409` | Blocked by `canTransition` — `details` carries `from`, `to`, `blockedBy` |
| `APPROVAL_STEP_MISMATCH` | `403` | Caller's role is not the pending approver |
| `APPROVAL_ALREADY_COMPLETE` | `409` | No pending step remains |
| `REASON_REQUIRED` | `400` | Reject / return without a reason of ≥ 10 chars |
| `CEILING_EXCEEDED` | `422` | Discount above the hard maximum, where blocking is configured |
| `INSUFFICIENT_STOCK` | `400` | Override allocates more than a warehouse holds |
| `OVER_ALLOCATED` | `400` | Allocations for a line exceed the ordered quantity |
| `NO_OPEN_BACKORDER` | `409` | Consolidation requested with nothing to consolidate |
| `OVERPAYMENT` | `400` | Payment exceeds the outstanding balance |
| `INVOICE_ALREADY_EXISTS` | `409` | A quotation may have only one one-time invoice |
| `QUOTATION_EXPIRED` | `410` | Quotation past its `validUntil` |
| `QUOTATION_LOCKED` | `409` | Customer edit attempted while awaiting a rep response |
| `PLAN_REQUIRED` | `400` | Subscription product added without `planId` |
| `EMAIL_NOT_VERIFIED` | `403` | Login attempted before the signup OTP was verified |
| `OTP_INVALID` | `400` | Wrong 6-digit code |
| `OTP_EXPIRED` | `410` | Code older than 10 minutes |
| `OTP_TOO_MANY_ATTEMPTS` | `429` | 5 wrong attempts — the code is destroyed |
| `OTP_RESEND_TOO_SOON` | `429` | A new code was requested within 60 seconds |
| `PASSWORD_REUSED` | `400` | New password matches the current one |
| `FIELD_NOT_ALLOWED` | `400` | `role`, `team`, `tier` or `currency` sent to `/auth/signup` — all are server-assigned |
| `WRONG_KIND` | `403` | Staff token on a portal route, or customer token on an internal route |

---

## 24. Endpoint Index

<details>
<summary><strong>All endpoints (click to expand)</strong></summary>

```
AUTH & SESSION                              A1
  POST   /auth/signup
  POST   /auth/verify-otp
  POST   /auth/resend-otp
  POST   /auth/forgot-password
  POST   /auth/reset-password
  POST   /auth/change-password
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  GET    /auth/me
  POST   /auth/switch-role

USERS & ROLES
  GET    /users
  POST   /users
  GET    /users/:id
  PATCH  /users/:id
  DELETE /users/:id
  GET    /roles

CUSTOMERS & TIERS
  GET    /customers                       ?q=CUST-0001 lookup by code
  POST   /customers
  GET    /customers/:id
  PATCH  /customers/:id
  DELETE /customers/:id
  GET    /customer-tiers
  PATCH  /customer-tiers/:tier

CATALOG                                     A2
  GET    /products
  POST   /products
  GET    /products/:id
  PATCH  /products/:id
  DELETE /products/:id
  GET    /products/:id/variants
  POST   /products/:id/variants
  PATCH  /products/:id/variants/:variantId
  DELETE /products/:id/variants/:variantId
  GET    /categories
  POST   /categories
  PATCH  /categories/:id

PRICE LISTS                                 A2
  GET    /price-lists
  PUT    /price-lists
  POST   /price-lists/bulk
  DELETE /price-lists
  GET    /price-lists/resolve

DISCOUNT & APPROVAL CHAIN                   A3
  GET    /discount-config
  PUT    /discount-config/tier-ceilings/:tier
  PUT    /discount-config/category-ceilings/:category
  GET    /approval-chain
  POST   /approval-chain
  PATCH  /approval-chain/:ruleId
  DELETE /approval-chain/:ruleId
  PUT    /approval-chain/reorder
  POST   /risk/simulate

WAREHOUSES & INVENTORY                      A4
  GET    /warehouses
  POST   /warehouses
  GET    /warehouses/:id
  PATCH  /warehouses/:id
  DELETE /warehouses/:id
  GET    /warehouses/:id/stock
  PUT    /warehouses/:id/stock/:productId
  POST   /warehouses/:id/stock/bulk
  POST   /warehouses/:id/restock
  GET    /inventory

SUBSCRIPTION PLANS                          A5
  GET    /subscription-plans
  POST   /subscription-plans
  GET    /subscription-plans/:id
  PATCH  /subscription-plans/:id
  DELETE /subscription-plans/:id
  POST   /subscription-plans/:id/preview-proration

UPSELL RULES                                A6
  GET    /upsell-rules
  POST   /upsell-rules
  PATCH  /upsell-rules/:id
  DELETE /upsell-rules/:id
  POST   /upsell-rules/preview

QUOTATIONS                                  B2, B3
  GET    /quotations
  POST   /quotations
  GET    /quotations/:id
  PATCH  /quotations/:id
  DELETE /quotations/:id
  POST   /quotations/:id/lines
  PATCH  /quotations/:id/lines/:lineId
  DELETE /quotations/:id/lines/:lineId
  PUT    /quotations/:id/order-discount
  GET    /quotations/:id/totals
  POST   /quotations/:id/stage
  POST   /quotations/:id/send-to-customer
  GET    /pipeline

RISK & APPROVALS                            B4
  GET    /quotations/:id/risk
  POST   /quotations/:id/submit-for-approval
  GET    /quotations/:id/approval
  POST   /quotations/:id/approval/approve
  POST   /quotations/:id/approval/reject
  POST   /quotations/:id/approval/return
  GET    /approvals/pending

UPSELL SUGGESTIONS                          B5
  GET    /quotations/:id/suggestions
  POST   /quotations/:id/suggestions/:productId/accept
  POST   /quotations/:id/suggestions/:productId/dismiss
  DELETE /quotations/:id/suggestions/:productId/dismiss

FULFILLMENT                                 B6
  GET    /quotations/:id/fulfillment
  POST   /quotations/:id/fulfillment/accept
  POST   /quotations/:id/fulfillment/validate
  POST   /quotations/:id/fulfillment/override
  POST   /quotations/:id/fulfillment/reset
  GET    /quotations/:id/fulfillment/backorders
  POST   /quotations/:id/fulfillment/backorder-policy
  POST   /quotations/:id/fulfillment/consolidate

BILLING & SUBSCRIPTIONS                     B7
  POST   /quotations/:id/billing/build
  GET    /quotations/:id/billing
  GET    /subscriptions/:id
  GET    /subscriptions/:id/schedule
  POST   /subscriptions/:id/preview-change
  POST   /subscriptions/:id/change
  POST   /subscriptions/:id/cancel

INVOICES & PAYMENTS                         B10
  GET    /invoices
  GET    /invoices/:id
  POST   /invoices
  POST   /invoices/:id/send
  GET    /invoices/:id/payments
  POST   /invoices/:id/payments
  GET    /invoices/:id/pdf

CREDIT NOTES
  GET    /credit-notes
  POST   /credit-notes
  GET    /credit-notes/:id

CUSTOMER PORTAL                             B8  ← separate restricted surface
  GET    /portal/quotations
  GET    /portal/quotations/:id
  GET    /portal/quotations/:id/status
  GET    /portal/quotations/:id/comments
  POST   /portal/quotations/:id/comments
  POST   /portal/quotations/:id/request
  POST   /portal/quotations/:id/confirm

DEAL HEALTH & ALERTS                        B9
  GET    /dashboard/deal-health
  GET    /alerts
  POST   /alerts/recompute
  POST   /alerts/:id/nudge
  POST   /alerts/:id/escalate
  GET    /dashboard/config
  PUT    /dashboard/config

REPORTING                                   A7
  GET    /reports/summary
  GET    /reports/by-rep
  GET    /reports/discount-distribution
  GET    /reports/approval-funnel
  GET    /reports/revenue-mix
  GET    /reports/top-products
  POST   /reports/export

AUDIT & NOTIFICATIONS
  GET    /audit-log
  GET    /quotations/:id/audit-log
  GET    /notifications
  POST   /notifications/:id/read
  POST   /notifications/read-all
```

</details>

**Total: 146 endpoints across 20 groups.**

---

## Appendix — API calls behind the 8-step Quick Test Flow

```
1  POST /auth/signup                       → OTP emailed
   POST /auth/verify-otp                   → token issued
   POST /auth/login                        { type: "internal" }
   PUT  /discount-config/tier-ceilings/gold
   POST /warehouses
   POST /subscription-plans

2  POST /quotations                        { customerId }
   POST /quotations/Q-1042/lines           { productId: laptop,  discountPct: 12 }
   POST /quotations/Q-1042/lines           { productId: service, discountPct: 18 }
   → response.line.isOverCeiling = true, overBy = 8      ← red ceiling hint

3  GET  /quotations/Q-1042/risk
   → score 1.36 · approvalPath.label "Manager approval"  ← button label comes from here
   POST /quotations/Q-1042/submit-for-approval           ← NO manual approver choice

4  GET  /quotations/Q-1042/suggestions
   POST /quotations/Q-1042/suggestions/prd_dock/accept
   → totals.marginPct AND risk.score both change in the SAME response

5  POST /auth/switch-role                  { role: "sales_manager" }
   GET  /quotations/Q-1042/approval
   POST /quotations/Q-1042/approval/approve
   GET  /quotations/Q-1042/fulfillment
   → splits across wh_main (6) + wh_east (4)             ← two warehouses

6  POST /quotations/Q-1042/fulfillment/accept
   POST /quotations/Q-1042/billing/build
   GET  /quotations/Q-1042/billing
   → oneTime {...} and recurring {...} as separate objects

7  POST /auth/signup                       { type: "customer" }  → CUST-0001
   POST /auth/verify-otp                   → token issued
   (customer gives CUST-0001 to the rep, who quotes them)
   POST /auth/login                        { type: "customer" }
   GET  /portal/quotations/Q-1042                        ← no cost/margin/risk present
   POST /portal/quotations/Q-1042/request  { counterDiscountPct: 25 }
   POST /portal/quotations/Q-1042/confirm
   → status "pending_reapproval", requiresReapproval true  ← AUTOMATIC

8  POST /quotations/Q-1042/approval/approve
   POST /invoices                          { quotationId }
   POST /invoices/INV-2041/send
   POST /invoices/INV-2041/payments        { amount: partial }  → partially_paid
   POST /invoices/INV-2041/payments        { amount: balance }  → paid
   → quotation.stage becomes "confirmed"
```
