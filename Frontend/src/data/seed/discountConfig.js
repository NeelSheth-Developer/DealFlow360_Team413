/**
 * Discount governance configuration.
 *
 * Tier ceilings are the headline number a customer is "allowed". Category
 * ceilings are stricter per-line limits that override it — which is the whole
 * point of the blended risk score: a Gold customer may be allowed 15% overall,
 * but a thin-margin Service line still caps at 10%.
 */

export const tierCeilings = {
  bronze: 5,
  silver: 10,
  gold: 15,
};

export const categoryCeilings = {
  hardware: 15,
  service: 10,
  subscription: 12,
  accessories: 20,
};

/**
 * Approval chain. Ranges are (minScore, maxScore] in blended discount points.
 * `singleLineTrip` force-escalates when any single line is that many points
 * over its own ceiling, even if the value-weighted blend looks mild.
 */
export const approvalChain = [
  {
    id: 'ar-auto',
    minScore: -1,
    maxScore: 0,
    approvers: [],
    singleLineTrip: null,
    note: 'Every line inside its ceiling — no review needed.',
  },
  {
    id: 'ar-manager',
    minScore: 0,
    maxScore: 5,
    approvers: ['sales_manager'],
    singleLineTrip: 5,
    note: 'Mild blended overage, or one line more than 5 pts over.',
  },
  {
    id: 'ar-finance',
    minScore: 5,
    maxScore: null,
    approvers: ['sales_manager', 'finance'],
    singleLineTrip: 12,
    note: 'Heavy margin give-away — Finance must co-sign.',
  },
];

export const dashboardConfig = {
  stallThresholdDays: 5,
  anomalySensitivity: 1.8,
  approvalSlaHours: 24,
};

export const CATEGORY_ORDER = ['hardware', 'service', 'subscription', 'accessories'];
export const TIER_ORDER = ['bronze', 'silver', 'gold'];
