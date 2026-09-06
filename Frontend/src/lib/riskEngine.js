import { round2 } from './utils';

/**
 * The blended discount risk score.
 *
 * Every line is checked against ITS OWN ceiling — the stricter of the product
 * category's limit and the customer tier's limit — not one blanket order-level
 * number. A single badly-over line trips approval. Many slightly-over lines
 * also trip approval, because their overages are summed on a value-weighted
 * basis, so a rep cannot spread small violations across many lines to stay
 * under the radar.
 */

/**
 * @param {Array} lines quote lines
 * @param {Object} categoryCeilings e.g. { hardware: 15, service: 10 }
 * @param {number} tierCeiling customer tier headline max
 * @param {number} orderDiscountPct order-level discount on top of line discounts
 */
export function computeBlendedRisk(lines = [], categoryCeilings = {}, tierCeiling = 0, orderDiscountPct = 0) {
  let weightedOverage = 0;
  let totalValue = 0;
  let worstSingleOverage = 0;
  const lineBreakdown = [];

  for (const line of lines) {
    const lineDiscount = Number(line.discountPct) || 0;
    // The order-level discount compounds on whatever the line already gave away.
    const effectivePct = lineDiscount + orderDiscountPct * (1 - lineDiscount / 100);

    // The binding ceiling is the STRICTER of the category rule and the tier rule.
    const categoryCeiling = categoryCeilings[line.category] ?? tierCeiling;
    const ceiling = Math.min(categoryCeiling, tierCeiling);

    const overBy = Math.max(0, effectivePct - ceiling);

    // Weight is the GROSS line value (qty × unit price), before any discount.
    // Worked example: a 1,000 laptop inside its ceiling and a 2,000 service
    // 8 points over gives (1000×0 + 2000×8) / (1000+2000) = 5.33 points.
    const value = (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);

    if (overBy > worstSingleOverage) worstSingleOverage = overBy;
    weightedOverage += overBy * value;
    totalValue += value;

    lineBreakdown.push({
      lineId: line.id,
      productName: line.productName,
      category: line.category,
      value: round2(value),
      givenPct: round2(effectivePct),
      lineDiscountPct: round2(lineDiscount),
      ceilingPct: round2(ceiling),
      categoryCeilingPct: round2(categoryCeiling),
      tierCeilingPct: round2(tierCeiling),
      overBy: round2(overBy),
      isViolation: overBy > 0,
      contribution: 0,
    });
  }

  // Value-weighted average overage across the whole order, in discount points.
  const score = totalValue > 0 ? weightedOverage / totalValue : 0;
  for (const row of lineBreakdown) {
    row.contribution = totalValue > 0 ? round2((row.overBy * row.value) / totalValue) : 0;
  }

  return {
    score: round2(score),
    worstSingleOverage: round2(worstSingleOverage),
    violationCount: lineBreakdown.filter((r) => r.isViolation).length,
    lineBreakdown,
    totalValue: round2(totalValue),
    weightedOverage: round2(weightedOverage),
  };
}

/**
 * Resolve the required approver chain from the configured rules.
 * Whichever matching rule demands MORE approvers wins — we never route down.
 */
export function resolveApprovalPath(risk, approvalChain = []) {
  // EVERY rule whose single-line trip point is breached is a candidate, not just
  // the first one found. A 14-point overage breaches both a 5-point and a
  // 12-point trip; the 12-point rule is the one that must win.
  const escalated = approvalChain.filter(
    (r) => r.singleLineTrip != null && risk.worstSingleOverage > r.singleLineTrip,
  );
  const byScore = approvalChain.find(
    (r) => risk.score > r.minScore && risk.score <= (r.maxScore ?? Infinity),
  );

  const candidates = [...escalated, byScore].filter(Boolean);
  if (candidates.length === 0) {
    return { approvers: [], label: 'Auto-approve', ruleId: null };
  }

  const chosen = candidates.reduce((a, b) => (b.approvers.length > a.approvers.length ? b : a));
  return {
    approvers: chosen.approvers,
    ruleId: chosen.id,
    label: approvalPathLabel(chosen.approvers),
  };
}

export function approvalPathLabel(approvers = []) {
  if (approvers.length === 0) return 'Auto-approve';
  if (approvers.length === 1) return 'Manager approval';
  return 'Manager + Finance';
}

export function riskBand(score) {
  if (score <= 0) return 'low';
  if (score <= 5) return 'medium';
  return 'high';
}

export const RISK_BAND_META = {
  low: {
    label: 'Within all ceilings',
    tone: 'text-state-success',
    bg: 'bg-state-success/12',
    border: 'border-state-success/30',
    gradient: 'var(--grad-risk-low)',
    dot: 'bg-state-success',
  },
  medium: {
    label: 'Manager review needed',
    tone: 'text-accent-amber',
    bg: 'bg-accent-amber/12',
    border: 'border-accent-amber/35',
    gradient: 'var(--grad-risk-mid)',
    dot: 'bg-accent-amber',
  },
  high: {
    label: 'Manager + Finance review',
    tone: 'text-state-danger',
    bg: 'bg-state-danger/12',
    border: 'border-state-danger/30',
    gradient: 'var(--grad-risk-high)',
    dot: 'bg-state-danger',
  },
};

export function riskBandMeta(score) {
  return RISK_BAND_META[riskBand(score)];
}


/** The first step still awaiting action — Finance cannot act before the Manager. */
export function currentPendingStep(quotation) {
  return (quotation?.approvalSteps ?? []).find((s) => s.status === 'pending') ?? null;
}

export function canUserActOnApproval(quotation, user) {
  if (!user || quotation?.stage !== 'pending_approval') return false;
  const step = currentPendingStep(quotation);
  if (!step) return false;
  // Admins can unblock any step so a solo demo is never deadlocked.
  return step.role === user.role || user.role === 'admin';
}

/**
 * Explain the score in one sentence — reused by the builder rail, the approval
 * header and the landing-page widget so the wording never drifts.
 */
/**
 * Format a blended score for display.
 *
 * The blend is VALUE-WEIGHTED: `sum(overage x lineValue) / orderValue`. So one small line
 * far over its ceiling, inside a very large order, produces a genuinely tiny number —
 * 0.00026 on the quotation this was found on. Printed as `0.00` next to a route of
 * "Manager + Finance" it reads as a broken calculation, when in fact the score is right
 * and the SINGLE-LINE TRIP is what demanded the approvers.
 *
 * `<0.01` says the same thing honestly: not zero, just small. Rounding a non-zero risk to
 * a flat zero is the one thing this must not do.
 */
export function formatScore(score = 0) {
  const n = Number(score) || 0;
  if (n > 0 && n < 0.01) return '<0.01';
  return n.toFixed(2);
}


export function explainRisk(risk) {
  if (risk.violationCount === 0) {
    return 'Every line is inside its category ceiling. No approval required.';
  }
  const worst = risk.lineBreakdown
    .filter((r) => r.isViolation)
    .sort((a, b) => b.overBy - a.overBy)[0];

  /*
   * When the blend rounds to nothing, say so explicitly.
   *
   * The score is value-weighted, so a small line well over its ceiling inside a large
   * order scores near zero while the single-line trip still forces approval. Without
   * this sentence the screen shows "0.00" beside "Manager + Finance" and looks broken.
   */
  const blendIsNegligible = risk.score < 0.01;

  if (risk.violationCount === 1) {
    const base = `${worst.productName} is ${worst.overBy.toFixed(1)} pts over its ${worst.ceilingPct}% ceiling, which flags the whole quotation.`;
    return blendIsNegligible
      ? `${base} The blended score is near zero because that line is small next to the order total — the single-line trip is what requires approval.`
      : base;
  }

  const blended = blendIsNegligible ? 'under 0.01' : `${risk.score.toFixed(2)}`;
  return `${risk.violationCount} lines are over their ceilings. Value-weighted, that blends to ${blended} pts across the order.`;
}
