# DealFlow360 — Authentication API

> Complete reference for the auth surface: every endpoint, request, response, error,
> and the security decision behind each one.
>
> Implemented in `src/modules/auth/`, `src/lib/{password,jwt,otp,sanitize}.ts`,
> `src/middleware/{auth,rate-limit}.ts`.
>
> Companion documents: [`01-PROJECT-OVERVIEW.md`](./01-PROJECT-OVERVIEW.md) ·
> [`02-API-REFERENCE.md`](./02-API-REFERENCE.md) · [`04-ROLES-API.md`](./04-ROLES-API.md) · [`05-CUSTOMERS-API.md`](./05-CUSTOMERS-API.md)

---

## Contents

| § | Section |
|---|---|
| 1 | [Design in one page](#1-design-in-one-page) |
| 2 | [Conventions](#2-conventions) |
| 3 | [Token lifetimes](#3-token-lifetimes) |
| 4 | [Database tables](#4-database-tables) |
| 5 | [Redis keys](#5-redis-keys) |
| 6 | [`POST /auth/signup`](#6-post-authsignup) |
| 7 | [`POST /auth/verify-otp`](#7-post-authverify-otp) |
| 8 | [`POST /auth/resend-otp`](#8-post-authresend-otp) |
| 9 | [`POST /auth/login`](#9-post-authlogin) |
| 10 | [`POST /auth/forgot-password`](#10-post-authforgot-password) |
| 11 | [`POST /auth/reset-password`](#11-post-authreset-password) |
| 12 | [`POST /auth/change-password`](#12-post-authchange-password) |
| 13 | [`POST /auth/refresh`](#13-post-authrefresh) |
| 14 | [`POST /auth/logout`](#14-post-authlogout) |
| 15 | [`GET /auth/me`](#15-get-authme) |
| 16 | [Middleware](#16-middleware) |
| 17 | [Sanitization](#17-sanitization) |
| 18 | [Error catalogue](#18-error-catalogue) |
| 19 | [Security decisions](#19-security-decisions) |
| 20 | [Setup & testing](#20-setup--testing) |

---

## 1. Design in one page

Two applications, one auth surface. The `type` field selects which table to
authenticate against; everything else is shared.

```
                    POST /auth/signup  { name, email, password, type }
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
             type: "internal"                            type: "customer"
                    │                                           │
              USERS table                              CUSTOMERS table
              role = 'sales_rep'  (forced)             tier = 'bronze'  (forced)
                                                       currency = 'INR'
                    │                                           │
                    └─────────────────┬─────────────────────────┘
                                      ▼
                          6-digit OTP emailed, 10 min
                          201 { message: "OTP sent successfully" }
                                      │
                    POST /auth/verify-otp  { email, otp, type }
                                      ▼
                          email_verified_at = now()
                          accessToken (15 min) + refreshToken (7 days)
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
          JWT { kind: "staff",                JWT { kind: "customer" }
                role: "sales_rep" }           ← no role claim at all
                    │                                   │
              /api/v1/*                          /api/v1/portal/*
```

### The three rules the implementation enforces

```
1. ROLE AND TIER COME FROM THE DATABASE ROW, NEVER THE REQUEST
   Schemas are .strict(), so `role`, `tier` and `currency` are REJECTED
   with 400 FIELD_NOT_ALLOWED — not silently dropped. A field that is never
   accepted cannot be honoured by accident in a later refactor.

2. EVERY ROUTE CHECKS `kind`
   customer token → internal route → 403 WRONG_KIND
   staff token    → portal route   → 403 WRONG_KIND
   This server-side check IS the wall between the two apps.

3. NO RESPONSE REVEALS WHETHER AN EMAIL EXISTS
   Same message, same status, and the same CPU cost for unknown email,
   wrong password, and an address registered in the other table.
```

---

## 2. Conventions

**Base URL** — `http://localhost:5050/api/v1` · `https://api.teamvector.space/api/v1`

> Port 5050, not 5000 — macOS AirPlay Receiver listens on 5000 and silently
> answers `403` to everything.

**Success**

```json
{ "success": true, "data": {} }
```

**Error** — always carries a stable `code`

```json
{
  "success": false,
  "error": {
    "code": "OTP_EXPIRED",
    "message": "That code has expired. Request a new one.",
    "details": []
  }
}
```

**Authenticated requests**

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**`type` values** — `internal` (staff) · `customer`. Present on every unauthenticated
endpoint; never needed once a token exists, because the token carries `kind`.

---

## 3. Token lifetimes

| | Access token | Refresh token |
|---|---|---|
| **Internal** | **15 min** (`900`) | **7 days** (`604800`) |
| **Customer** | **15 min** (`900`) | **7 days** (`604800`) |
| Format | signed JWT | 32 random bytes, base64url |
| Sent on | every request | only `POST /auth/refresh` |
| Stored server-side | ❌ no | ✅ yes, SHA-256 hashed |
| Revocable | ❌ **no** | ✅ yes, instantly |

Only `expiresIn` (the access token, in seconds) is returned. The refresh token's
lifetime is not — the client cannot act on it, and simply uses the refresh token until
`POST /auth/refresh` answers `401`.

```
 login
   │
   ├─ accessToken   ──── 15 min ────►│ expired
   │                                  │
   │                   POST /auth/refresh { refreshToken }
   │                   old row revoked, new pair issued   ← rotation
   │                                  │
   ├─ accessToken (new) ─ 15 min ────►│  … repeats
   │
   └─ refreshToken ────────── 7 days ──────────► must sign in again
```

**Why the access token is short.** It is a self-contained JWT the server never looks
up, so it cannot be cancelled. Logout, a password reset, and deactivating a user all
act on the refresh token; any access token already issued keeps working until it
expires. Fifteen minutes bounds that window.

**Closing the window entirely.** `requireAuth` also checks the `active` column on
every request, so a deactivated account is rejected immediately rather than 15 minutes
later. That costs one indexed lookup per request.

**What revocation affects**

```
logout            → that refresh token revoked
reset-password    → ALL refresh tokens revoked  (sessionsRevoked)
change-password   → all except the caller's     (currentSessionKept: true)
refresh           → the presented token is revoked and replaced (rotation)
replay detected   → EVERY session for that account revoked
```

---

## 4. Database tables

Three tables. Generated migration: `drizzle/0000_auth_tables.sql`.

### `users` — internal staff

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `varchar(120)` | |
| `email` | `varchar(255)` | **unique**, stored lower-cased |
| `password_hash` | `text` | `scrypt$N$r$p$salt$hash` |
| `role` | `role` enum | **default `sales_rep`** — never from the request |
| `email_verified_at` | `timestamptz` | `null` until OTP verified |
| `active` | `boolean` | default `true`; `false` blocks login instantly |
| `created_at` / `updated_at` | `timestamptz` | |

### `customers`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `seq` | `integer` identity | **unique**; `CUST-0001` is derived from it |
| `name` | `varchar(200)` | company / account name |
| `contact_name` | `varchar(120)` | nullable, rep fills in later |
| `email` | `varchar(255)` | **unique**, lower-cased |
| `password_hash` | `text` | |
| `tier` | `tier` enum | **default `bronze`** — never from the request |
| `currency` | `varchar(3)` | default `INR` |
| `email_verified_at` · `active` · timestamps | | as above |

> **Why `CUST-0001` is derived, not stored.** The code comes from the database
> identity column, so two concurrent signups can never be handed the same one. A
> `SELECT max()+1` would race.

### `refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `token_hash` | `varchar(64)` | **unique**, SHA-256 of the token |
| `subject_id` | `uuid` | user or customer id |
| `subject_kind` | `subject_kind` enum | `staff` \| `customer` |
| `expires_at` | `timestamptz` | now + 7 days |
| `revoked_at` | `timestamptz` | `null` while live |
| `user_agent` · `ip` | `varchar` | recorded for a future session list |
| `created_at` | `timestamptz` | |

Indexes: unique on `token_hash`, composite on `(subject_id, subject_kind)` for
bulk revocation, and one on `expires_at` so the pruning job avoids a full scan.

> **Why Postgres and not Redis.** Refresh tokens must survive a cache flush, and
> revocation has to be durable. Only the hash is stored, so a database leak does not
> hand out working sessions.

---

## 5. Redis keys

OTPs live in Upstash: short-lived, high-churn, and Redis expires them for us — so
there is no sweeper job and no way to forget one.

| Key | Value | TTL |
|---|---|---|
| `{prefix}:otp:{purpose}:{kind}:{email}` | HMAC-SHA256 of the code | 600s |
| `{prefix}:otp:attempts:{purpose}:{kind}:{email}` | counter | 600s |
| `{prefix}:otp:cooldown:{purpose}:{kind}:{email}` | `"1"` | 60s |
| `{prefix}:ratelimit:global:{ip}:{window}` | counter | 60s |
| `{prefix}:ratelimit:auth:{ip}:{email}:{window}` | counter | 60s |

**Codes are stored as an HMAC, never in the clear** — a Redis dump cannot be replayed
to take over an account mid-signup. The HMAC is keyed by purpose and email, so a code
minted for a password reset cannot be spent on a signup.

**If the email fails to send** the request still returns `201`. The account row exists
and the code is live in Redis, so the signup itself succeeded — reporting failure for
work that was actually done would leave the caller unable to tell a delivery problem
from a real rejection. The failure is logged at `error` level; the user can request a
new code.

**OTP rules**

```
length          6 digits, from crypto.randomInt (CSPRNG, not Math.random)
lifetime        10 minutes
attempts        5 — then the code is destroyed, not just rejected
reuse           single-use, destroyed on success
concurrent      issuing a new code invalidates the previous one
resend          60-second cooldown
```

---

## 6. `POST /auth/signup`

Creates an account. **Both kinds self-register** — `type` selects the table.

### Request — internal

```json
{
  "name": "Priya Sharma",
  "email": "priya@teamvector.space",
  "password": "S3cure!pass",
  "type": "internal"
}
```

### Request — customer

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
| `name` | string | ✅ | 1–120 (internal) / 1–200 (customer) chars |
| `email` | string | ✅ | valid email, unique per table, normalised |
| `password` | string | ✅ | 8–200 chars |
| `type` | enum | ✅ | `internal` \| `customer` |

> ### ⚠ Fields the body does NOT accept
>
> | Field | Set to | Changed later by |
> |---|---|---|
> | `role` | always `sales_rep` | admin — `PATCH /users/:id` |
> | `tier` | always `bronze` | not editable through the API |
> | `currency` | `INR` | not editable through the API |
>
> Sending any of them returns **`400 FIELD_NOT_ALLOWED`**. Rejected, not ignored:
> a field that is never accepted cannot be honoured by accident later.
>
> ### Admin is unreachable from the API
>
> ```
> POST /auth/signup      always writes role = 'sales_rep'
>                        role in the body → 400 FIELD_NOT_ALLOWED
>          ↓
> PATCH /users/:id       the only way to change a role
>                        requires an EXISTING admin
> ```
>
> Those two rules leave no path to `admin` from outside. The first one is planted
> from the backend by someone with database access:
>
> ```bash
> npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"
> ```
>
> Every admin after that is promoted by an existing admin, so the change has an
> actor. `POST /auth/switch-role` used to undercut all of this — any signed-in user
> could mint an admin token — and has been **removed**.

### Behaviour

```
Does this email already exist in the selected table?
        │
        ├── NO ──────────────────→ create row, email an OTP
        │                          201 { message: "OTP sent successfully" }
        │
        └── YES ── password correct?
                     ├── YES, verified ─────→ 200  tokens issued (acts as login)
                     ├── YES, not verified ─→ 201  fresh OTP emailed, same body
                     └── NO ────────────────→ 401  Invalid email or password
```

### Response `201` — new signup

```json
{
  "success": true,
  "message": "OTP sent successfully"
}
```

An **unverified** account signing up again gets the identical body, so the endpoint
cannot be used to test which addresses are registered.

> ### Testing without an email provider
>
> With `EXPOSE_DEV_OTP=true` **and** a non-production `NODE_ENV`, the response also
> carries the code:
>
> ```json
> { "success": true, "message": "OTP sent successfully", "devOtp": "418302" }
> ```
>
> Two independent guards, so a single misconfiguration cannot start leaking codes.
> The same field appears on `resend-otp` and `forgot-password`. Defaults to `false`;
> **must stay false in production.**

### Response `200` — existing verified account

Internal:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "3f6c1a44-7b3e-4a91-b2d8-5e6f0c1a2b3d",
      "name": "Priya Sharma",
      "email": "priya@teamvector.space",
      "role": "sales_rep"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "8Kd2n_QpVx1mR7sT4uY9wZ0aB3cE6fG8hJ1kL4mN7pQ",
    "expiresIn": 900
  }
}
```

Customer:

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "9f2c1a44-8d3e-4b12-a7c5-1e2f3a4b5c6d",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": null,
      "email": "buyer@acmecorp.com",
      "tier": "bronze",
      "currency": "INR"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "5Hf9k_LmNo2pQ3rS6tU8vW1xY4zA7bC0dE3fG6hJ9kL",
    "expiresIn": 900
  }
}
```

`kind` is not in the body — it lives inside the JWT, where the server reads it. The
client already knows which app to open, and the payload carries either `user` or
`customer`.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `VALIDATION_FAILED` | `400` | Bad email, short password, missing field |
| `FIELD_NOT_ALLOWED` | `400` | A server-assigned field was sent |
| `INVALID_CREDENTIALS` | `401` | Email exists, password wrong |
| `ACCOUNT_DISABLED` | `403` | `active = false` |
| `OTP_RESEND_TOO_SOON` | `429` | Signed up again within 60s |
| `RATE_LIMITED` | `429` | More than 10 attempts / 60s for this IP + email |

---

## 7. `POST /auth/verify-otp`

Confirms the emailed code and **issues the token**. Signup alone does not produce a
usable account.

### Request

```json
{
  "email": "priya@teamvector.space",
  "otp": "418302",
  "type": "internal"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `email` | string | ✅ | the address that received the code |
| `otp` | string | ✅ | 6 digits (spaces and dashes are stripped) |
| `type` | enum | ✅ | `internal` \| `customer` |

> **No `purpose` field.** The server stores the purpose on the OTP row when it issues
> the code and reads it back here — the same reason `role` and `tier` are never taken
> from the request. A signup code cannot be replayed against a password reset, because
> the stored purpose will not match the endpoint that received it.

### Response `200`

Identical in shape to the signup response for an existing account, so the frontend
handles one payload either way. For a customer this is where `customerCode` becomes
active.

```json
{
  "success": true,
  "data": {
    "customer": {
      "id": "9f2c1a44-8d3e-4b12-a7c5-1e2f3a4b5c6d",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": null,
      "email": "buyer@acmecorp.com",
      "tier": "bronze",
      "currency": "INR"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "5Hf9k_LmNo2pQ3rS6tU8vW1xY4zA7bC0dE3fG6hJ9kL",
    "expiresIn": 900
  }
}
```

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `OTP_INVALID` | `400` | Wrong code — one attempt burned |
| `OTP_EXPIRED` | `410` | Older than 10 min, or already used |
| `OTP_TOO_MANY_ATTEMPTS` | `429` | 5 wrong tries — the code is destroyed |
| `ACCOUNT_DISABLED` | `403` | `active = false` |

---

## 8. `POST /auth/resend-otp`

### Request

```json
{
  "email": "priya@teamvector.space",
  "type": "internal",
  "purpose": "signup"
}
```

| Field | Type | Required | Values |
|---|---|:---:|---|
| `email` | string | ✅ | |
| `type` | enum | ✅ | `internal` \| `customer` |
| `purpose` | enum | ✅ | `signup` \| `password_reset` |

> `purpose` **is** required here, unlike `verify-otp`. The previous code may have
> expired and been cleaned up, so there is no stored row to read it from — the server
> has to be told which kind of code to send. It selects an email template; it grants
> nothing.

### Response `200` — always this, whatever happened

```json
{
  "success": true,
  "data": {
    "message": "If that address needs a code, one has been sent.",
    "retryAfterSeconds": 60
  }
}
```

Unknown address, already-verified account, and a genuine resend are indistinguishable.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `OTP_RESEND_TOO_SOON` | `429` | Requested within the 60s cooldown |

---

## 9. `POST /auth/login`

### Request

```json
{
  "email": "anita@teamvector.space",
  "password": "S3cure!pass",
  "type": "internal"
}
```

### Response `200`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "2b77de00-4c1a-4f8e-9a2b-6d5e4c3b2a19",
      "name": "Anita Desai",
      "email": "anita@teamvector.space",
      "role": "sales_manager"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "9Kd2n_QpVx1mR7sT4uY9wZ0aB3cE6fG8hJ1kL4mN7pQ",
    "expiresIn": 900
  }
}
```

Token payload: `{ "sub": "2b77de00-…", "kind": "staff", "role": "sales_manager" }`
A customer token is `{ "sub": "9f2c1a44-…", "kind": "customer" }` — **no `role` claim**.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_CREDENTIALS` | `401` | Unknown email, wrong password, **or the address exists only in the other table** |
| `EMAIL_NOT_VERIFIED` | `403` | Correct credentials, OTP never confirmed |
| `ACCOUNT_DISABLED` | `403` | `active = false` |
| `RATE_LIMITED` | `429` | > 10 attempts / 60s for this IP + email |

```json
{
  "success": false,
  "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" }
}
```

> **One message for every credential failure.** Distinct wording would let anyone
> probe which addresses are registered. The implementation also runs a dummy hash
> when the email is unknown, so an absent account takes the same ~50 ms as a real
> password check — otherwise response *timing* leaks what the message hides.

---

## 10. `POST /auth/forgot-password`

Step 1 of a reset. Works for both kinds.

### Request

```json
{ "email": "buyer@acmecorp.com", "type": "customer" }
```

### Response `200` — always this

```json
{
  "success": true,
  "data": {
    "message": "If that address matches an account, a reset code has been sent.",
    "retryAfterSeconds": 60
  }
}
```

Never reveals whether the address exists.

---

## 11. `POST /auth/reset-password`

Step 2. Verifies the code and sets the new password in one call.

### Request

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
| `otp` | string | ✅ | 6 digits from the reset email |
| `newPassword` | string | ✅ | 8–200 chars, must differ from the current one |
| `type` | enum | ✅ | `internal` \| `customer` |

### Response `200`

```json
{
  "success": true,
  "data": {
    "message": "Password updated. Please sign in with your new password.",
    "sessionsRevoked": 3
  }
}
```

> **Every refresh token is revoked.** A reset is the recovery path after a suspected
> compromise, so it logs the attacker out everywhere. No token is issued here — the
> user signs in again.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `OTP_INVALID` | `400` | Wrong code |
| `PASSWORD_REUSED` | `400` | Same as the current password — **the code is not consumed** |
| `OTP_EXPIRED` | `410` | Older than 10 minutes |
| `OTP_TOO_MANY_ATTEMPTS` | `429` | 5 wrong attempts |

> **A reused password does not burn the code.** The OTP is checked without being
> consumed, the new password is validated, and only then is the code spent. Typing
> your old password by mistake would otherwise cost you the code and force a second
> email. Attempts are still counted, so this is not a free guessing window.

---

## 12. `POST /auth/change-password`

For a user already signed in who knows their current password. No OTP.

**Requires** `Authorization: Bearer <access token>`.

### Request

```json
{
  "currentPassword": "S3cure!pass",
  "newPassword": "N3wS3cure!pass",
  "refreshToken": "9Kd2n_QpVx1mR7sT4uY9wZ0aB3cE6fG8hJ1kL4mN7pQ"
}
```

| Field | Type | Required | Rules |
|---|---|:---:|---|
| `currentPassword` | string | ✅ | must match the stored hash |
| `newPassword` | string | ✅ | 8–200 chars, must differ |
| `refreshToken` | string | ➖ | when sent, **this one session survives** |

### Response `200`

```json
{
  "success": true,
  "data": { "message": "Password updated.", "sessionsRevoked": 2, "currentSessionKept": true }
}
```

Every other session is revoked; the caller's own stays alive, so changing a password
does not sign you out of the tab you are using. Omit `refreshToken` to revoke
everything.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_CREDENTIALS` | `401` | `currentPassword` wrong, or no valid token |
| `PASSWORD_REUSED` | `400` | Same as the current password |

---

## 13. `POST /auth/refresh`

### Request

```json
{ "refreshToken": "9Kd2n_QpVx1mR7sT4uY9wZ0aB3cE6fG8hJ1kL4mN7pQ" }
```

### Response `200`

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "2Xy7p_ZqAb3cD4eF5gH6iJ7kL8mN9oP0qR1sT2uV3wX",
    "expiresIn": 900
  }
}
```

> ### Rotation, and what it catches
>
> The presented token is **revoked** and a new one issued. Store the new one — the old
> one is dead.
>
> ```
> Attacker steals a refresh token
>         ↓
> Legitimate client refreshes first  → token rotated, old row revoked
>         ↓
> Attacker replays the stolen token  → lookup finds a REVOKED row
>         ↓
> Every session for that account is revoked, and the event is logged
> ```
>
> A revoked token being presented means it leaked, so the safe response is to end all
> sessions and make the real user sign in again.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_REFRESH_TOKEN` | `401` | Unknown, expired, or revoked (**replay kills all sessions**) |
| `ACCOUNT_DISABLED` | `403` | Account deactivated since issue |

---

## 14. `POST /auth/logout`

### Request

```json
{ "refreshToken": "9Kd2n_QpVx1mR7sT4uY9wZ0aB3cE6fG8hJ1kL4mN7pQ" }
```

### Response `204` — no body

Idempotent: an unknown or already-revoked token still reports success, so a
double-click cannot produce an error.

> The **access token stays valid for up to 15 minutes** after logout. It cannot be
> revoked — that is precisely why it is short-lived. Clients should discard both
> tokens locally on logout.

---

## 15. `GET /auth/me`

Session restore. **Requires** `Authorization: Bearer <access token>`.

### Response `200` — staff

```json
{
  "success": true,
  "data": {
    "kind": "staff",
    "id": "2b77de00-4c1a-4f8e-9a2b-6d5e4c3b2a19",
    "name": "Anita Desai",
    "email": "anita@teamvector.space",
    "role": "sales_manager",
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

### Response `200` — customer

```json
{
  "success": true,
  "data": {
    "kind": "customer",
    "id": "9f2c1a44-8d3e-4b12-a7c5-1e2f3a4b5c6d",
    "customerCode": "CUST-0001",
    "name": "Acme Corp",
    "email": "buyer@acmecorp.com",
    "tier": "bronze",
    "currency": "INR"
  }
}
```

No `permissions` and no `role` — there is nothing to gate, because the portal exposes
only that customer's own quotations.

`kind` **is** returned here, unlike the login responses: after a page refresh the
frontend holds only a token and needs to know which shell to render.

> `permissions` is a **convenience for the UI**, not the enforcement point. Every
> route re-checks the role server-side.

---

## 16. Middleware

### `requireAuth`

```
1. Read the Bearer header             missing        → 401
2. Verify JWT: signature, expiry,      invalid        → 401
   issuer, audience
3. Reject a customer token that
   carries a role claim                tampered       → 401
4. Look up `active` on the row         deactivated    → 403 ACCOUNT_DISABLED
5. Attach req.auth = { id, kind, role? }
```

Step 4 costs one indexed lookup per request and closes the window an access token
otherwise leaves — without it, a disabled account keeps working for up to 15 minutes.

### `requireKind('staff' | 'customer')`

The wall between the two applications.

```
customer token → /api/v1/quotations        → 403 WRONG_KIND
staff token    → /api/v1/portal/quotations → 403 WRONG_KIND
```

### `requireRole(...roles)`

Staff-only, and only the listed roles. A customer token can never satisfy it, because
a customer JWT carries no `role` claim at all.

### Rate limiting

| Limiter | Applies to | Limit | Keyed on | On Redis failure |
|---|---|---|---|---|
| `rateLimit()` | every route | 100 / 60s | IP | **fail open** |
| `authRateLimit()` | credential endpoints | 10 / 60s | IP **+ email** | **fail closed** |

> **Two deliberate differences.**
>
> *Keyed on IP + email* — keying on IP alone lets a botnet spread guesses across many
> accounts; adding the email caps attempts against any single account too.
>
> *Credential endpoints fail closed* — allowing unlimited login attempts because Redis
> is down is worse than briefly rejecting valid ones. General traffic still fails open,
> so a cache outage does not take the API down.

---

## 17. Sanitization

Applied by the Zod schemas **before** validation, so every rule downstream sees one
canonical shape.

| Input | Transform | Why |
|---|---|---|
| `email` | NFKC normalise → strip control chars → trim → lowercase | Two visually identical addresses must not both register — that would let two accounts claim one inbox |
| `name` | strip control chars → collapse whitespace → trim | `"Acme   Corp\n"` and `"Acme Corp"` are the same company |
| `otp` | keep digits only | Codes get pasted as `418 302` or `418-302` |
| headers (`user-agent`, `ip`) | clean → truncate to column width | An oversized header must not fail the insert |

**Layers, not a single line of defence:**

```
Zod .strict()      → unknown fields REJECTED (role, tier, …)
sanitize.ts        → one canonical form per value
Drizzle            → parameterised SQL, always
escapeHtml()       → the name is escaped again on the way into an email
```

The name is sanitised on input **and** escaped on output. Input cleaning is not a
reason to skip output encoding — they defend different things.

---

## 18. Error catalogue

| `code` | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | `400` | Zod rejected the body; `details` lists path + message |
| `FIELD_NOT_ALLOWED` | `400` | A server-assigned field (`role`, `tier`, `currency`) was sent |
| `OTP_INVALID` | `400` | Wrong 6-digit code |
| `PASSWORD_REUSED` | `400` | New password equals the current one |
| `INVALID_CREDENTIALS` | `401` | Unknown email, wrong password, or missing/invalid token |
| `INVALID_REFRESH_TOKEN` | `401` | Unknown, expired, or revoked refresh token |
| `EMAIL_NOT_VERIFIED` | `403` | Correct credentials, OTP never confirmed |
| `ACCOUNT_DISABLED` | `403` | `active = false` |
| `WRONG_KIND` | `403` | Staff token on a portal route, or the reverse |
| `FORBIDDEN` | `403` | Role does not permit the action |
| `NOT_FOUND` | `404` | Unknown route or account |
| `LAST_ADMIN` | `409` | Demoting or deactivating the only active admin (see [`04-ROLES-API.md`](./04-ROLES-API.md) · [`05-CUSTOMERS-API.md`](./05-CUSTOMERS-API.md)) |
| `OTP_EXPIRED` | `410` | Code older than 10 minutes, or already used |
| `OTP_TOO_MANY_ATTEMPTS` | `429` | 5 wrong attempts — the code is destroyed |
| `OTP_RESEND_TOO_SOON` | `429` | New code requested within 60 seconds |
| `RATE_LIMITED` | `429` | Rate limit exceeded |
| `INTERNAL_ERROR` | `500` | Unhandled; logged server-side, no detail in production |

### Validation error shape

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": [
      { "path": "password", "message": "Password must be at least 8 characters" },
      { "path": "email", "message": "Must be a valid email address" }
    ]
  }
}
```

### Field-not-allowed shape

```json
{
  "success": false,
  "error": {
    "code": "FIELD_NOT_ALLOWED",
    "message": "Request contains fields that are assigned by the server",
    "details": [{ "path": "", "message": "Unrecognized key(s) in object: 'role'" }]
  }
}
```

---

## 19. Security decisions

### Password hashing — scrypt

```
scrypt$32768$8$1$<salt base64url>$<hash base64url>
        │    │ │
        │    │ └── p  parallelisation
        │    └──── r  block size
        └───────── N  cost — 2^15
```

- **scrypt, from `node:crypto`** — a real memory-hard KDF with no native build step.
  bcrypt and argon2 need `node-gyp`, which breaks on a teammate's machine at the worst
  moment.
- **~50 ms per hash**, measured. Slow enough to make offline cracking of a leaked hash
  expensive, fast enough not to be a DoS vector.
- **Parameters stored in the hash string**, so `N` can be raised later without
  invalidating existing passwords.
- **Random 16-byte salt per password** — two identical passwords produce different
  hashes, so a leaked table cannot be attacked with one rainbow table.
- **`timingSafeEqual`** for the comparison.
- **Malformed stored hash returns `false`**, never throws — a corrupt row denies
  access instead of crashing the request.

### Timing-safe user enumeration defence

```
login with an unknown email
        ↓
fakeVerify() runs a dummy scrypt at the same cost
        ↓
~50 ms either way
```

Without it, an unknown address returns in ~2 ms and a real one in ~50 ms — the timing
alone reveals which addresses are registered, no matter how careful the message is.

### JWT

- **Issuer and audience** are set and verified, so a token minted for the portal
  cannot be used on the internal API.
- **A customer token carrying a `role` claim is rejected outright**, however it was
  minted.
- Verification failures return `null` rather than throwing, so no caller can
  accidentally treat a rejected token as valid.

### Refresh tokens

- 32 bytes from `randomBytes` — not a JWT, because it must be revocable.
- **Only the SHA-256 hash is stored.** SHA-256 is correct here (unlike for passwords):
  the input is 256 bits of entropy we generated, so there is nothing to brute-force
  and no reason to be slow.
- **Rotated on every refresh**, with replay detection that kills all sessions.

### OTP

- `crypto.randomInt` — CSPRNG. `Math.random()` is predictable and must never generate
  a security code.
- **Stored as an HMAC keyed by purpose + email**, so a Redis dump is not replayable
  and a reset code cannot be spent on a signup.
- **The code is destroyed after 5 wrong attempts**, not merely rejected — that turns
  unlimited guessing into at most five tries per issued code.
- **Logged only outside production.** An OTP in a log file is a password in a log file.

### What is deliberately NOT done

| Not done | Why |
|---|---|
| Password complexity rules (upper + digit + symbol) | Length beats composition. A minimum of 8 with a 200 max, and no reuse of the current one. |
| Email verification link | An OTP works on a phone with no deep-linking, and cannot leak through a referrer header. |
| Storing OTPs in Postgres | They expire in 10 minutes; Redis TTL removes them without a sweeper job. |
| Storing refresh tokens in Redis | They must survive a cache flush, and revocation has to be durable. |
| Returning `kind` in login responses | It lives in the JWT. The client sent `type` and already knows. |

---

## 20. Setup & testing

### Environment

```bash
cp .env.example .env
openssl rand -hex 32          # paste into JWT_SECRET
```

Required to boot: `DATABASE_URL`, `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `JWT_SECRET`.
Everything else has a working default. `src/config/env.ts` validates on boot and exits
with a readable report listing every missing variable.

### Migrate, seed an admin, run

```bash
npm install
npm run db:migrate      # applies drizzle/*.sql
npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"
npm run dev
```

`seed:admin` promotes the account if it already exists, or creates it pre-verified if
it does not. It is the only way an `admin` can come into being.

### Browser tester

```bash
npm run dev
open http://localhost:5050          # the page is the API's own root in development
```

A dependency-free page covering all ten auth endpoints plus the admin-guarded
`/roles` and `/users`. It captures tokens from every response and reuses them, fills
the OTP in for you from `devOtp`, and keeps a request log with status codes.

```
public/index.html    the page
public/app.js        one call() path — auth and logging cannot drift per handler
```

Two deliberate choices:

- **Served by the API itself, not opened as a `file://`.** Same origin means no CORS
  hop between the page and the endpoints, so nothing has to be added to
  `CORS_ORIGINS` for testing.
- **Mounted before `helmet()` and only when `NODE_ENV !== 'production'`.** Before
  helmet so its inline styles are not blocked by the CSP; behind the NODE_ENV check
  so it cannot exist in production — the guard is not a flag someone can flip.
  Verified: with `NODE_ENV=production` both `/` and `/app.js` return `404` while
  `/api/v1/health` still returns `200`.

Session state lives in `sessionStorage`, so a reload keeps your tokens but closing
the tab discards them.

### Walk the flow

Set `EXPOSE_DEV_OTP=true` in `.env` and the code comes back in the response, so the
whole flow works without a verified sending domain.

```bash
BASE=http://localhost:5050/api/v1

# 1. sign up
curl -s -X POST $BASE/auth/signup -H 'content-type: application/json' \
  -d '{"name":"Priya Sharma","email":"priya@teamvector.space","password":"S3cure!pass","type":"internal"}'
# → {"success":true,"message":"OTP sent successfully","devOtp":"418302"}

# 2. verify (devOtp came back in step 1)
curl -s -X POST $BASE/auth/verify-otp -H 'content-type: application/json' \
  -d '{"email":"priya@teamvector.space","otp":"418302","type":"internal"}'
# → tokens

# 3. authenticated call
curl -s $BASE/auth/me -H "authorization: Bearer $ACCESS"

# 4. refresh (note the returned refreshToken changes — rotation)
curl -s -X POST $BASE/auth/refresh -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}"

# 5. logout
curl -s -X POST $BASE/auth/logout -H 'content-type: application/json' \
  -d "{\"refreshToken\":\"$REFRESH\"}" -o /dev/null -w '%{http_code}\n'   # 204
```

### Checks worth running by hand

```bash
# role is rejected, not ignored  → 400 FIELD_NOT_ALLOWED
curl -s -X POST $BASE/auth/signup -H 'content-type: application/json' \
  -d '{"name":"X","email":"x@y.com","password":"S3cure!pass","type":"internal","role":"admin"}'

# customer token on an internal route → 403 WRONG_KIND
# login before verifying             → 403 EMAIL_NOT_VERIFIED
# 11 rapid logins                    → 429 RATE_LIMITED
# replay an already-used refresh     → 401, and every session dies
```

### Quality gates

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint, type-checked rules
npm run build        # tsc -p tsconfig.json
```

All three pass clean on the current implementation.

---

## Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/signup` | public | Create account (both kinds) → OTP |
| `POST` | `/auth/verify-otp` | public | Prove the email → **issues tokens** |
| `POST` | `/auth/resend-otp` | public | New code |
| `POST` | `/auth/login` | public | Both kinds, `type` picks the table |
| `POST` | `/auth/forgot-password` | public | Reset step 1 → OTP |
| `POST` | `/auth/reset-password` | public | Reset step 2 → revokes all sessions |
| `POST` | `/auth/change-password` | bearer | Signed in, knows current password |
| `POST` | `/auth/refresh` | public | Rotates the pair |
| `POST` | `/auth/logout` | public | Revoke one refresh token |
| `GET` | `/auth/me` | bearer | Session restore |

**10 endpoints.**
