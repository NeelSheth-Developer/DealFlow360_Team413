import { api } from './apiClient';

/**
 * Discount risk scoring — API-REFERENCE §10 (3 endpoints).
 *
 *   POST /risk/score        any staff
 *   POST /risk/score-batch  any staff · max 50 per call
 *   GET  /risk/config       manager, finance, admin
 *
 * SCORING IS SERVER-AUTHORITATIVE, WITH NO LOCAL FALLBACK.
 *
 * There used to be a mirror of the scoring algorithm here that ran when the API was
 * unreachable, marked `source: 'fallback'`. It is gone. A risk score decides who has to
 * approve a discount, and a number the client invented is worse than no number: the
 * approval chain resolved from it would not match what the server would have demanded,
 * so a quotation could route to one approver on screen and another in the database.
 * Failing loudly is the honest behaviour, and the UI shows the error instead of a score.
 *
 * `src/lib/riskEngine.js` is still imported for BAND and LABEL helpers only — those are
 * presentation, not arithmetic. The score, the overage, the breakdown and the approver
 * list all come from the response.
 */

import { approvalPathLabel, riskBand } from '@/lib/riskEngine';

/**
 * Stable fingerprint of everything that can change a score. Used to avoid re-requesting
 * an answer we already hold.
 */
export function riskInputKey(quotation, categoryCeilings, tierCeilings) {
  if (!quotation) return 'none';
  return JSON.stringify({
    q: quotation.id,
    l: (quotation.lines ?? []).map((l) => [
      l.id,
      l.category,
      Number(l.qty) || 0,
      Number(l.unitPrice) || 0,
      Number(l.discountPct) || 0,
    ]),
    o: Number(quotation.orderDiscountPct) || 0,
    t: tierCeilings?.[quotation.tier] ?? 0,
    c: categoryCeilings,
  });
}

/**
 * Build the §10.1 payload for scoring a REAL quotation.
 *
 * NO CEILING OVERRIDES ARE SENT. `tierCeiling` and `categoryCeilings` are optional
 * overrides that the server honours for admin and sales_manager — the two roles that own
 * the configuration and use the sandbox to preview a change before saving it. Sending
 * them on the routing path was actively wrong for exactly those two roles:
 *
 *   · The store starts with `tierCeilings: {}`, and `loadDiscountConfig()` has not
 *     resolved on the first render. So the first score of every quotation went out as
 *     `tierCeiling: 0` — a ceiling of zero makes every line a violation. A gold order
 *     at 20% off scored 24 points and resolved to "Manager + Finance" when the real
 *     answer against stored config is 9 points and "Manager approval".
 *   · A sales_rep never sees the difference, because the server ignores overrides from
 *     them. That is what kept this hidden: it is wrong only for the roles that approve.
 *
 * Omitting them makes the server use stored config, which is the same config
 * `submit-approval` re-scores against — so the chain shown on screen is the chain the
 * quotation will actually route to. The sandbox still previews an unsaved ceiling
 * through `scoreLines`, which is the one caller that should be sending them.
 */
function buildPayload(quotation) {
  return {
    quotationId: quotation.id ?? null,
    tier: quotation.tier,
    orderDiscountPct: Number(quotation.orderDiscountPct) || 0,
    lines: (quotation.lines ?? []).map((l) => ({
      id: l.id,
      productName: l.productName,
      category: l.category,
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discountPct: Number(l.discountPct) || 0,
    })),
  };
}

/**
 * Normalise a §10.1 response.
 *
 * `band` and `label` are derived here because they are purely how the number is
 * presented. Everything numeric is taken from the server as-is.
 */
function normalise(raw) {
  const risk = {
    score: Number(raw.score) || 0,
    worstSingleOverage: Number(raw.worstSingleOverage) || 0,
    violationCount: Number(raw.violationCount) || 0,
    totalValue: Number(raw.totalValue) || 0,
    weightedOverage: Number(raw.weightedOverage) || 0,
    lineBreakdown: raw.lineBreakdown ?? [],
  };

  const approvers = Array.isArray(raw.approvers) ? raw.approvers : [];

  return {
    risk: { ...risk, band: riskBand(risk.score) },
    approvalPath: {
      approvers,
      ruleId: raw.ruleId ?? null,
      label: raw.label ?? approvalPathLabel(approvers),
    },
    source: 'server',
  };
}

/**
 * Score one quotation.
 *
 * Throws on failure. Callers must handle it — see `riskSlice`, which stores the error on
 * the cache entry so the gauge can say "score unavailable" rather than showing a zero
 * that reads like "no violations".
 */
export async function scoreQuotation({ quotation }) {
  const raw = await api.post('/risk/score', buildPayload(quotation));
  return normalise(raw);
}

/**
 * Score several quotations in one request — the list and the Kanban board would
 * otherwise fire one per row.
 *
 * Config is loaded once server-side for the whole batch, which also guarantees every row
 * in a response was scored against the same ceilings. Max 50 per call, so this chunks.
 *
 * @returns {Promise<Object>} keyed by quotation id. A quotation the server omitted is
 *   simply absent rather than filled in with a guess.
 */
export async function scoreQuotations({ quotations }) {
  const byId = {};
  const CHUNK = 50;

  for (let i = 0; i < quotations.length; i += CHUNK) {
    const slice = quotations.slice(i, i + CHUNK);
    const raw = await api.post('/risk/score-batch', {
      quotations: slice.map((q) => buildPayload(q)),
    });

    for (const entry of raw?.results ?? []) {
      if (entry?.quotationId) byId[entry.quotationId] = normalise(entry);
    }
  }
  return byId;
}

/**
 * Score an ad-hoc set of lines that is not a saved quotation.
 *
 * Used by the admin risk sandbox, so that tool exercises the real scoring path rather
 * than a separate copy of it. `quotationId: null` is expected by the server here and
 * must not 404.
 */
export async function scoreLines({
  lines,
  tier,
  categoryCeilings,
  tierCeiling,
  orderDiscountPct = 0,
}) {
  const raw = await api.post('/risk/score', {
    quotationId: null,
    // REQUIRED, and it was missing. `scoreSchema` has no default for `tier`, and every
    // request body is `.strict()`, so omitting it meant the sandbox answered
    // 400 VALIDATION_FAILED on every keystroke and never rendered a score at all.
    tier,
    tierCeiling,
    categoryCeilings,
    orderDiscountPct,
    lines: lines.map((l) => ({
      id: l.id,
      productName: l.productName,
      category: l.category,
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discountPct: Number(l.discountPct) || 0,
    })),
  });
  return normalise(raw);
}

/**
 * The starting state for the admin risk sandbox.
 *
 * Restricted to the roles that may read governance config (§5), so a sales_rep must not
 * call it.
 *
 * @returns {Promise<{tierCeilings, categoryCeilings, approvalChain}>}
 */
export function fetchRiskConfig() {
  return api.get('/risk/config');
}

/**
 * Placeholder used while a score is in flight, so the UI never renders undefined.
 *
 * `status` is what callers should branch on: 'loading' while a request is open, 'error'
 * when one failed. A zero score with `status: 'ready'` means genuinely no violations.
 */
export const PENDING_RISK = {
  risk: {
    score: 0,
    worstSingleOverage: 0,
    violationCount: 0,
    totalValue: 0,
    weightedOverage: 0,
    lineBreakdown: [],
    band: 'low',
  },
  approvalPath: { approvers: [], ruleId: null, label: 'Calculating…' },
  source: 'pending',
  status: 'loading',
};
