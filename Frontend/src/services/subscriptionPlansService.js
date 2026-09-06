/**
 * Subscription plans — API-REFERENCE §8 (4 endpoints).
 *
 *   GET  /subscription-plans       any staff
 *   GET  /subscription-plans/:id   any staff
 *   POST /subscription-plans       admin, finance
 *   PUT  /subscription-plans/:id   admin, finance · + `active`
 *
 * A `subscription` product CATEGORY does not make a line recurring — an attached
 * PLAN does. A product can sit in that category and still be sold as a one-off.
 *
 * `billingDayOfCycle` is capped at 28, not 31: a plan billing on the 30th would
 * skip February entirely.
 *
 * The proration and cancellation rules are per-plan rather than global because they
 * are commercial terms — an annual plan can reasonably refuse refunds where a
 * monthly one prorates daily.
 */

import { api } from './apiClient';

/**
 * The exact keys the schema accepts. WHITELISTED, not blacklisted — the editors seed
 * their forms from the server's own object, so `id`, `active`, `createdAt` and anything
 * else the API returns would otherwise be echoed back into a `.strict()` body and earn
 * `400 FIELD_NOT_ALLOWED`.
 */
function pick(source = {}, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const PLAN_KEYS = [
  'name',
  'cadence',
  'prorationRule',
  'cancellationRule',
  'minCommitmentMonths',
  'trialDays',
  'billingDayOfCycle',
  'productIds',
];
const PLAN_UPDATE_KEYS = [...PLAN_KEYS, 'active'];


export const CADENCES = ['monthly', 'quarterly', 'yearly'];
export const PRORATION_RULES = ['daily_prorate', 'full_period', 'next_cycle_adjust'];
export const CANCELLATION_RULES = ['refund_unused', 'no_refund', 'credit_note_only'];
export const MAX_BILLING_DAY = 28;

export async function listSubscriptionPlans() {
  const data = await api.get('/subscription-plans');
  return Array.isArray(data) ? data : [];
}

export function getSubscriptionPlan(planId) {
  return api.get(`/subscription-plans/${encodeURIComponent(planId)}`);
}

/** Unknown product ids are rejected with 400 and named in `details.unknown`. */
export function createSubscriptionPlan(payload) {
  return api.post('/subscription-plans', pick(clampBillingDay(payload), PLAN_KEYS));
}

/**
 * Every field optional, plus `active`. Supplying `productIds` REPLACES the whole
 * set. Changing a rule affects future proration and cancellation only — figures
 * already issued as credit notes are financial facts and are not recomputed.
 */
export function updateSubscriptionPlan(planId, payload) {
  return api.put(
    `/subscription-plans/${encodeURIComponent(planId)}`,
    pick(clampBillingDay(payload), PLAN_UPDATE_KEYS),
  );
}

function clampBillingDay(payload = {}) {
  if (payload.billingDayOfCycle === undefined) return payload;
  const day = Number(payload.billingDayOfCycle);
  return {
    ...payload,
    billingDayOfCycle: Math.min(MAX_BILLING_DAY, Math.max(1, Number.isFinite(day) ? day : 1)),
  };
}

/** Plans a given product may be sold on, with the first as the sensible default. */
export function plansForProduct(productId, plans = []) {
  return plans.filter((p) => p.active !== false && (p.productIds ?? []).includes(productId));
}

export function defaultPlanForProduct(productId, plans = []) {
  return plansForProduct(productId, plans)[0] ?? null;
}
