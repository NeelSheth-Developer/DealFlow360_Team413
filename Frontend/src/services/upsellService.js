/**
 * Upsell rules — API-REFERENCE §9 (5 endpoints).
 *
 *   GET    /upsell-rules          any staff
 *   POST   /upsell-rules          admin, sales_manager
 *   PUT    /upsell-rules/:id      admin, sales_manager · product ids immutable
 *   DELETE /upsell-rules/:id      admin, sales_manager · a real delete
 *   POST   /upsell-rules/suggest  any staff · what the rep sees beside the cart
 *
 * Ranking is `coPurchaseScore + (promoted ? 25 : 0) + marginPct × 0.3`, and every
 * suggestion carries a `breakdown` of those three terms so the ordering is not a
 * black box.
 *
 * THE MARGIN FLOOR IS A HARD DROP, NOT A DEMOTION. A product whose margin at the
 * customer's tier price falls below its rule's `minMarginPct` is removed entirely —
 * ranking it last still puts it on screen, and the panel must never nudge a rep
 * toward an add-on that costs the business money.
 */

import { api, buildQuery } from './apiClient';

export async function listUpsellRules({ active, triggerProductId } = {}) {
  const data = await api.get(`/upsell-rules${buildQuery({ active, triggerProductId })}`);
  return Array.isArray(data) ? data : [];
}

/** `suggestedProductId` must differ from `triggerProductId`. Score is 0–100. */
export function createUpsellRule({
  triggerProductId,
  suggestedProductId,
  coPurchaseScore,
  promoted = false,
  minMarginPct,
}) {
  return api.post('/upsell-rules', {
    triggerProductId,
    suggestedProductId,
    coPurchaseScore: Number(coPurchaseScore),
    promoted: Boolean(promoted),
    minMarginPct: Number(minMarginPct),
  });
}

/**
 * Any subset of { coPurchaseScore, promoted, minMarginPct, active }.
 *
 * The two product ids cannot be changed: that would silently repoint an existing
 * rule rather than create a new pairing.
 */
export function updateUpsellRule(ruleId, patch = {}) {
  // Whitelisted against `updateUpsellRuleSchema`. The row editor seeds from the server's
  // rule object, so `id`, `triggerProductName` and `suggestedProductName` came back with
  // it and a `.strict()` body rejected the lot with 400 FIELD_NOT_ALLOWED.
  const body = {};
  for (const key of ['coPurchaseScore', 'promoted', 'minMarginPct', 'active']) {
    if (patch[key] !== undefined) body[key] = patch[key];
  }
  return api.put(`/upsell-rules/${encodeURIComponent(ruleId)}`, body);
}

/** A real delete — a pairing is configuration, not history. Returns the remainder. */
export function deleteUpsellRule(ruleId) {
  return api.del(`/upsell-rules/${encodeURIComponent(ruleId)}`);
}

/**
 * Rank suggestions for a cart.
 *
 * Takes a plain `limit` rather than page/pageSize — this list is a top-N, not a
 * paginated collection.
 *
 * @param productIds        what is currently in the cart
 * @param excludeProductIds dismissed on this quotation
 * @returns {Promise<Array>} each with { productId, productName, category, price,
 *   marginPct, marginDelta, promoted, coPurchaseScore, reason, rankScore,
 *   breakdown: { coPurchase, promotion, margin } }
 */
export async function suggestUpsells({
  productIds = [],
  tier,
  currency = 'INR',
  excludeProductIds = [],
  limit = 5,
}) {
  if (productIds.length === 0) return [];

  const data = await api.post('/upsell-rules/suggest', {
    productIds,
    tier,
    currency,
    excludeProductIds,
    limit,
  });
  return Array.isArray(data) ? data : [];
}
