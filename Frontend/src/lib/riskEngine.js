
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


/**
 * A single, uniform sentence describing a server-returned score.
 *
 * IT NAMES NO PRODUCT AND INVENTS NO REASONING. This used to branch: with exactly one
 * violation it composed "Workstation 24\" is 9.0 pts over its 15% ceiling, which flags
 * the whole quotation", and when the blend rounded to zero it added a second clause
 * explaining why. Both read as findings the app had worked out for itself, when in fact
 * the only authority on any of it is `POST /risk/score`.
 *
 * Every value below comes straight off that response — `violationCount` and `score`.
 * Nothing is derived, ranked or re-decided here; this is formatting, not analysis.
 */
export function explainRisk(risk) {
  const violations = Number(risk?.violationCount) || 0;
  if (violations === 0) {
    return 'Every line is inside its category ceiling. No approval required.';
  }

  const score = Number(risk?.score) || 0;
  const subject =
    violations === 1 ? '1 line is over its ceiling' : `${violations} lines are over their ceilings`;

  return `${subject}. Value-weighted, that blends to ${formatScore(score)} pts across the order.`;
}

