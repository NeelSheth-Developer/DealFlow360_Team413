import { api, isBackendConfigured } from './apiClient';
import {
  approvalPathLabel,
  computeBlendedRisk,
  resolveApprovalPath,
  riskBand,
} from '@/lib/riskEngine';

/**
 * Discount risk scoring is SERVER-AUTHORITATIVE.
 *
 * The UI never decides a score or an approval route. It asks the backend and
 * renders the answer. `src/lib/riskEngine.js` is kept only as a local fallback
 * mirror so the app remains demoable with no API configured — it is never used
 * when `VITE_API_BASE_URL` is set.
 *
 * Expected backend contract:
 *   POST /risk/score
 *   body: { lines, categoryCeilings, tierCeiling, orderDiscountPct }
 *   200:  { score, worstSingleOverage, violationCount, totalValue,
 *           weightedOverage, lineBreakdown[], approvers[], ruleId }
 */

/**
 * Stable fingerprint of everything that can change a score. Used to avoid
 * re-requesting an answer we already hold.
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

function buildPayload(quotation, categoryCeilings, tierCeilings) {
  return {
    quotationId: quotation.id,
    tier: quotation.tier,
    orderDiscountPct: Number(quotation.orderDiscountPct) || 0,
    tierCeiling: tierCeilings?.[quotation.tier] ?? 0,
    categoryCeilings,
    lines: (quotation.lines ?? []).map((l) => ({
      id: l.id,
      productId: l.productId,
      productName: l.productName,
      category: l.category,
      qty: Number(l.qty) || 0,
      unitPrice: Number(l.unitPrice) || 0,
      discountPct: Number(l.discountPct) || 0,
    })),
  };
}

/** Normalises whatever the server returns into the shape the UI expects. */
function normalise(raw, approvalChain) {
  const risk = {
    score: Number(raw.score) || 0,
    worstSingleOverage: Number(raw.worstSingleOverage) || 0,
    violationCount: Number(raw.violationCount) || 0,
    totalValue: Number(raw.totalValue) || 0,
    weightedOverage: Number(raw.weightedOverage) || 0,
    lineBreakdown: raw.lineBreakdown ?? [],
  };

  // A backend may resolve the route itself. If it does, trust it. If it only
  // returns the score, resolve locally from the configured chain.
  const approvers = Array.isArray(raw.approvers)
    ? raw.approvers
    : resolveApprovalPath(risk, approvalChain).approvers;

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
 * @returns {Promise<{risk: Object, approvalPath: Object, source: 'server'|'local'}>}
 */
export async function scoreQuotation({ quotation, categoryCeilings, tierCeilings, approvalChain }) {
  if (isBackendConfigured()) {
    try {
      const raw = await api.post('/risk/score', buildPayload(quotation, categoryCeilings, tierCeilings));
      return normalise(raw, approvalChain);
    } catch (error) {
      // A scoring outage must not block a rep from working. Fall back to the
      // mirror and mark the result so the UI can say the number is provisional.
      const local = scoreLocally({ quotation, categoryCeilings, tierCeilings, approvalChain });
      return { ...local, source: 'fallback', error: error.message };
    }
  }

  return scoreLocally({ quotation, categoryCeilings, tierCeilings, approvalChain });
}

/** Score several quotations. Uses a batch endpoint when the backend offers one. */
export async function scoreQuotations({ quotations, categoryCeilings, tierCeilings, approvalChain }) {
  if (isBackendConfigured()) {
    try {
      const raw = await api.post('/risk/score-batch', {
        quotations: quotations.map((q) => buildPayload(q, categoryCeilings, tierCeilings)),
      });
      const byId = {};
      for (const entry of raw.results ?? []) {
        byId[entry.quotationId] = normalise(entry, approvalChain);
      }
      // Anything the batch omitted falls back so the list is never blank.
      for (const q of quotations) {
        if (!byId[q.id]) {
          byId[q.id] = scoreLocally({ quotation: q, categoryCeilings, tierCeilings, approvalChain });
        }
      }
      return byId;
    } catch {
      // fall through to per-quotation local scoring
    }
  }

  const byId = {};
  for (const q of quotations) {
    byId[q.id] = scoreLocally({ quotation: q, categoryCeilings, tierCeilings, approvalChain });
  }
  return byId;
}

/**
 * Score an ad-hoc set of lines that isn't a saved quotation. Used by the backend
 * risk sandbox, so that tool exercises the real scoring path rather than a
 * separate local copy of it.
 */
export async function scoreLines({
  lines,
  categoryCeilings,
  tierCeiling,
  orderDiscountPct = 0,
  approvalChain,
}) {
  if (isBackendConfigured()) {
    try {
      const raw = await api.post('/risk/score', {
        quotationId: null,
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
      return normalise(raw, approvalChain);
    } catch (error) {
      const local = scoreLocally({
        quotation: { lines, orderDiscountPct, tier: '_adhoc' },
        categoryCeilings,
        tierCeilings: { _adhoc: tierCeiling },
        approvalChain,
      });
      return { ...local, source: 'fallback', error: error.message };
    }
  }

  return scoreLocally({
    quotation: { lines, orderDiscountPct, tier: '_adhoc' },
    categoryCeilings,
    tierCeilings: { _adhoc: tierCeiling },
    approvalChain,
  });
}

/** The local mirror. Only reached when no backend is configured, or one errored. */
function scoreLocally({ quotation, categoryCeilings, tierCeilings, approvalChain }) {
  const risk = computeBlendedRisk(
    quotation.lines ?? [],
    categoryCeilings,
    tierCeilings?.[quotation.tier] ?? 0,
    quotation.orderDiscountPct,
  );
  const approvalPath = resolveApprovalPath(risk, approvalChain);
  return {
    risk: { ...risk, band: riskBand(risk.score) },
    approvalPath,
    source: 'local',
  };
}

/** Placeholder used while a score is in flight so the UI never renders undefined. */
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
