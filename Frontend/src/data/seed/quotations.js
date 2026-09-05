/**
 * 14 quotations spread across every stage, seeded deliberately so the pipeline,
 * deal-health dashboard and reports all have real content on first load.
 *
 * Specific conditions baked in on purpose:
 *  - Q-1042  the worked example from the spec (Laptop 12% OK / Setup Service 18%
 *            over its 10% ceiling) with 8 laptops so fulfilment must split
 *  - Q-1041  11 days idle          -> stalled alert (medium)
 *  - Q-1039  waiting on Manager 4d -> approval bottleneck (high)
 *  - Q-1038  sitting at the Finance step of a two-step chain
 *  - Q-1036  6 days idle           -> stalled alert (low)
 *  - Q-1035  ~20% effective discount from a rep averaging ~9% -> discount anomaly,
 *            plus live customer comments and a 25% counter-discount in the portal
 *  - Q-1033  risk 0 -> shows the auto-approve path (empty approvalSteps)
 *  - Q-1032  12 laptops vs 10 in stock -> backorder -> delivery slippage alert
 *  - Q-1031  billed, with a partially paid invoice
 *  - Q-1028  rejected by the manager, with the reason on the audit trail
 */

const DAY = 86400000;

function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString();
}

function daysAhead(n) {
  return new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
}

/** Compact line builder — keeps the seed readable. */
function line(id, productId, productName, category, qty, unitPrice, costPrice, discountPct, extra = {}) {
  return {
    id,
    productId,
    productName,
    category,
    qty,
    unitPrice,
    costPrice,
    discountPct,
    taxPct: 18,
    isSubscription: category === 'subscription',
    planId: extra.planId ?? null,
    subscriptionStartDate: extra.subscriptionStartDate ?? null,
    subscriptionStatus: 'active',
    comments: extra.comments ?? [],
  };
}

function base(overrides) {
  return {
    orderDiscountPct: 0,
    approvalSteps: [],
    negotiationStatus: 'none',
    awaitingSeller: false,
    counterDiscountPct: null,
    counterJustification: null,
    dismissedSuggestions: [],
    promisedDeliveryDate: null,
    internalNotes: '',
    customerTerms:
      'Prices valid until the date shown above. Delivery within 10 business days of confirmation. Payment due 15 days from invoice.',
    ...overrides,
  };
}

export const quotations = [
  // ---------------------------------------------------------------- 1. Q-1042
  base({
    id: 'Q-1042',
    customerId: 'c-acme',
    customerName: 'Acme Corp',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'draft',
    portalToken: 'acme1042negotiate',
    createdAt: daysAgo(2),
    lastActivityAt: daysAgo(2),
    validUntil: daysAhead(21),
    promisedDeliveryDate: daysAhead(14),
    internalNotes:
      'Customer pushed hard on the setup service. Held hardware at 12% but conceded 18% on services — needs manager sign-off.',
    lines: [
      line('l-1042-1', 'p-laptop14', 'Laptop Pro 14', 'hardware', 8, 87400, 68000, 12),
      line('l-1042-2', 'p-onboarding', 'Onboarding Setup Service', 'service', 1, 18400, 9000, 18),
    ],
  }),

  // ---------------------------------------------------------------- 2. Q-1041
  base({
    id: 'Q-1041',
    customerId: 'c-delta',
    customerName: 'Delta Logistics',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-rahul',
    ownerName: 'Rahul Mehta',
    stage: 'draft',
    portalToken: 'delta1041network',
    createdAt: daysAgo(14),
    lastActivityAt: daysAgo(11),
    validUntil: daysAhead(7),
    internalNotes: 'Waiting on their facilities team to confirm the rack layout before we re-engage.',
    lines: [
      line('l-1041-1', 'p-switch24', 'Managed Switch 24-Port', 'hardware', 2, 38650, 29500, 5),
      line('l-1041-2', 'p-ap', 'WiFi 6 Access Point', 'hardware', 6, 15200, 10800, 8),
      line('l-1041-3', 'p-ups', 'UPS 1500VA Rack Mount', 'hardware', 2, 22100, 17200, 5),
    ],
  }),

  // ---------------------------------------------------------------- 3. Q-1040
  base({
    id: 'Q-1040',
    customerId: 'c-forge',
    customerName: 'Forge Analytics',
    tier: 'bronze',
    currency: 'INR',
    ownerId: 'u-kiran',
    ownerName: 'Kiran Nair',
    stage: 'draft',
    portalToken: 'forge1040seats',
    createdAt: daysAgo(1),
    lastActivityAt: daysAgo(1),
    validUntil: daysAhead(28),
    lines: [
      line('l-1040-1', 'p-cloud-std', 'DealFlow Cloud Standard', 'subscription', 25, 1200, 380, 3, {
        planId: 'sp-cloud-monthly',
        subscriptionStartDate: daysAhead(7),
      }),
      line('l-1040-2', 'p-keyboard', 'Wireless Keyboard & Mouse Kit', 'hardware', 10, 4800, 2900, 4),
    ],
  }),

  // ---------------------------------------------------------------- 4. Q-1039
  base({
    id: 'Q-1039',
    customerId: 'c-beta',
    customerName: 'Beta Industries',
    tier: 'silver',
    currency: 'INR',
    ownerId: 'u-rahul',
    ownerName: 'Rahul Mehta',
    stage: 'pending_approval',
    portalToken: 'beta1039displays',
    createdAt: daysAgo(6),
    lastActivityAt: daysAgo(4),
    validUntil: daysAhead(16),
    promisedDeliveryDate: daysAhead(20),
    internalNotes: 'Competitive deal — they have a quote from a reseller at a similar price point.',
    approvalSteps: [
      {
        role: 'sales_manager',
        status: 'pending',
        reviewerId: null,
        reviewerName: null,
        at: null,
        reason: null,
      },
    ],
    lines: [
      line('l-1039-1', 'p-monitor27', 'UltraSharp 27" Monitor', 'hardware', 6, 30700, 22400, 14),
      line('l-1039-2', 'p-dock', 'Thunderbolt Docking Station', 'hardware', 6, 17750, 11800, 8),
    ],
  }),

  // ---------------------------------------------------------------- 5. Q-1038
  base({
    id: 'Q-1038',
    customerId: 'c-gemini',
    customerName: 'Gemini Healthcare',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'pending_approval',
    portalToken: 'gemini1038rollout',
    createdAt: daysAgo(8),
    lastActivityAt: daysAgo(2),
    validUntil: daysAhead(14),
    promisedDeliveryDate: daysAhead(25),
    internalNotes:
      'Strategic account. Integration discount is well past the service ceiling, so Finance has to co-sign.',
    approvalSteps: [
      {
        role: 'sales_manager',
        status: 'approved',
        reviewerId: 'u-anita',
        reviewerName: 'Anita Desai',
        at: daysAgo(2),
        reason: 'Strategic account, margin still acceptable on the blended order.',
      },
      {
        role: 'finance',
        status: 'pending',
        reviewerId: null,
        reviewerName: null,
        at: null,
        reason: null,
      },
    ],
    lines: [
      line('l-1038-1', 'p-integration', 'Custom Integration Build', 'service', 1, 78200, 48000, 24),
      line('l-1038-2', 'p-tablet', 'Rugged Field Tablet', 'hardware', 4, 53350, 41000, 10),
      line('l-1038-3', 'p-support', 'Priority Support Retainer', 'service', 2, 33100, 19500, 15),
    ],
  }),

  // ---------------------------------------------------------------- 6. Q-1037
  base({
    id: 'Q-1037',
    customerId: 'c-horizon',
    customerName: 'Horizon Education',
    tier: 'silver',
    currency: 'INR',
    ownerId: 'u-kiran',
    ownerName: 'Kiran Nair',
    stage: 'sent',
    portalToken: 'horizon1037campus',
    negotiationStatus: 'sent',
    createdAt: daysAgo(9),
    lastActivityAt: daysAgo(5),
    validUntil: daysAhead(12),
    lines: [
      line('l-1037-1', 'p-cloud-prem', 'DealFlow Cloud Premium', 'subscription', 40, 2300, 700, 6, {
        planId: 'sp-premium-monthly',
        subscriptionStartDate: daysAhead(10),
      }),
      line('l-1037-2', 'p-analytics', 'Analytics Module', 'subscription', 40, 850, 260, 5, {
        planId: 'sp-premium-monthly',
        subscriptionStartDate: daysAhead(10),
      }),
      line('l-1037-3', 'p-onboarding', 'Onboarding Setup Service', 'service', 1, 19200, 9000, 8),
    ],
  }),

  // ---------------------------------------------------------------- 7. Q-1036
  base({
    id: 'Q-1036',
    customerId: 'c-everest',
    customerName: 'Everest Labs',
    tier: 'silver',
    currency: 'USD',
    ownerId: 'u-rahul',
    ownerName: 'Rahul Mehta',
    stage: 'sent',
    portalToken: 'everest1036usdquote',
    negotiationStatus: 'sent',
    createdAt: daysAgo(12),
    lastActivityAt: daysAgo(6),
    validUntil: daysAhead(9),
    internalNotes: 'USD price book. Procurement is slow — worth a nudge.',
    lines: [
      line('l-1036-1', 'p-laptop14', 'Laptop Pro 14', 'hardware', 3, 1099, 819, 5),
      line('l-1036-2', 'p-dock', 'Thunderbolt Docking Station', 'hardware', 3, 214, 142, 5),
    ],
  }),

  // ---------------------------------------------------------------- 8. Q-1035
  base({
    id: 'Q-1035',
    customerId: 'c-cygnus',
    customerName: 'Cygnus Retail',
    tier: 'bronze',
    currency: 'INR',
    ownerId: 'u-kiran',
    ownerName: 'Kiran Nair',
    stage: 'under_negotiation',
    portalToken: 'cygnus1035counter',
    negotiationStatus: 'under_negotiation',
    awaitingSeller: true,
    counterDiscountPct: 25,
    counterJustification:
      'We are comparing three vendors and the others are landing about 25% below list. Match it and we sign this week.',
    createdAt: daysAgo(16),
    lastActivityAt: daysAgo(2),
    validUntil: daysAhead(6),
    internalNotes:
      'Bronze tier only allows 5%. Already 20%+ effective — this needs a tier review, not more discount.',
    lines: [
      line('l-1035-1', 'p-monitor27', 'UltraSharp 27" Monitor', 'hardware', 4, 32000, 22400, 22, {
        comments: [
          {
            id: 'cm-1035-1',
            author: 'Arjun Bose',
            role: 'customer',
            message: 'Can we get the 32-inch variant at this same price? Our design team asked for it.',
            at: daysAgo(3),
          },
          {
            id: 'cm-1035-2',
            author: 'Kiran Nair',
            role: 'sales_rep',
            message:
              'The 32-inch carries a ₹9,500 uplift. I can hold the current discount rate on it if you take all four.',
            at: daysAgo(2),
          },
        ],
      }),
      line('l-1035-2', 'p-keyboard', 'Wireless Keyboard & Mouse Kit', 'hardware', 6, 4800, 2900, 12, {
        comments: [
          {
            id: 'cm-1035-3',
            author: 'Arjun Bose',
            role: 'customer',
            message: 'Do these ship with the monitors or separately?',
            at: daysAgo(2),
          },
        ],
      }),
    ],
  }),

  // ---------------------------------------------------------------- 9. Q-1034
  base({
    id: 'Q-1034',
    customerId: 'c-acme',
    customerName: 'Acme Corp',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'approved',
    portalToken: 'acme1034refresh',
    negotiationStatus: 'sent',
    createdAt: daysAgo(20),
    lastActivityAt: daysAgo(10),
    validUntil: daysAhead(10),
    promisedDeliveryDate: daysAhead(12),
    approvalSteps: [
      {
        role: 'sales_manager',
        status: 'approved',
        reviewerId: 'u-anita',
        reviewerName: 'Anita Desai',
        at: daysAgo(10),
        reason: 'One point over on hardware only. Fine for a repeat Gold account.',
      },
    ],
    lines: [
      line('l-1034-1', 'p-laptop14', 'Laptop Pro 14', 'hardware', 4, 87400, 68000, 16),
      line('l-1034-2', 'p-dock', 'Thunderbolt Docking Station', 'hardware', 4, 17000, 11800, 10),
      line('l-1034-3', 'p-warranty', 'Extended Warranty (2 years)', 'accessories', 4, 8750, 3100, 12),
    ],
  }),

  // --------------------------------------------------------------- 10. Q-1033
  base({
    id: 'Q-1033',
    customerId: 'c-delta',
    customerName: 'Delta Logistics',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-rahul',
    ownerName: 'Rahul Mehta',
    stage: 'approved',
    portalToken: 'delta1033depot',
    negotiationStatus: 'sent',
    createdAt: daysAgo(25),
    lastActivityAt: daysAgo(12),
    validUntil: daysAhead(5),
    promisedDeliveryDate: daysAhead(8),
    internalNotes: 'Every line inside its ceiling — went straight through with no approval needed.',
    lines: [
      line('l-1033-1', 'p-switch24', 'Managed Switch 24-Port', 'hardware', 4, 38650, 29500, 10),
      line('l-1033-2', 'p-ap', 'WiFi 6 Access Point', 'hardware', 12, 15200, 10800, 12),
      line('l-1033-3', 'p-ups', 'UPS 1500VA Rack Mount', 'hardware', 4, 22100, 17200, 8),
      line('l-1033-4', 'p-cloud-std', 'DealFlow Cloud Standard', 'subscription', 30, 1100, 380, 5, {
        planId: 'sp-quarterly',
        subscriptionStartDate: daysAgo(10),
      }),
    ],
  }),

  // --------------------------------------------------------------- 11. Q-1032
  base({
    id: 'Q-1032',
    customerId: 'c-gemini',
    customerName: 'Gemini Healthcare',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'fulfillment',
    portalToken: 'gemini1032ward',
    negotiationStatus: 'confirmed',
    createdAt: daysAgo(30),
    lastActivityAt: daysAgo(8),
    validUntil: daysAhead(3),
    // Promised for today while 2 units sit on backorder -> delivery slippage alert.
    promisedDeliveryDate: daysAhead(0),
    internalNotes: 'Ward rollout. 12 laptops ordered but only 10 across the network — 2 on backorder.',
    approvalSteps: [
      {
        role: 'sales_manager',
        status: 'approved',
        reviewerId: 'u-anita',
        reviewerName: 'Anita Desai',
        at: daysAgo(26),
        reason: 'Volume deal, discount inside ceilings.',
      },
    ],
    lines: [
      line('l-1032-1', 'p-laptop14', 'Laptop Pro 14', 'hardware', 12, 87400, 68000, 10),
      line('l-1032-2', 'p-case', 'Reinforced Carry Case', 'accessories', 12, 2950, 1450, 10),
    ],
  }),

  // --------------------------------------------------------------- 12. Q-1031
  base({
    id: 'Q-1031',
    customerId: 'c-beta',
    customerName: 'Beta Industries',
    tier: 'silver',
    currency: 'INR',
    ownerId: 'u-kiran',
    ownerName: 'Kiran Nair',
    stage: 'billed',
    portalToken: 'beta1031floor',
    negotiationStatus: 'confirmed',
    createdAt: daysAgo(40),
    lastActivityAt: daysAgo(15),
    validUntil: daysAhead(1),
    promisedDeliveryDate: daysAgo(5).slice(0, 10),
    lines: [
      line('l-1031-1', 'p-monitor27', 'UltraSharp 27" Monitor', 'hardware', 8, 30700, 22400, 8),
      line('l-1031-2', 'p-dock', 'Thunderbolt Docking Station', 'hardware', 8, 17750, 11800, 6),
      line('l-1031-3', 'p-cloud-std', 'DealFlow Cloud Standard', 'subscription', 20, 1150, 380, 5, {
        planId: 'sp-cloud-monthly',
        subscriptionStartDate: daysAgo(30),
      }),
    ],
  }),

  // --------------------------------------------------------------- 13. Q-1030
  base({
    id: 'Q-1030',
    customerId: 'c-acme',
    customerName: 'Acme Corp',
    tier: 'gold',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'confirmed',
    portalToken: 'acme1030annual',
    negotiationStatus: 'confirmed',
    createdAt: daysAgo(55),
    lastActivityAt: daysAgo(30),
    validUntil: daysAgo(20).slice(0, 10),
    promisedDeliveryDate: daysAgo(25).slice(0, 10),
    lines: [
      line('l-1030-1', 'p-laptop14', 'Laptop Pro 14', 'hardware', 6, 87400, 68000, 8),
      line('l-1030-2', 'p-onboarding', 'Onboarding Setup Service', 'service', 1, 18400, 9000, 9),
      line('l-1030-3', 'p-cloud-prem', 'DealFlow Cloud Premium', 'subscription', 30, 2200, 700, 6, {
        planId: 'sp-annual',
        subscriptionStartDate: daysAgo(50),
      }),
    ],
  }),

  // --------------------------------------------------------------- 14. Q-1029
  base({
    id: 'Q-1029',
    customerId: 'c-horizon',
    customerName: 'Horizon Education',
    tier: 'silver',
    currency: 'INR',
    ownerId: 'u-rahul',
    ownerName: 'Rahul Mehta',
    stage: 'confirmed',
    portalToken: 'horizon1029lab',
    negotiationStatus: 'confirmed',
    createdAt: daysAgo(70),
    lastActivityAt: daysAgo(45),
    validUntil: daysAgo(40).slice(0, 10),
    promisedDeliveryDate: daysAgo(50).slice(0, 10),
    lines: [
      line('l-1029-1', 'p-tablet', 'Rugged Field Tablet', 'hardware', 5, 55700, 41000, 7),
      line('l-1029-2', 'p-training', 'Training Workshop', 'service', 2, 14400, 6200, 8),
      line('l-1029-3', 'p-backup', 'Backup & Disaster Recovery', 'subscription', 1, 1450, 520, 5, {
        planId: 'sp-backup-monthly',
        subscriptionStartDate: daysAgo(65),
      }),
    ],
  }),

  // --------------------------------------------------------------- 15. Q-1028
  base({
    id: 'Q-1028',
    customerId: 'c-forge',
    customerName: 'Forge Analytics',
    tier: 'bronze',
    currency: 'INR',
    ownerId: 'u-priya',
    ownerName: 'Priya Sharma',
    stage: 'lost',
    portalToken: 'forge1028integration',
    createdAt: daysAgo(85),
    lastActivityAt: daysAgo(60),
    validUntil: daysAgo(55).slice(0, 10),
    internalNotes: 'Rejected — 15% on a service line for a Bronze account was never going to clear.',
    approvalSteps: [
      {
        role: 'sales_manager',
        status: 'rejected',
        reviewerId: 'u-anita',
        reviewerName: 'Anita Desai',
        at: daysAgo(60),
        reason:
          'Bronze tier caps at 5% and the service ceiling is 10%. 15% on the integration build is 10 points over — resubmit at 5% or move them to Silver first.',
      },
    ],
    lines: [line('l-1028-1', 'p-integration', 'Custom Integration Build', 'service', 1, 85000, 48000, 15)],
  }),
];

export { daysAgo, daysAhead };
