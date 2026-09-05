/**
 * Fulfillment — API-REFERENCE §13 (5 endpoints).
 *
 *   GET  /quotations/:id/fulfillment                   any staff
 *   POST /quotations/:id/fulfillment/accept            rep, manager, finance, admin
 *   POST /quotations/:id/fulfillment/override          "
 *   POST /quotations/:id/fulfillment/consolidate       "
 *   POST /quotations/:id/fulfillment/backorder-policy  "
 *
 * THE ALLOCATION ORDERING (§13.0) — this is shown to users on the warehouse screen, so
 * it has to be the ordering the code actually uses:
 *   1. a warehouse that can fulfil the ENTIRE line   — fewer shipments
 *   2. then one ALREADY shipping on this order       — consolidation
 *   3. then the LOWEST shippingCostWeight            — cheapest
 *   4. then the MOST stock                           — avoid fragmenting the remainder
 *   5. anything left over becomes a backorder, ETA from the shortest replenishLeadDays
 *      among warehouses that stock the product
 *
 * Subscription and service lines are skipped entirely — nothing physical to ship, and
 * allocating them would inflate the shipment count and its cost.
 *
 *   shipmentCount = distinct warehouses used
 *   estimatedCost = Σ (baseShipCost × shippingCostWeight) over used warehouses
 *
 * A backordered product no warehouse carries gets `etaDate: null` rather than a guess.
 */

import { api } from './apiClient';

export const BACKORDER_POLICIES = ['ship_available', 'hold_until_complete'];

/**
 * The plan.
 *
 * RECOMPUTED FROM LIVE STOCK ON EVERY READ — unless `acceptedAt` is set, in which case
 * the rep's accepted or overridden decision is returned verbatim. They made that call
 * for a reason the algorithm cannot see, such as a customer who wants one delivery.
 *
 * `canConsolidate` is true when an open backorder could now be filled from current
 * stock. Units already promised to OTHER live quotations are excluded from that check —
 * a prompt that leads to a failed consolidation is worse than no prompt.
 */
export function getFulfillment(quotationId) {
  return api.get(`/quotations/${encodeURIComponent(quotationId)}/fulfillment`);
}

/**
 * Accept the suggestion. Empty body. Persists the split and moves the stage from
 * `approved` to `fulfillment`. 409 NOTHING_TO_SHIP when there are no physical lines.
 */
export function acceptSplit(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/fulfillment/accept`);
}

/**
 * Override the split.
 *
 * Validated server-side with PER-CELL errors so the UI can highlight the exact input:
 * on 422 INVALID_ALLOCATION, `error.details.errors` is a list where line-level problems
 * omit `warehouseId` and stock problems name it.
 *
 * Whatever the override does not cover becomes a backorder, so both views of the order
 * still reconcile to the same quantities.
 *
 * @param allocations [{ lineId, warehouseId, qty }]
 * @returns {Promise<{plan, costDelta}>} `costDelta` is what the override cost against
 *   the suggestion — surface it, because seeing the price of a manual choice is the
 *   whole point of having a suggestion.
 */
export function saveOverride(quotationId, allocations) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/fulfillment/override`, {
    allocations: allocations.map((a) => ({
      lineId: a.lineId,
      warehouseId: a.warehouseId,
      qty: Number(a.qty),
    })),
  });
}

/**
 * Merge an open backorder into fewer shipments.
 *
 * @returns {Promise<{plan, saving: {shipmentsSaved, costSaved}}>}
 * 409 NOTHING_TO_CONSOLIDATE when there is no open backorder.
 */
export function consolidateBackorder(quotationId) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/fulfillment/consolidate`);
}

/** `ship_available` ships what is in stock now; `hold_until_complete` waits. */
export function setBackorderPolicy(quotationId, policy) {
  return api.post(`/quotations/${encodeURIComponent(quotationId)}/fulfillment/backorder-policy`, {
    policy,
  });
}

/**
 * Group allocations by line for the split table and its stacked bars.
 *
 * Purely a reshape of what §13.1 already returned — no arithmetic that the server has
 * not already done.
 */
export function groupAllocationsByLine(plan, lines = []) {
  const shippable = lines.filter((l) => !l.isSubscription && l.category !== 'service');

  return shippable.map((line) => {
    const rows = (plan?.allocations ?? []).filter((a) => a.lineId === line.id);
    const allocated = rows.reduce((sum, a) => sum + (Number(a.qty) || 0), 0);
    const backorder = (plan?.backorders ?? []).find((b) => b.lineId === line.id) ?? null;

    return {
      line,
      rows,
      allocated,
      ordered: Number(line.qty) || 0,
      shortfall: backorder ? Number(backorder.qty) || 0 : 0,
      etaDate: backorder?.etaDate ?? null,
    };
  });
}
