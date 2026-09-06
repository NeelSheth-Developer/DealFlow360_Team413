/**
 * Governance configuration — API-REFERENCE §5 (10 endpoints) + §4.4–4.5 (2).
 *
 *   GET    /config/discount                    manager, finance, admin
 *   PUT    /config/discount/tier-ceilings      manager, admin · ALL THREE at once
 *   PUT    /config/discount/category-ceilings  manager, admin · ALL FOUR at once
 *   GET    /config/approval-chain              manager, finance, admin
 *   POST   /config/approval-chain              manager, admin
 *   PUT    /config/approval-chain/:id          manager, admin · full replace
 *   DELETE /config/approval-chain/:id          manager, admin · last rule refused
 *   PUT    /config/approval-chain/order        manager, admin · must list EVERY id
 *   GET    /config/dashboard                   manager, finance, admin
 *   PUT    /config/dashboard                   manager, admin · all three required
 *   GET    /customer-tiers/:tier               manager, admin
 *   PATCH  /customer-tiers/:tier               manager, admin
 *
 * A SALES_REP CAN READ NONE OF IT. Knowing the exact trip points makes it trivial to
 * price a quotation to sit one basis point under one, which is the behaviour these
 * rules exist to prevent. Callers must gate on role before rendering.
 *
 * Gaps and overlaps in the chain produce `warnings`, NOT rejections — a chain is
 * edited one rule at a time and a mid-edit gap is normal. The risk engine fails
 * closed on a gap (it escalates rather than auto-approving), so a warning is the
 * honest severity.
 */

import { api } from './apiClient';

export const TIERS = ['bronze', 'silver', 'gold'];
export const CATEGORIES = ['hardware', 'service', 'subscription', 'accessories'];

/**
 * Everything the risk engine needs, in one read.
 *
 * @returns {Promise<{tierCeilings, categoryCeilings, approvalChain, warnings}>}
 *   approvalChain rows: { id, minScore, maxScore, approvers, singleLineTrip, note, sortOrder }
 */
export function fetchDiscountConfig() {
  return api.get('/config/discount');
}

/**
 * Save all three tier ceilings together.
 *
 * Deliberately not one-at-a-time: the risk engine reads them together, and a UI that
 * saves bronze alone can leave bronze above gold between two requests.
 */
export function saveTierCeilings({ bronze, silver, gold }) {
  return api.put('/config/discount/tier-ceilings', {
    bronze: Number(bronze),
    silver: Number(silver),
    gold: Number(gold),
  });
}

/** Save all four category ceilings together, for the same reason. */
export function saveCategoryCeilings({ hardware, service, subscription, accessories }) {
  return api.put('/config/discount/category-ceilings', {
    hardware: Number(hardware),
    service: Number(service),
    subscription: Number(subscription),
    accessories: Number(accessories),
  });
}

/* -------------------------------------------------------- approval chain */

/** @returns {Promise<{approvalChain: Array, warnings: string[]}>} */
export function fetchApprovalChain() {
  return api.get('/config/approval-chain');
}

/**
 * A rule matches when `score > minScore && score <= (maxScore ?? Infinity)`, OR when
 * any single line is more than `singleLineTrip` points over its own ceiling. When
 * several match, the one demanding MORE approvers wins — routing never steps down.
 *
 * `sales_rep` is not an assignable approver: a rep approving their own discount is
 * exactly what this module prevents. `approvers: []` means auto-approve.
 */
export function createApprovalRule({
  minScore,
  maxScore = null,
  approvers = [],
  singleLineTrip = null,
  note = '',
}) {
  return api.post('/config/approval-chain', {
    minScore: Number(minScore),
    maxScore: maxScore === null || maxScore === '' ? null : Number(maxScore),
    approvers,
    singleLineTrip:
      singleLineTrip === null || singleLineTrip === '' ? null : Number(singleLineTrip),
    note,
  });
}

/** Replaced wholesale, not patched, so a partial update cannot half-edit a band. */
export function updateApprovalRule(ruleId, payload) {
  // `approvalRuleSchema` is strict and the row editor spreads the server's rule object,
  // which carries `id` and `sortOrder`. Only the five writable fields go out.
  const body = {};
  for (const key of ['minScore', 'maxScore', 'approvers', 'singleLineTrip', 'note']) {
    if (payload[key] !== undefined) body[key] = payload[key];
  }
  return api.put(`/config/approval-chain/${encodeURIComponent(ruleId)}`, body);
}

/**
 * Deleting the LAST rule is refused with 409 CHAIN_NOT_CONFIGURED — an empty chain
 * leaves every quotation unroutable. Returns the remaining chain with warnings.
 */
export function deleteApprovalRule(ruleId) {
  return api.del(`/config/approval-chain/${encodeURIComponent(ruleId)}`);
}

/**
 * Reorder. `ids` must list EVERY rule; a partial list is rejected with 400 rather
 * than silently reordering a subset, and unknown ids come back in `details.unknown`.
 */
export function reorderApprovalChain(ids) {
  return api.put('/config/approval-chain/order', { ids });
}

/* ----------------------------------------------------- dashboard config */

/** @returns {Promise<{stallThresholdDays, anomalySensitivity, approvalSlaHours}>} */
export function fetchDashboardConfig() {
  return api.get('/config/dashboard');
}

/**
 * All three are required. `anomalySensitivity` is a multiplier against each rep's own
 * rolling average, so a value below 1 would flag every quotation — the floor is 1.
 */
export function saveDashboardConfig({ stallThresholdDays, anomalySensitivity, approvalSlaHours }) {
  return api.put('/config/dashboard', {
    stallThresholdDays: Number(stallThresholdDays),
    anomalySensitivity: Math.max(1, Number(anomalySensitivity)),
    approvalSlaHours: Number(approvalSlaHours),
  });
}

/* --------------------------------------------------------- tier ceilings */

/** The ceiling for a whole TIER, not for one customer. */
export function fetchTierCeiling(tier) {
  return api.get(`/customer-tiers/${encodeURIComponent(tier)}`);
}

/**
 * Moving this changes what the blended score flags on every FUTURE quotation for
 * every customer on that tier. Existing quotations are unaffected — each snapshots
 * its tier at creation, so an approval already given cannot be invalidated.
 *
 * 0 is a legitimate value: that tier gets no discretion.
 */
export function updateTierCeiling(tier, maxDiscountPct) {
  const pct = Number(maxDiscountPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw new Error('maxDiscountPct must be between 0 and 100.');
  }
  return api.patch(`/customer-tiers/${encodeURIComponent(tier)}`, { maxDiscountPct: pct });
}
