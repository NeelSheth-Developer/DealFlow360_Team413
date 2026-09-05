/**
 * Five plans covering all three cadences, all three proration rules and all
 * three cancellation rules — so every branch of the billing engine is
 * demonstrable without editing config first.
 */
export const subscriptionPlans = [
  {
    id: 'sp-cloud-monthly',
    name: 'Cloud Standard — Monthly',
    cadence: 'monthly',
    productIds: ['p-cloud-std', 'p-security'],
    prorationRule: 'daily_prorate',
    cancellationRule: 'refund_unused',
    minCommitmentMonths: 0,
    trialDays: 14,
    billingDayOfCycle: 1,
    active: true,
  },
  {
    id: 'sp-premium-monthly',
    name: 'Cloud Premium — Monthly',
    cadence: 'monthly',
    productIds: ['p-cloud-prem', 'p-analytics', 'p-security'],
    prorationRule: 'daily_prorate',
    cancellationRule: 'credit_note_only',
    minCommitmentMonths: 3,
    trialDays: 14,
    billingDayOfCycle: 1,
    active: true,
  },
  {
    id: 'sp-quarterly',
    name: 'Cloud Standard — Quarterly',
    cadence: 'quarterly',
    productIds: ['p-cloud-std', 'p-analytics', 'p-backup'],
    prorationRule: 'next_cycle_adjust',
    cancellationRule: 'credit_note_only',
    minCommitmentMonths: 3,
    trialDays: 0,
    billingDayOfCycle: 1,
    active: true,
  },
  {
    id: 'sp-annual',
    name: 'Enterprise Annual',
    cadence: 'yearly',
    productIds: ['p-cloud-prem', 'p-analytics', 'p-backup', 'p-security'],
    prorationRule: 'full_period',
    cancellationRule: 'no_refund',
    minCommitmentMonths: 12,
    trialDays: 0,
    billingDayOfCycle: 1,
    active: true,
  },
  {
    id: 'sp-backup-monthly',
    name: 'Backup & DR — Monthly',
    cadence: 'monthly',
    productIds: ['p-backup'],
    prorationRule: 'daily_prorate',
    cancellationRule: 'no_refund',
    minCommitmentMonths: 1,
    trialDays: 30,
    billingDayOfCycle: 1,
    active: true,
  },
];

/** Default plan offered when a subscription product is added to a quote. */
export function defaultPlanForProduct(productId, plans = subscriptionPlans) {
  return plans.find((p) => p.active && p.productIds.includes(productId)) ?? plans[0];
}
