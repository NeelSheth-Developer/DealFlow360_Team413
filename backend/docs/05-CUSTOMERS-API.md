# DealFlow360 — Customers API

> How a customer account comes into being, how a rep finds it, and who may change the
> one field that affects money.
>
> **Status:** implemented and tested against the live database —
> `src/modules/customers/`, `src/db/schema.ts`.
>
> Companion documents: [`01-PROJECT-OVERVIEW.md`](./01-PROJECT-OVERVIEW.md) ·
> [`02-API-REFERENCE.md`](./02-API-REFERENCE.md) · [`03-AUTH-API.md`](./03-AUTH-API.md) ·
> [`04-ROLES-API.md`](./04-ROLES-API.md)

---

## Contents

| § | Section |
|---|---|
| 1 | [The model in one page](#1-the-model-in-one-page) |
| 2 | [The customer code](#2-the-customer-code) |
| 3 | [Tiers, and what they control](#3-tiers-and-what-they-control) |
| 4 | [`GET /customers?q=`](#4-get-customersq) |
| 5 | [`PATCH /customer-tiers/:tier`](#5-patch-customer-tierstier) |
| 6 | [What a customer never sees](#6-what-a-customer-never-sees) |
| 7 | [Guards](#7-guards) |
| 8 | [Error catalogue](#8-error-catalogue) |
| 9 | [Worked flow](#9-worked-flow) |

---

## 1. The model in one page

```
        CUSTOMER                                    SALES REP
  ────────────────────────                  ─────────────────────────
  POST /auth/signup
  { name, email, password,
    type: "customer" }
         │
         │  tier = 'bronze'   (forced, never from the body)
         │  currency = 'INR'
         ▼
  POST /auth/verify-otp
         │
         │  CUST-0001 assigned
         ▼
  ┌────────────────────┐
  │  Your Customer ID  │
  │     CUST-0001      │ ──── reads it out over the phone ────┐
  └────────────────────┘                                      │
                                                              ▼
                                            GET /customers?q=CUST-0001
                                                              │
                                            POST /quotations { customerId }
                                                              │
                                            (ceilings are tier-wide:
                                             PATCH /customer-tiers/gold)
                                                              │
  ◄──────────── quotation appears in their portal ────────────┘
```

### Four rules

1. **A rep never creates a customer.** There is no `POST /customers`. Accounts come
   only from `POST /auth/signup` with `type: "customer"`, so every one has proved its
   own email and chosen its own password.
2. **Self-signup always lands on `bronze`.** `tier` is not a field on the signup body;
   sending it returns `400 FIELD_NOT_ALLOWED`. Only an admin or sales_manager raises it.
3. **There is no browse-all list.** `q` is required on the lookup, so the customer book
   cannot be enumerated by anyone who can sign in.
4. **A customer row is never edited through this API.** There is no per-customer
   `PATCH` and no `DELETE`. The only writable thing here is the ceiling attached to a
   *tier*, which applies to everyone on it.

---

## 2. The customer code

```
CUST-0001
────┬──── ──┬─
    │       └── the database identity column, zero-padded to 4
    └────────── fixed prefix
```

- **Derived, never stored.** It comes from the `seq` identity column on `customers`,
  so two concurrent signups can never be handed the same code. A `SELECT max()+1`
  would race.
- **Stable for the life of the account.** Nothing an admin or the customer can edit
  changes it, which is what makes it safe to quote in an email or read down a phone.
- **Says nothing about the customer.** No tier, no region, no revenue — a code that
  encodes attributes leaks them, and breaks the day the attribute changes.
- **Readable aloud.** Four digits, one prefix, no characters that sound alike.

The customer sees it on their portal landing page and gives it to their rep. It is the
only identifier that crosses between the two applications.

---

## 3. Tiers, and what they control

| Tier | Price list | Discount ceiling |
|---|---|---|
| `bronze` | base price | 5% |
| `silver` | ≈4% off base | 10% |
| `gold` | ≈8% off base | 15% |

Tier is the single field on a customer that moves money. It decides:

- **which price list resolves** when a rep adds a product to a quotation, and
- **the headline discount ceiling** feeding the blended risk score.

```
tier ceiling  ─┐
               ├──►  MIN(the two)  ──►  the limit that binds each line
category ceiling ┘
```

The **stricter of the two** binds. A Gold customer is allowed 15% overall, but a
service line still caps at the 10% category ceiling — which is exactly the case the
blended risk score in [`01-PROJECT-OVERVIEW.md §8`](./01-PROJECT-OVERVIEW.md#8-blended-discount-risk-score)
is built to catch.

That is why `tier` cannot come from the signup body: a customer choosing their own
tier would be choosing their own prices.

The ceiling numbers are stored in the `tier_config` table, seeded with the values
above, and moved with [`PATCH /customer-tiers/:tier`](#5-patch-customer-tierstier).
They are read back alongside the category ceilings through
[`GET /discount-config`](./02-API-REFERENCE.md#6-discount-governance--approval-chain).

---

## 4. `GET /customers?q=`

Look a customer up by the code they gave you.

**Auth** — any internal (staff) token.

```http
GET /api/v1/customers?q=CUST-0001
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

| Query | Type | Required | Description |
|---|---|:---:|---|
| `q` | string | ✅ | matches `customerCode`, company name, or email |

- **`q` is required.** Omitting it returns `400`, not every customer.
- Matching is case-insensitive and partial on name and email; a `CUST-` code is exact.

### Response `200`

```json
{
  "success": true,
  "data": [
    {
      "id": "cus_9f2c1a44",
      "customerCode": "CUST-0001",
      "name": "Acme Corp",
      "contactName": "R. Iyer",
      "email": "buyer@acmecorp.com",
      "tier": "bronze",
      "currency": "INR",
      "verified": true,
      "active": true,
      "createdAt": "2026-03-01T09:00:00.000Z"
    }
  ]
}
```

- Always an **array** — a name or email fragment can match several customers, while a
  `CUST-` code matches at most one.
- Empty `data` means no match. That is a `200`, not a `404`: the search ran and found
  nothing.
- **No `meta` block.** There is no paging, because a lookup returns a handful of rows
  rather than a page of them.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `VALIDATION_FAILED` | `400` | `q` missing or empty |
| `INVALID_CREDENTIALS` | `401` | Missing or invalid token |
| `WRONG_KIND` | `403` | Customer token — the portal has its own surface |

---

## 5. `PATCH /customer-tiers/:tier`

The discount ceiling attached to a **tier** — business policy, not a per-customer
decision.

**Auth** — admin or sales_manager.

```http
PATCH /api/v1/customer-tiers/gold
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Request

```json
{ "maxDiscountPct": 18 }
```

| Field | Type | Rules |
|---|---|---|
| `maxDiscountPct` | number | `0`–`100`. **`0` is valid** — that tier gets no discretionary discount at all |

### Response `200`

```json
{
  "success": true,
  "data": {
    "tier": "gold",
    "maxDiscountPct": 18,
    "updatedAt": "2026-03-01T09:00:00.000Z"
  }
}
```

### What this changes, and what it does not

- **Tier-wide.** One call moves the ceiling for every customer on that tier. There is
  no per-customer override — that is the point of having tiers.
- **Existing quotations are not re-scored.** Risk is recomputed on the next mutation or
  on `Reload Data`, so lowering a ceiling cannot retroactively invalidate an approval
  someone already gave.
- **It does not move anyone between tiers.** A customer's own `tier` column is set to
  `bronze` at signup and is not editable through this API.

### Why admin / sales_manager only

This number is one half of what bounds every discount in the system:

```
tier ceiling  ─┐
               ├──►  MIN(the two)  ──►  the limit that binds each line
category ceiling ┘
```

Raising it widens what the blended risk score will tolerate on every future quotation
for every customer on that tier — a rep raising it would be widening their own
discretion.

### Errors

| Code | HTTP | Cause |
|---|---|---|
| `VALIDATION_FAILED` | `400` | Outside `0`–`100`, unknown tier, or an unexpected field |
| `INVALID_CREDENTIALS` | `401` | Missing or invalid token |
| `WRONG_KIND` | `403` | Customer token |
| `FORBIDDEN` | `403` | Any staff role other than admin or sales_manager |

---

## 6. What a customer never sees

Everything above is the **internal** surface. A customer token cannot reach any of it —
`403 WRONG_KIND`.

```
┌─────────────────────────────────────────────────────────────────┐
│ INTERNAL  /api/v1/customers/*     staff token, full record      │
│           tier · currency · active · other customers            │
├─────────────────────────────────────────────────────────────────┤
│ PORTAL    /api/v1/portal/*        customer token, own quotes    │
│           NEVER: costPrice · margin · risk score · ceilings ·   │
│                  internalNotes · ownerId · approval details ·   │
│                  any other customer                             │
└─────────────────────────────────────────────────────────────────┘
```

A customer sees their own `tier` only as the prices they are quoted — never as a field
they could argue with, and never as the ceiling it implies. Portal responses are built
by `toPortalView()` **server-side**; hiding fields in the UI is not access control.

See [`02-API-REFERENCE.md §17`](./02-API-REFERENCE.md#17-customer-portal).

---

## 7. Guards

```
1. requireKind('staff')
   A customer token on any /customers route → 403 WRONG_KIND

2. tier ceilings are admin / sales_manager only
   A rep widening a ceiling → 403 FORBIDDEN
       it bounds every discount they themselves would give

3. a customer row is not writable through this API
   no PATCH /customers/:id, no DELETE
       the customer owns their identity; the code is derived; verified is earned

4. q is required on the lookup
   → 400 VALIDATION_FAILED
       otherwise the customer book is enumerable by anyone who can sign in

```

---

## 8. Error catalogue

| `code` | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | `400` | Missing `q`, invalid uuid, empty body, bad enum |
| `FIELD_NOT_ALLOWED` | `400` | An unexpected field was sent |
| `INVALID_CREDENTIALS` | `401` | Missing or invalid access token |
| `WRONG_KIND` | `403` | Customer token on an internal route |
| `FORBIDDEN` | `403` | A rep attempting a ceiling change |
| `NOT_FOUND` | `404` | No customer with that id |

---

## 9. Worked flow

```bash
BASE=http://localhost:5050/api/v1

# 1. the customer registers themselves — tier is forced to bronze
curl -s -X POST $BASE/auth/signup -H 'content-type: application/json' \
  -d '{"name":"Acme Corp","email":"buyer@acmecorp.com","password":"Acme@2026","type":"customer"}'
# → { "success": true, "message": "OTP sent successfully" }

curl -s -X POST $BASE/auth/verify-otp -H 'content-type: application/json' \
  -d '{"email":"buyer@acmecorp.com","otp":"418302","type":"customer"}'
# → customerCode: "CUST-0001", tier: "bronze"

# 2. they read CUST-0001 to their rep, who looks them up
curl -s "$BASE/customers?q=CUST-0001" -H "authorization: Bearer $REP"

# 3. the rep quotes them; their tier's price list resolves automatically
curl -s -X POST $BASE/quotations -H "authorization: Bearer $REP" \
  -H 'content-type: application/json' -d "{\"customerId\":\"$ID\"}"

# 4. a manager widens what Gold customers may be discounted
curl -s -X PATCH "$BASE/customer-tiers/gold" -H "authorization: Bearer $MANAGER" \
  -H 'content-type: application/json' -d '{"maxDiscountPct":18}'
# → { tier: "gold", maxDiscountPct: 18 }  — applies to every Gold customer
```

### Checks worth running by hand

```bash
# no browse-all: q is required
curl -s "$BASE/customers" -H "authorization: Bearer $REP"              # 400

# a rep cannot widen a ceiling
curl -s -X PATCH "$BASE/customer-tiers/gold" -H "authorization: Bearer $REP" \
  -H 'content-type: application/json' -d '{"maxDiscountPct":25}'       # 403

# ceilings are bounded
curl -s -X PATCH "$BASE/customer-tiers/gold" -H "authorization: Bearer $ADMIN" \
  -H 'content-type: application/json' -d '{"maxDiscountPct":150}'      # 400

# a customer token cannot reach the internal surface
curl -s "$BASE/customers?q=CUST-0001" -H "authorization: Bearer $CUSTOMER"  # 403
```

---

## Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/customers?q=` | any internal | Look up by code, name, or email — `q` required |
| `PATCH` | `/customer-tiers/:tier` | admin / sales_manager | The tier-wide discount ceiling |

**2 endpoints.**

- No `POST` — customers self-register at [`POST /auth/signup`](./03-AUTH-API.md#6-post-authsignup).
- No browse-all — `q` is required.
- No per-customer `PATCH` or `DELETE` — a customer row is written only by signup.
