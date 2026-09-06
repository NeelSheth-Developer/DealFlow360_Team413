/**
 * Quotations — API-REFERENCE §11 (15 endpoints).
 *
 * Two rules run through everything here:
 *
 * 1. PRICES COME FROM THE SERVER. `POST /lines` resolves the unit price from the
 *    customer's tier price list and the cost, tax and category from the product.
 *    That is why there is no `unitPrice` on create.
 * 2. LINES MAY ONLY BE EDITED WHILE `draft` OR `under_negotiation`. Anything else
 *    would let a rep change the terms out from under an approval already given →
 *    409 STAGE_LOCKED.
 *
 * TOTALS AND RISK ARE COMPUTED, NEVER STORED. They are derived from the lines on
 * read, so a stored total can never disagree with the table beside it, and a ceiling
 * change cannot silently invalidate an approval someone already gave.
 *
 * `productName`, `unitPrice`, `costPrice`, `taxPct` and `category` on a line are
 * SNAPSHOTS taken when it was added, so a later catalogue edit does not rewrite an
 * approved quotation.
 *
 * IDS: `id` is the uuid every route takes; `reference` is the human string ("Q-1042")
 * a rep reads aloud. Never pass a reference where a route wants an id.
 *
 * A sales_rep requesting another rep's DRAFT gets 404, not 403 — confirming the
 * record exists would reveal something about a colleague's pipeline.
 */

import { api, buildQuery } from './apiClient';

/**
 * @returns {Promise<{items: Array, meta: Object|null}>}
 * Query: stage, ownerId, customerId, tier, search, from, to, page, pageSize
 */
export function listQuotations({
  stage,
  ownerId,
  customerId,
  tier,
  search,
  from,
  to,
  page = 1,
  pageSize = 25,
} = {}) {
  return api.list(
    `/quotations${buildQuery({ stage, ownerId, customerId, tier, search, from, to, page, pageSize })}`,
  );
}

/**
 * 100 is the API's own cap (`listQuotationsQuerySchema`) and, with 100 seeded
 * quotations, the whole collection in a single request — which is both the fastest
 * answer and the only exact one, since a one-page read has no boundary for the unstable
 * `lastActivityAt` sort to lose a row across.
 *
 * The fallback exists because this route loads every line, comment and approval step per
 * row, and a smaller deployment answers 500 for a page that large while handling 25
 * comfortably. `api.listAll` drops to the smaller size only after the big page actually
 * fails, so the good case costs one request and the bad case still returns the data.
 */
const QUOTATION_PAGE_SIZE = 100;
const QUOTATION_FALLBACK_PAGE_SIZE = 25;

/**
 * EVERY matching quotation, not the first page.
 *
 * The board, the list and the pipeline value in the header all filter and total client
 * side, so a partial collection does not show up as a missing page — it shows up as a
 * smaller pipeline, which is a wrong number rather than an obviously absent one.
 *
 * @returns {Promise<{items: Array, meta: Object|null}>}
 */
export function listAllQuotations(
  { stage, ownerId, customerId, tier, search, from, to } = {},
  { onPage } = {},
) {
  return api.listAll(
    ({ page, pageSize }) =>
      `/quotations${buildQuery({ stage, ownerId, customerId, tier, search, from, to, page, pageSize })}`,
    {
      pageSize: QUOTATION_PAGE_SIZE,
      fallbackPageSize: QUOTATION_FALLBACK_PAGE_SIZE,
      onPage,
    },
  );
}

/** The full §11.0 object, including computed `totals`. */
export function getQuotation(quotationId) {
  return api.get(`/quotations/${encodeURIComponent(quotationId)}`);
}

/**
 * Create. The customer MUST already exist — there is no create-customer-inline path,
 * which would let a rep fabricate a counterparty mid-quote.
 *
 * A sales_rep may only set `ownerId` to themselves; admin and sales_manager may assign
 * to any rep or manager, but never to a finance user, whose independence from the sale
 * is the point of the payment controls. Omit `ownerId` to own it yourself.
 *
 * The server generates the reference and snapshots tier + currency from the customer.
 */
export function createQuotation({ customerId, ownerId } = {}) {
  const body = { customerId };
  if (ownerId) body.ownerId = ownerId;
  return api.post('/quotations', body);
}

/**
 * Any subset of { orderDiscountPct, promisedDeliveryDate, validUntil, internalNotes,
 * customerTerms }. Only while draft or under_negotiation, else 409 STAGE_LOCKED.
 *
 * An order discount moves every line's effective discount at once, so a change to it
 * is audited as the governance event it is.
 */
export function updateQuotation(quotationId, patch = {}) {
  // Whitelisted against `updateQuotationSchema`. Callers pass small explicit patches
  // today, but this is the one §11 write that forwards a caller's object verbatim — and
  // a single `setQuoteMeta(id, quote)` anywhere would send `id`, `reference`, `totals`
  // and the rest into a `.strict()` body and earn 400 FIELD_NOT_ALLOWED.
  const body = {};
  for (const key of [
    'orderDiscountPct',
    'promisedDeliveryDate',
    'validUntil',
    'internalNotes',
    'customerTerms',
  ]) {
    if (patch[key] !== undefined) body[key] = patch[key];
  }
  return api.patch(`/quotations/${encodeURIComponent(quotationId)}`, body);
}

/* ------------------------------------------------------------------- lines */

/**
 * Add a line. Returns the FULL updated quotation so the UI re-renders totals in one
 * round trip.
 *
 * Adding a product already present with the same plan INCREMENTS the quantity rather
 * than creating a duplicate row. For a subscription-category product with no `planId`
 * the server resolves a default plan and sets `subscriptionStartDate`.
 */
export function addLine(quotationId, { productId, qty = 1, planId = null }) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/lines`, {
    productId,
    qty: Number(qty),
    planId,
  });
}

/**
 * Any subset of { qty, discountPct, unitPrice }.
 *
 * `unitPrice` IS accepted here, unlike on create: a negotiated price is a real
 * commercial act and a rep has to be able to record the number agreed on a call. Every
 * change is audited with the before and after. What a client still cannot do is invent
 * the cost or the category, so margin and the binding ceiling stay honest.
 */
export function updateLine(quotationId, lineId, patch = {}) {
  const body = {};
  if (patch.qty !== undefined) body.qty = Number(patch.qty);
  if (patch.discountPct !== undefined) body.discountPct = Number(patch.discountPct);
  if (patch.unitPrice !== undefined) body.unitPrice = Number(patch.unitPrice);

  return api.patch(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}`,
    body,
  );
}

/** Removes the line and returns the full quotation. */
export function removeLine(quotationId, lineId) {
  return api.del(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}`,
  );
}

/**
 * Reply on a line thread. Sets `awaitingSeller: false`, bumps `lastActivityAt` and
 * emails the customer. Returns the full quotation.
 */
export function addLineComment(quotationId, lineId, message) {
  return api.post(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/comments`,
    { message },
  );
}

/* --------------------------------------------------------- ownership, stage */

/**
 * Reassign. Admin / sales_manager only, and the target must be a sales_rep or
 * sales_manager — never finance. Notifies and emails the new owner.
 */
export function setOwner(quotationId, ownerId) {
  return api.patch(`/quotations/${encodeURIComponent(quotationId)}/owner`, { ownerId });
}

/**
 * Send to the customer. Empty body. Sets stage → sent, negotiationStatus → sent,
 * sharedAt → now, and emails them.
 *
 * THERE IS NO SHARE LINK AND NO TOKEN. Access is by authenticated account only — a
 * link that grants access is a credential, and a forwarded one would hand a competitor
 * the full commercial terms. When `needsRegistration` is true the email asks the
 * customer to sign up with that address instead.
 *
 * @returns {Promise<{quotation, customer, needsRegistration}>}
 */
export function shareQuotation(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/share`);
}

/**
 * Move stage. An invalid move returns 409 with a message written for a salesperson —
 * render `error.message` verbatim.
 *
 * Three gates beyond the transition graph: `→ approved` only when no step is still
 * pending, `→ fulfillment` requires at least one shippable line (not subscription, not
 * service), and `billed → confirmed` is driven by full payment rather than a drag.
 */
export function setStage(quotationId, toStage) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/stage`, { toStage });
}

/** Reason required, minimum 5 characters. A confirmed order cannot be marked lost. */
export function markLost(quotationId, reason) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/lost`, { reason });
}

/* ------------------------------------------------------- negotiation, upsell */

/**
 * Apply the customer's counter discount to EVERY line, then re-score.
 *
 * Returns both the quotation and the new risk so the rep sees immediately what
 * accepting the counter would cost them in approvals — which is the decision they are
 * actually making. 409 NO_COUNTER_PROPOSED when none was made.
 *
 * @returns {Promise<{quotation, risk}>}
 */
export function applyCounter(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/apply-counter`);
}

/** Stops a dismissed upsell resurfacing on this quotation. Idempotent. */
export function dismissSuggestion(quotationId, productId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/dismiss-suggestion`, {
    productId,
  });
}

/**
 * Customer-facing PDF — no costs, no margins, no risk data.
 *
 * Resolves to `{ url, hosted, revoke }`. `api.pdf` normalises the two shapes this
 * route can answer with — a hosted Cloudinary URL, or the bytes streamed back — so the
 * caller only ever has a URL to open, and revokes it afterwards when `revoke` is true.
 */
export function getQuotationPdf(quotationId) {
  return api.pdf(`/quotations/${encodeURIComponent(quotationId)}/pdf`);
}
