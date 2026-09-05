/**
 * Customer portal — API-REFERENCE §16 (7 endpoints).
 *
 *   GET  /customer/quotations                            customer
 *   GET  /customer/quotations/:id                        customer
 *   POST /customer/quotations/:id/lines/:lineId/comments customer
 *   POST /customer/quotations/:id/request                customer
 *   POST /customer/quotations/:id/confirm                customer
 *   GET  /customer/quotations/:id/pdf                    customer
 *   GET  /customer/invoices/:id/pdf                      customer
 *
 * THIS IS WHERE THE "REAL, SEPARATE, RESTRICTED VIEW" REQUIREMENT IS TRUE ON THE SERVER.
 * Everything is authorised against the CUSTOMER session — a staff token gets
 * 403 WRONG_KIND. Every query is scoped by the session's own customer id in the query
 * itself, not by filtering after a fetch, and a customer id is never read from the path
 * or body. Another customer's record returns 404, not 403, because a 403 confirms the
 * record exists.
 *
 * THERE IS NO PORTAL TOKEN AND NO SHARE LINK. Access is by authenticated account only.
 * A link that grants access is a credential, and a forwarded one would hand a
 * competitor the full commercial terms.
 *
 * The projection is an ALLOW-LIST of named safe fields, not the internal quotation with
 * fields deleted — so a column added to `quotations` next month cannot leak in by
 * accident. Never present at any stage: costPrice, any margin, the risk score or its
 * breakdown, any ceiling, internalNotes, owner/creator fields, approvalSteps, or the
 * internal role names. `side` collapses a comment author to 'customer' | 'seller', so
 * the customer never learns whether a rep, a manager or finance replied.
 *
 * Because the server already strips everything, the client needs no toPortalView() of
 * its own — rendering this payload directly IS the safe path.
 */

import { api } from './apiClient';

/**
 * The customer's own shared quotations, newest activity first.
 *
 * Only those where the customer id matches the session AND the quotation has been
 * shared. A DRAFT IS NEVER VISIBLE.
 */
export async function listMyQuotations() {
  const data = await api.get('/customer/quotations');
  return Array.isArray(data) ? data : [];
}

/** The full projection for one quotation. 404 when it belongs to another customer. */
export function getMyQuotation(quotationId) {
  return api.get(`/customer/quotations/${encodeURIComponent(quotationId)}`);
}

/**
 * Ask about one line. Permitted whenever `canMessage` — which stays true during
 * internal approval, because a customer waiting on a decision must still be able to
 * chase it.
 *
 * Empty or whitespace-only is rejected. Sets awaitingSeller, bumps lastActivityAt,
 * notifies and emails the owning rep, and audits with actorRole: 'customer'.
 */
export function addComment(quotationId, lineId, message) {
  return api.post(
    `/customer/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/comments`,
    { message },
  );
}

/**
 * Propose different terms.
 *
 * Either field may be omitted but NOT BOTH — a request with neither a number nor a
 * sentence gives the rep nothing to act on.
 *
 * Only when `canProposeTerms`, else 409 ACTION_NOT_AVAILABLE explaining that the
 * previous request is still under review. Moves stage sent → under_negotiation.
 */
export function submitRequest(quotationId, { counterDiscountPct, justification } = {}) {
  const body = {};
  if (counterDiscountPct !== undefined && counterDiscountPct !== null && counterDiscountPct !== '') {
    body.counterDiscountPct = Number(counterDiscountPct);
  }
  if (justification) body.justification = justification;

  if (Object.keys(body).length === 0) {
    throw new Error('Enter a discount you would like, a note explaining why, or both.');
  }
  return api.post(`/customer/quotations/${encodeURIComponent(quotationId)}/request`, body);
}

/**
 * Confirm. Empty body. THE AUTOMATIC RE-APPROVAL BRANCH — the most important behaviour
 * in the product, and it happens entirely server-side with no rep action.
 *
 * The server re-scores the FINAL agreed terms (never a cached number), resolves the
 * chain from stored config, and then either:
 *   · approvers required → stage pending_approval, approvalSteps rebuilt from scratch,
 *     negotiationStatus pending_reapproval, first approver and owning rep notified,
 *     audited as "Re-approval triggered by customer-negotiated terms"; or
 *   · none required → stage confirmed.
 *
 * This is what stops a negotiated discount bypassing governance just because it was
 * agreed after the last approval.
 *
 * THE SCORE ITSELF IS NEVER RETURNED — it is internal governance data. Use
 * `requiredApprovers` for the count and say nothing about the number behind it.
 *
 * @returns {Promise<{quotation, reapproval: boolean, requiredApprovers: number}>}
 */
export function confirmQuotation(quotationId) {
  return api.post(`/customer/quotations/${encodeURIComponent(quotationId)}/confirm`);
}

/**
 * The customer's own quotation as a PDF. Ownership is re-checked against the session
 * before anything renders, so this route does not skip the scoping the others apply.
 */
export function getMyQuotationPdf(quotationId) {
  return api.pdf(`/customer/quotations/${encodeURIComponent(quotationId)}/pdf`);
}

/** The customer's own invoice as a PDF. A DRAFT invoice returns 404 — it has not been
 * issued, so it does not exist to the customer. */
export function getMyInvoicePdf(invoiceId) {
  return api.pdf(`/customer/invoices/${encodeURIComponent(invoiceId)}/pdf`);
}

/**
 * The capability model: three INDEPENDENT booleans, not one `locked` flag.
 *
 *   stage                                     canMessage canProposeTerms canConfirm
 *   sent, under_negotiation                       ●            ●             ●
 *   pending_approval                              ●            –             –
 *   approved, fulfillment, billed, confirmed      ●            –             –
 *   lost                                          –            –             –
 *
 * Read them off the payload rather than deriving from stage — the server owns this and
 * a client-side copy would drift. Provided as a helper only so callers have one place
 * to default a missing field.
 */
export function capabilities(view) {
  return {
    canMessage: Boolean(view?.canMessage),
    canProposeTerms: Boolean(view?.canProposeTerms),
    canConfirm: Boolean(view?.canConfirm),
    awaitingSellerReply: Boolean(view?.awaitingSellerReply),
    isDecided: Boolean(view?.isDecided),
  };
}

/* --------------------------------------------------------------- presentation */

/**
 * How each stage reads to a customer.
 *
 * The internal stages collapse: `approved`, `fulfillment` and `billed` all say
 * "Confirmed", because the difference between them is our operational business and
 * telling a customer their order is "billed" before they have seen an invoice is
 * alarming rather than informative. `pending_approval` is the one that surfaces honestly
 * as "pending re-approval" — a customer whose confirmation has not completed is owed the
 * reason, though never the identity of who is reviewing it.
 *
 * Both the internal keys and the collapsed public ones are present, so this map holds
 * whichever vocabulary the projection's `stage` field uses.
 */
export const CUSTOMER_STATUS_META = {
  draft: { label: 'Draft', tone: 'text-ink-soft', bg: 'bg-ink/8' },
  sent: { label: 'Awaiting your review', tone: 'text-state-info', bg: 'bg-state-info/14' },
  under_negotiation: {
    label: 'Under Negotiation',
    tone: 'text-accent-amber',
    bg: 'bg-accent-amber/16',
  },
  pending_approval: {
    label: 'Pending Re-approval',
    tone: 'text-brand-700',
    bg: 'bg-brand-500/16',
  },
  pending_reapproval: {
    label: 'Pending Re-approval',
    tone: 'text-brand-700',
    bg: 'bg-brand-500/16',
  },
  approved: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  fulfillment: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  billed: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  confirmed: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  lost: { label: 'Closed', tone: 'text-state-danger', bg: 'bg-state-danger/12' },
  closed: { label: 'Closed', tone: 'text-state-danger', bg: 'bg-state-danger/12' },
};

/** Falls back to `status` then to "awaiting review" so a row always renders a label. */
export function statusMeta(view) {
  return (
    CUSTOMER_STATUS_META[view?.stage] ??
    CUSTOMER_STATUS_META[view?.status] ??
    CUSTOMER_STATUS_META.sent
  );
}

/** The route key for one quotation. `reference` is what the projection carries. */
export function portalQuoteKey(view) {
  return view?.id ?? view?.reference ?? null;
}
