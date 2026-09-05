# DealFlow360 — Roles & Team Management API

> How internal roles are granted, who may grant them, and why `admin` is not one of
> them.
>
> Implemented in `src/modules/users/`, `src/scripts/seed-admin.ts`.
>
> Companion documents: [`01-PROJECT-OVERVIEW.md`](./01-PROJECT-OVERVIEW.md) ·
> [`02-API-REFERENCE.md`](./02-API-REFERENCE.md) · [`03-AUTH-API.md`](./03-AUTH-API.md)

---

## Contents

| § | Section |
|---|---|
| 1 | [The model in one page](#1-the-model-in-one-page) |
| 2 | [The four roles](#2-the-four-roles) |
| 3 | [`GET /roles`](#3-get-roles) |
| 4 | [`GET /users`](#4-get-users) |
| 5 | [`GET /users/:id`](#5-get-usersid) |
| 6 | [`PATCH /users/:id`](#6-patch-usersid) |
| 7 | [Seeding an admin](#7-seeding-an-admin) |
| 8 | [Guards](#8-guards) |
| 9 | [Error catalogue](#9-error-catalogue) |
| 10 | [Worked flow](#10-worked-flow) |

---

## 1. The model in one page

```
                        EVERY SIGNUP PRODUCES A SALES_REP
                        role in the body → 400 FIELD_NOT_ALLOWED
                                     │
                                     ▼
                    ┌────────────────────────────────────┐
                    │  PATCH /users/:id  { "role": … }   │
                    │  admin only                        │
                    │  accepts: sales_rep                │
                    │           sales_manager            │
                    │           finance                  │
                    │  rejects: admin  ← 400             │
                    └────────────────┬───────────────────┘
                                     │
        ╔════════════════════════════▼═════════════════════════════╗
        ║  ADMIN CANNOT BE GRANTED THROUGH THE API AT ALL          ║
        ║                                                          ║
        ║  npm run seed:admin -- <email> "<name>" "<password>"     ║
        ║                                                          ║
        ║  Run from the backend by someone with database access.   ║
        ╚══════════════════════════════════════════════════════════╝
```

### Why `admin` is excluded from the API

There are exactly two ways a privilege can leak: a request body the server trusts, or
an endpoint that grants more than the caller holds. Both are closed here.

| Attack | Blocked by |
|---|---|
| `POST /auth/signup { "role": "admin" }` | `.strict()` schema → `400 FIELD_NOT_ALLOWED` |
| `PATCH /users/:id { "role": "admin" }` | enum excludes it → `400 VALIDATION_FAILED` |
| A rep promoting themselves | `requireRole('admin')` → `403 FORBIDDEN` |
| An admin promoting themselves higher | there is nothing higher |
| `POST /auth/switch-role` | **removed** — it used to let any signed-in user mint an admin token |

The result: **the set of admins only ever changes through database access.** Every
other role change happens through `PATCH /users/:id`, performed by a named admin.

---

## 2. The four roles

| Role | Assignable via API | What it does |
|---|:---:|---|
| `sales_rep` | ✅ | Creates quotations, applies discounts, responds to customer requests |
| `sales_manager` | ✅ | Approves discounts above threshold, configures tiers and approval chains, monitors deal health |
| `finance` | ✅ | Second-level approval on high-risk discounts, warehouse splits, billing and credit notes |
| `admin` | ❌ **seed only** | Full backend configuration, user management, platform analytics |

`sales_rep` is the default every account starts at.

---

## 3. `GET /roles`

The roles an admin may assign — the source for a role picker on the team screen.

**Auth** — `Authorization: Bearer <access token>`, `kind: staff`, role `admin`.

```http
GET /api/v1/roles
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "key": "sales_rep",
      "label": "Sales Rep",
      "description": "Creates quotations, applies discounts, responds to customer requests",
      "assignable": true,
      "activeUsers": 7
    },
    {
      "key": "sales_manager",
      "label": "Sales Manager",
      "description": "Approves discounts above threshold, configures tiers, monitors deal health",
      "assignable": true,
      "activeUsers": 2
    },
    {
      "key": "finance",
      "label": "Finance / Operations",
      "description": "Second-level approval, warehouse splits, billing and credit notes",
      "assignable": true,
      "activeUsers": 1
    }
  ]
}
```

| Field | Type | Notes |
|---|---|---|
| `key` | enum | The value to send to `PATCH /users/:id` |
| `label` | string | Display name |
| `description` | string | What the role may do |
| `assignable` | boolean | Always `true` — unassignable roles are simply absent |
| `activeUsers` | number | Count of **active** users currently holding it |

> ### `admin` is not in this list
>
> That is the point. The list returned here is exactly the enum `PATCH /users/:id`
> accepts, so a frontend that builds its dropdown from this response can never offer
> a role the API would reject. A hardcoded list in the client would drift the moment
> the roles change; this cannot.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `INVALID_CREDENTIALS` | `401` | Missing or invalid token |
| `WRONG_KIND` | `403` | Customer token |
| `FORBIDDEN` | `403` | Any staff role other than `admin` |

---

## 4. `GET /users`

The staff list an admin uses to see who holds which role.

**Auth** — admin only.

```http
GET /api/v1/users?role=sales_rep&active=true&q=priya&page=1&limit=25
```

| Query | Type | Description |
|---|---|---|
| `role` | enum | `sales_rep` \| `sales_manager` \| `finance` \| **`admin`** |
| `active` | boolean | `false` shows deactivated accounts |
| `q` | string | matches name or email |
| `page` / `limit` | number | default `1` / `25`, max `100` |

> **Filtering by `admin` is allowed here.** An admin must be able to see who the other
> admins are — that is exactly how you check whether it is safe to demote one.
> Only *assigning* the role is blocked.

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "b50f51dd-5aa8-48de-8424-df0b515a4485",
      "name": "Priya Sharma",
      "email": "priya@teamvector.space",
      "role": "sales_rep",
      "active": true,
      "verified": true,
      "createdAt": "2026-03-01T09:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 6, "totalPages": 1 }
}
```

`password_hash` is never selected, so it cannot leak through this endpoint.
`verified` is derived from `email_verified_at` rather than exposing the timestamp.

---

## 5. `GET /users/:id`

**Auth** — admin only.

```http
GET /api/v1/users/b50f51dd-5aa8-48de-8424-df0b515a4485
```

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "b50f51dd-5aa8-48de-8424-df0b515a4485",
    "name": "Priya Sharma",
    "email": "priya@teamvector.space",
    "role": "sales_rep",
    "active": true,
    "verified": true,
    "createdAt": "2026-03-01T09:00:00.000Z"
  }
}
```

**Errors** — `400` invalid uuid · `404` no such user

---

## 6. `PATCH /users/:id`

**The only way anyone becomes anything other than a `sales_rep`.**

**Auth** — admin only.

### Request — any subset; at least one field required

```json
{
  "success": true,
  "data": {
    "id": "b50f51dd-5aa8-48de-8424-df0b515a4485",
    "name": "Priya Sharma",
    "email": "priya@teamvector.space",
    "role": "sales_manager",
    "active": true,
    "verified": true,
    "createdAt": "2026-03-01T09:00:00.000Z"
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `role` | enum | `sales_rep` \| `sales_manager` \| `finance` — **`admin` is rejected** |
| `name` | string | 1–120 chars |
| `active` | boolean | `false` blocks login **immediately** |

Unknown fields are rejected with `400 FIELD_NOT_ALLOWED` — the schema is `.strict()`.
An empty body is rejected too: a no-op `PATCH` is almost always a client bug.

### Response `200`

```json
{
  "success": true,
  "data": {
    "id": "b50f51dd-5aa8-48de-8424-df0b515a4485",
    "name": "Priya Sharma",
    "email": "priya@teamvector.space",
    "role": "sales_manager",
    "active": true,
    "verified": true,
    "createdAt": "2026-03-01T09:00:00.000Z"
  }
}
```

The response is the updated user, nothing more. A client that needs to show
*"sales_rep → sales_manager"* already holds the previous value — it rendered the row
before opening the picker.

### Deactivation takes effect immediately

```
PATCH /users/:id { "active": false }
        ↓
The user's EXISTING access token stops working on the next request
        ↓
403 ACCOUNT_DISABLED
```

`requireAuth` re-reads the `active` column on every request. Without that, a JWT
issued before the change would keep working for up to 15 minutes, because an access
token cannot be revoked.

Deactivate rather than delete: the row is referenced by that person's quotations,
approvals, and audit entries.

---

## 7. Seeding an admin

```bash
npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"
```

| Situation | Result |
|---|---|
| No account with that email | Creates one as a **pre-verified admin** |
| Account exists, not an admin | Promotes it, prints `sales_rep -> admin` |
| Account already an admin | Prints "nothing to do", exits `0` |

Promoting only needs the email; name and password are used when creating.

```bash
npm run seed:admin -- priya@teamvector.space
# → Promoted priya@teamvector.space: sales_rep -> admin
```

The created account is marked verified without an OTP round-trip: it was planted by
someone with database access, so the address is already trusted.

---

## 8. Guards

Four rules protect the role system. Only the first is about privilege; the other
three are about not locking yourself out.

```
1. requireRole('admin')
   Only admins reach any of these endpoints at all.
       rep → 403 FORBIDDEN

2. admin is not in the assignable enum
   PATCH /users/:id { "role": "admin" } → 400 VALIDATION_FAILED
       the service never sees the value

3. no self-role change, no self-deactivation
   PATCH /users/<own id> { "role": … }      → 403 You cannot change your own role
   PATCH /users/<own id> { "active": false } → 403 You cannot deactivate your own account
       renaming yourself is fine

4. the last active admin cannot be demoted or deactivated
   → 409 LAST_ADMIN
```

### Why rules 3 and 4 exist

Neither is a privilege escalation — only admins reach this code. Both are **one-way
doors**:

| Action | Consequence |
|---|---|
| Demote yourself | You cannot undo it; you are no longer an admin |
| Deactivate yourself | You are locked out of the account that could undo it |
| Demote the last admin | Nobody can promote anyone, ever again |

Each is recoverable only by another admin, or by running the seed script against the
database. Blocking them costs nothing — an admin who genuinely wants to step down
promotes a replacement first.

---

## 9. Error catalogue

| `code` | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | `400` | Bad uuid, empty body, or `role: "admin"` |
| `FIELD_NOT_ALLOWED` | `400` | An unknown field was sent |
| `INVALID_CREDENTIALS` | `401` | Missing or invalid access token |
| `WRONG_KIND` | `403` | Customer token on a staff endpoint |
| `FORBIDDEN` | `403` | Not an admin, or a blocked self-target |
| `ACCOUNT_DISABLED` | `403` | The caller's own account was deactivated |
| `NOT_FOUND` | `404` | No user with that id |
| `LAST_ADMIN` | `409` | Would leave zero active admins |

### `role: "admin"` rejection

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed",
    "details": [
      { "path": "role", "message": "Invalid enum value. Expected 'sales_rep' | 'sales_manager' | 'finance'" }
    ]
  }
}
```

### Last-admin rejection

```json
{
  "success": false,
  "error": {
    "code": "LAST_ADMIN",
    "message": "This is the only active admin. Promote another admin first — or use npm run seed:admin."
  }
}
```

---

## 10. Worked flow

```bash
BASE=http://localhost:5050/api/v1

# 1. bootstrap the first admin — from the backend, not the API
npm run seed:admin -- admin@teamvector.space "Neha Gupta" "S3cure!pass"

# 2. the admin signs in normally (already verified, no OTP)
ADMIN=$(curl -s -X POST $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@teamvector.space","password":"S3cure!pass","type":"internal"}' \
  | jq -r .data.accessToken)

# 3. a rep signs up on their own → always sales_rep
#    POST /auth/signup  +  POST /auth/verify-otp

# 4. admin sees the team and who holds what
curl -s "$BASE/users?limit=50" -H "authorization: Bearer $ADMIN"

# 5. admin loads the role picker (admin is absent from this list)
curl -s "$BASE/roles" -H "authorization: Bearer $ADMIN"

# 6. admin promotes the rep
curl -s -X PATCH "$BASE/users/$REP_ID" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"role":"sales_manager"}'
# → { role: "sales_manager", … }

# 7. someone leaves — deactivate, do not delete
curl -s -X PATCH "$BASE/users/$REP_ID" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"active":false}'
# their existing token fails on the very next request: 403 ACCOUNT_DISABLED
```

### Checks worth running by hand

```bash
# a rep cannot read the team, or promote themselves
curl -s $BASE/users  -H "authorization: Bearer $REP"    # 403 FORBIDDEN
curl -s $BASE/roles  -H "authorization: Bearer $REP"    # 403 FORBIDDEN

# admin cannot be granted through the API
curl -s -X PATCH "$BASE/users/$REP_ID" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"role":"admin"}'   # 400

# a customer token cannot reach staff endpoints
curl -s $BASE/users -H "authorization: Bearer $CUSTOMER"       # 403 WRONG_KIND

# the last admin is protected
curl -s -X PATCH "$BASE/users/$ONLY_ADMIN_ID" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"role":"sales_rep"}'  # 409 LAST_ADMIN
```

---

## Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/roles` | admin | Assignable roles for the picker — **`admin` excluded** |
| `GET` | `/users` | admin | The staff list, filterable by role / active / name |
| `GET` | `/users/:id` | admin | One user |
| `PATCH` | `/users/:id` | admin | Promote, demote, rename, deactivate |

**4 endpoints.** There is no `POST` — staff accounts come only from
`POST /auth/signup`, and admins only from `npm run seed:admin`.
