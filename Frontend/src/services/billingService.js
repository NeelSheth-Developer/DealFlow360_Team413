/**
 * Billing and subscriptions — API-REFERENCE §14 (8 endpoints).
 *
 *   GET    /quotations/:id/billing                              any staff
 *   POST   /quotations/:id/billing/build                        any staff · IDEMPOTENT
 *   POST   /quotations/:id/lines/:lineId/proration-preview      any staff · no mutation
 *   PATCH  /quotations/:id/lines/:lineId/subscription           any staff
 *   GET    /quotations/:id/lines/:lineId/cancellation-preview   any staff
 *   DELETE /quotations/:id/lines/:lineId/subscription           any staff
 *   GET    /quotations/:id/credit-notes                         any staff
 *   POST   /quotations/:id/credit-notes                         finance, admin
 *
 * THE TWO STREAMS NEVER MERGE. One-time lines produce an invoice; recurring lines
 * produce their own billing schedule. Eight laptops and twenty cloud seats means one
 * invoice for the laptops and a monthly schedule for the seats.
 */

import { api } from './apiClient';

export function getBilling(quotationId) {
  return api.get(`/quotations/${encodeURIComponent(quotationId)}/billing`);
}

/**
 * Build the invoice for one-time lines and the schedules for recurring ones.
 *
 * IDEMPOTENT. Calling it twice rebuilds the schedules and returns the existing invoice —
 * a rebuild after a line edit is legitimate, a duplicate invoice never is. Only
 * `scheduled` occurrences are replaced; one already `invoiced` or `paid` is a financial
 * fact and survives.
 *
 * A subscription-only order produces schedules and NO invoice. That is a valid state,
 * not an error. 409 STAGE_LOCKED before the quotation is approved.
 */
export function buildBilling(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/billing/build`);
}

/**
 * Preview a mid-cycle quantity change. NO MUTATION — the customer-facing number must be
 * shown before anything is committed.
 *
 * `explanation` is rendered VERBATIM to the user, so do not reformat it.
 *
 * With unitNet = unitPrice × (1 − discountPct/100):
 *   daily_prorate      amountNow = qtyDelta × unitNet × daysRemaining / daysInCycle
 *   full_period        amountNow = 0, nothing deferred, type 'none'
 *   next_cycle_adjust  amountNow = 0, deferredAmount = qtyDelta × unitNet, type 'deferred'
 *
 * @returns {Promise<{daysInCycle, daysUsed, daysRemaining, qtyDelta, unitNet,
 *   amountNow, deferredAmount, type, prorationRule, explanation}>}
 */
export function previewProration(quotationId, lineId, newQty) {
  return api.post(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/proration-preview`,
    { newQty: Number(newQty) },
  );
}

/**
 * Apply the change. Regenerates the schedule and, WHEN THE PRORATION IS NEGATIVE,
 * issues a credit note automatically — a mid-cycle reduction that only lowered the next
 * invoice would quietly keep money the customer paid for days they will not use.
 *
 * @returns {Promise<{billing, proration}>}
 */
export function changeSubscriptionQty(quotationId, lineId, qty) {
  return api.patch(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/subscription`,
    { qty: Number(qty) },
  );
}

/**
 * What cancelling would produce, before committing.
 *
 *   refund_unused     amount = perCycle × daysRemaining / daysInCycle, type 'refund'
 *   credit_note_only  same amount, type 'credit_note'
 *   no_refund         0, type null
 */
export function previewCancellation(quotationId, lineId) {
  return api.get(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/cancellation-preview`,
  );
}

/**
 * Cancel. Sets subscriptionStatus → cancelled, flips every future `scheduled`
 * occurrence to `cancelled`, and creates the refund or credit note the plan's rule
 * calls for.
 */
export function cancelSubscription(quotationId, lineId) {
  return api.del(
    `/quotations/${encodeURIComponent(quotationId)}/lines/${encodeURIComponent(lineId)}/subscription`,
  );
}

/* ------------------------------------------------------------ credit notes */

export async function listCreditNotes(quotationId) {
  const data = await api.get(`/quotations/${encodeURIComponent(quotationId)}/credit-notes`);
  return Array.isArray(data) ? data : [];
}

/**
 * Issue a credit note or refund. FINANCE / ADMIN ONLY, like every money action.
 * Emails the customer.
 *
 * @param type 'refund' | 'credit_note'
 * @param lineId null for an order-level note
 */
export function createCreditNote(quotationId, { lineId = null, amount, type, reason }) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/credit-notes`, {
    lineId,
    amount: Number(amount),
    type,
    reason,
  });
}
