import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  approvalSteps,
  billingOccurrences,
  customers,
  invoiceLines,
  invoices,
  lineComments,
  payments,
  priceLists,
  productVariants,
  products,
  quotationLines,
  quotations,
  subscriptionPlanProducts,
  subscriptionPlans,
  teams,
  upsellRules,
  users,
  warehouseStock,
  warehouses,
  type Category,
  type Stage,
  type Tier,
} from '../db/schema.js';
import { generateCustomerId } from '../lib/customer-id.js';
import { hashPassword } from '../lib/password.js';

/**
 * Demo seed.
 *
 * Wipes every transactional table and rebuilds a coherent dataset: one admin, a
 * small staff team, 200 products with tier pricing, four customers, three
 * warehouses with stock, subscription plans, upsell rules, and 100 quotations spread
 * across every stage so the dashboard, the approval queue and the reports all have
 * something real to show.
 *
 *   npm run seed
 *
 * The governance tables (tier_config, category_config, approval_rules,
 * dashboard_config) and `teams` are NOT wiped — they are seeded by migration and are
 * policy rather than demo data.
 *
 * Everything is deterministic: the same command twice produces the same database, so
 * a demo can be reset between run-throughs and the numbers quoted on stage stay true.
 */

const PASSWORD = 'Passw0rd!2026';
const DOMAIN = 'teamvector.co';

/**
 * A tiny seeded PRNG. `Math.random()` would make each run different, and a demo where
 * the reports change every time you reset is a demo you cannot rehearse.
 */
let seedState = 20260905;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

/**
 * Exactly one admin. Every other role is filled by a named person so the audit trail
 * and the approval queue read like a real team rather than "user 1 approved".
 */
const STAFF = [
  { name: 'Neha Gupta', email: `admin@${DOMAIN}`, role: 'admin' as const, team: 'Enterprise West' },
  {
    name: 'Anita Desai',
    email: `anita@${DOMAIN}`,
    role: 'sales_manager' as const,
    team: 'Enterprise West',
  },
  { name: 'Vikram Rao', email: `vikram@${DOMAIN}`, role: 'finance' as const, team: null },
  {
    name: 'Priya Sharma',
    email: `priya@${DOMAIN}`,
    role: 'sales_rep' as const,
    team: 'Enterprise West',
  },
  {
    name: 'Rahul Menon',
    email: `rahul@${DOMAIN}`,
    role: 'sales_rep' as const,
    team: 'Enterprise North',
  },
  {
    name: 'Kiran Nair',
    email: `kiran@${DOMAIN}`,
    role: 'sales_rep' as const,
    team: 'Enterprise South',
  },
];

const CUSTOMERS = [
  {
    name: 'Acme Corp',
    contact: 'Sundar Iyer',
    email: `buyer@acme.${DOMAIN}`,
    tier: 'gold' as Tier,
    industry: 'Manufacturing',
  },
  {
    name: 'Beta Industries',
    contact: 'Meera Krishnan',
    email: `buyer@beta.${DOMAIN}`,
    tier: 'silver' as Tier,
    industry: 'Logistics',
  },
  {
    name: 'Cygnus Retail',
    contact: 'Arjun Bose',
    email: `buyer@cygnus.${DOMAIN}`,
    tier: 'bronze' as Tier,
    industry: 'Retail',
  },
  {
    name: 'Forge Analytics',
    contact: 'Ritu Malhotra',
    email: `buyer@forge.${DOMAIN}`,
    tier: 'gold' as Tier,
    industry: 'Software',
  },
];

// ---------------------------------------------------------------------------
// Catalogue vocabulary — 200 products are composed from these
// ---------------------------------------------------------------------------

const CATALOGUE: Record<
  Category,
  {
    prefix: string;
    nouns: string[];
    qualifiers: string[];
    low: number;
    high: number;
    margin: number;
  }
> = {
  hardware: {
    prefix: 'HW',
    nouns: [
      'Laptop Pro',
      'UltraSharp Monitor',
      'Docking Station',
      'Workstation',
      'Thin Client',
      'Rack Server',
      'Network Switch',
      'Access Point',
      'Tablet',
      'Conference Camera',
    ],
    qualifiers: [
      '13"',
      '14"',
      '16"',
      '24"',
      '27"',
      '32"',
      'Gen 2',
      'Gen 3',
      'Pro',
      'Max',
      'Lite',
      'Rugged',
    ],
    low: 18000,
    high: 240000,
    margin: 0.28,
  },
  service: {
    prefix: 'SV',
    nouns: [
      'Onboarding Setup',
      'Migration',
      'Health Check',
      'Training Workshop',
      'Custom Integration',
      'Security Audit',
      'Deployment',
      'Data Cleanup',
      'Performance Review',
      'On-site Support',
    ],
    qualifiers: [
      'Standard',
      'Extended',
      'Express',
      'Half-day',
      'Two-day',
      'Quarterly',
      'Annual',
      'Enterprise',
    ],
    low: 9000,
    high: 180000,
    margin: 0.55,
  },
  subscription: {
    prefix: 'SB',
    nouns: [
      'Cloud Standard',
      'Cloud Premium',
      'Security Suite',
      'Analytics Platform',
      'Backup Service',
      'Device Management',
      'Helpdesk Seat',
      'API Gateway',
      'Log Retention',
      'Identity Suite',
    ],
    qualifiers: ['Per Seat', 'Per Device', 'Starter', 'Growth', 'Scale', 'Enterprise'],
    low: 400,
    high: 9000,
    margin: 0.62,
  },
  accessories: {
    prefix: 'AC',
    nouns: [
      'Extended Warranty',
      'Carry Case',
      'USB-C Cable',
      'Wireless Mouse',
      'Mechanical Keyboard',
      'Monitor Arm',
      'Headset',
      'Webcam Cover',
      'Surge Protector',
      'Laptop Stand',
    ],
    qualifiers: ['2 Year', '3 Year', 'Compact', 'Premium', 'Bulk Pack', 'Standard'],
    low: 600,
    high: 22000,
    margin: 0.45,
  },
};

const CATEGORY_MIX: Category[] = [
  ...Array<Category>(80).fill('hardware'),
  ...Array<Category>(50).fill('service'),
  ...Array<Category>(30).fill('subscription'),
  ...Array<Category>(40).fill('accessories'),
];

const TIER_FACTOR: Record<Tier, number> = { bronze: 1, silver: 0.96, gold: 0.92 };
const round50 = (value: number) => Math.round(value / 50) * 50;
const money = (value: number) => value.toFixed(2);

// ---------------------------------------------------------------------------

async function wipe() {
  // TRUNCATE rather than DELETE: it is one statement, resets nothing we depend on,
  // and CASCADE handles the foreign keys without needing a hand-maintained order.
  // The governance tables and `teams` are deliberately absent — they are policy.
  await db.execute(sql`
    TRUNCATE TABLE
      payments, invoice_lines, invoices,
      billing_occurrences, credit_notes,
      backorders, fulfillment_allocations, fulfillment_plans,
      approval_steps, line_comments, quotation_lines, quotations,
      alert_states, notifications, audit_log,
      upsell_rules, subscription_plan_products, subscription_plans,
      warehouse_stock, warehouses,
      price_lists, product_variants, products,
      refresh_tokens, customers, users
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  const started = Date.now();
  console.log('Wiping transactional data…');
  await wipe();

  // --- teams ---------------------------------------------------------------
  const teamRows = await db.select().from(teams);
  const teamId = (name: string | null) =>
    name ? (teamRows.find((t) => t.name === name)?.id ?? null) : null;

  // --- staff ---------------------------------------------------------------
  console.log(`Creating ${STAFF.length} staff (1 admin)…`);
  const hash = await hashPassword(PASSWORD); // identical for everyone, so hash once
  const staffRows = await db
    .insert(users)
    .values(
      STAFF.map((person) => ({
        name: person.name,
        email: person.email,
        passwordHash: hash,
        role: person.role,
        teamId: teamId(person.team),
        emailVerifiedAt: new Date(),
      })),
    )
    .returning({ id: users.id, email: users.email, role: users.role });

  const staffBy = (email: string) => staffRows.find((u) => u.email === email)!.id;
  const reps = staffRows.filter((u) => u.role === 'sales_rep').map((u) => u.id);

  const adminCount = staffRows.filter((u) => u.role === 'admin').length;
  if (adminCount !== 1) throw new Error(`Expected exactly 1 admin, seeded ${adminCount}`);

  // --- customers -----------------------------------------------------------
  console.log(`Creating ${CUSTOMERS.length} customers…`);
  const customerRows = await db
    .insert(customers)
    .values(
      CUSTOMERS.map((c) => ({
        customerId: generateCustomerId(c.name, c.email),
        name: c.name,
        contactName: c.contact,
        email: c.email,
        passwordHash: hash,
        tier: c.tier,
        currency: 'INR',
        industry: c.industry,
        emailVerifiedAt: new Date(),
      })),
    )
    .returning({ id: customers.id, tier: customers.tier, name: customers.name });

  // --- products ------------------------------------------------------------
  console.log('Creating 200 products with tier pricing…');
  const seen = new Set<string>();
  const productValues = CATEGORY_MIX.map((category, index) => {
    const spec = CATALOGUE[category];
    let name = `${pick(spec.nouns)} ${pick(spec.qualifiers)}`;
    // Names are composed, so collisions happen; disambiguate rather than skip, to
    // keep the count at exactly 200.
    while (seen.has(name)) name = `${pick(spec.nouns)} ${pick(spec.qualifiers)} ${between(2, 9)}`;
    seen.add(name);

    const basePrice = round50(spec.low + rand() * (spec.high - spec.low));
    return {
      name,
      sku: `${spec.prefix}-${String(index + 1).padStart(4, '0')}`,
      category,
      basePrice: money(basePrice),
      costPrice: money(round50(basePrice * (1 - spec.margin))),
      unit: category === 'subscription' ? 'seat' : category === 'service' ? 'engagement' : 'unit',
      taxPct: '18.00',
      description: `${name} — ${category}.`,
      active: rand() > 0.06, // a handful archived, so the active filter has something to do
    };
  });

  const productRows: { id: string; category: Category; basePrice: string; costPrice: string }[] =
    [];
  for (let i = 0; i < productValues.length; i += 50) {
    const chunk = await db
      .insert(products)
      .values(productValues.slice(i, i + 50))
      .returning({
        id: products.id,
        category: products.category,
        basePrice: products.basePrice,
        costPrice: products.costPrice,
      });
    productRows.push(...chunk);
  }

  const priceValues = productRows.flatMap((p) =>
    (['bronze', 'silver', 'gold'] as Tier[]).map((tier) => ({
      productId: p.id,
      tier,
      currency: 'INR',
      price: money(round50(Number(p.basePrice) * TIER_FACTOR[tier])),
    })),
  );
  for (let i = 0; i < priceValues.length; i += 200) {
    await db.insert(priceLists).values(priceValues.slice(i, i + 200));
  }

  // A few variants, so the product detail screen is not uniformly empty.
  await db.insert(productVariants).values(
    productRows
      .filter((p) => p.category === 'hardware')
      .slice(0, 20)
      .flatMap((p) => [
        { productId: p.id, attribute: 'Memory', value: '16GB', extraPrice: '0.00' },
        { productId: p.id, attribute: 'Memory', value: '32GB', extraPrice: '12000.00' },
      ]),
  );

  // --- warehouses ----------------------------------------------------------
  console.log('Creating 3 warehouses with stock…');
  const warehouseRows = await db
    .insert(warehouses)
    .values([
      {
        name: 'Main Warehouse',
        location: 'Bhiwandi, Mumbai',
        shippingCostWeight: '1.00',
        baseShipCost: '400.00',
        replenishThreshold: 5,
        replenishQty: 20,
        replenishLeadDays: 4,
      },
      {
        name: 'East Depot',
        location: 'Kolkata',
        shippingCostWeight: '1.40',
        baseShipCost: '400.00',
        replenishThreshold: 5,
        replenishQty: 20,
        replenishLeadDays: 6,
      },
      {
        name: 'South Hub',
        location: 'Bengaluru',
        shippingCostWeight: '1.80',
        baseShipCost: '400.00',
        replenishThreshold: 4,
        replenishQty: 15,
        replenishLeadDays: 9,
      },
    ])
    .returning({ id: warehouses.id });

  // Only physical goods are stocked — a service has nothing to hold.
  const shippable = productRows.filter(
    (p) => p.category === 'hardware' || p.category === 'accessories',
  );
  const stockValues = warehouseRows.flatMap((w, wi) =>
    shippable.map((p) => ({
      warehouseId: w.id,
      productId: p.id,
      // Deliberately thin at the third site so the split algorithm has to use two,
      // and a few zeroes so backorders and the consolidation prompt can occur.
      qty: wi === 2 ? between(0, 6) : between(0, 40),
    })),
  );
  for (let i = 0; i < stockValues.length; i += 200) {
    await db.insert(warehouseStock).values(stockValues.slice(i, i + 200));
  }

  // --- subscription plans --------------------------------------------------
  console.log('Creating subscription plans…');
  const planRows = await db
    .insert(subscriptionPlans)
    .values([
      {
        name: 'Cloud Standard — Monthly',
        cadence: 'monthly',
        prorationRule: 'daily_prorate',
        cancellationRule: 'refund_unused',
        trialDays: 14,
        billingDayOfCycle: 1,
      },
      {
        name: 'Cloud Premium — Quarterly',
        cadence: 'quarterly',
        prorationRule: 'next_cycle_adjust',
        cancellationRule: 'credit_note_only',
        minCommitmentMonths: 3,
        billingDayOfCycle: 1,
      },
      {
        name: 'Security Suite — Yearly',
        cadence: 'yearly',
        prorationRule: 'full_period',
        cancellationRule: 'no_refund',
        minCommitmentMonths: 12,
        billingDayOfCycle: 1,
      },
    ])
    .returning({ id: subscriptionPlans.id });

  const subscriptionProducts = productRows.filter((p) => p.category === 'subscription');
  await db.insert(subscriptionPlanProducts).values(
    subscriptionProducts.map((p, i) => ({
      planId: planRows[i % planRows.length]!.id,
      productId: p.id,
    })),
  );

  // --- upsell rules --------------------------------------------------------
  console.log('Creating upsell rules…');
  const triggers = productRows.filter((p) => p.category === 'hardware').slice(0, 20);
  const suggestions = productRows.filter((p) => p.category === 'accessories');
  await db.insert(upsellRules).values(
    triggers.map((t, i) => ({
      triggerProductId: t.id,
      suggestedProductId: suggestions[i % suggestions.length]!.id,
      coPurchaseScore: money(between(55, 96)),
      promoted: i % 3 === 0,
      minMarginPct: money(between(15, 30)),
    })),
  );

  // --- quotations ----------------------------------------------------------
  console.log('Creating 100 quotations across every stage…');

  // The mix is chosen so every screen has something: an approval queue with real
  // entries, a pipeline with all columns populated, and enough closed business for
  // the win rate and the rep discount baselines to mean something.
  const repeat = (stage: Stage, times: number): Stage[] =>
    Array.from({ length: times }, () => stage);
  const STAGE_MIX: Stage[] = [
    ...repeat('draft', 14),
    ...repeat('sent', 12),
    ...repeat('under_negotiation', 10),
    ...repeat('pending_approval', 9),
    ...repeat('approved', 10),
    ...repeat('fulfillment', 8),
    ...repeat('billed', 7),
    ...repeat('confirmed', 20),
    ...repeat('lost', 10),
  ];

  // One-time goods and services. Subscription products are added separately below,
  // because a recurring line needs a plan attached and a start date — putting them in
  // the general pool would produce subscription-category lines that never bill.
  const oneTimeProducts = productRows.filter((p) => p.category !== 'subscription');
  const recurringProducts = productRows.filter((p) => p.category === 'subscription');
  const priceFor = new Map(priceValues.map((p) => [`${p.productId}:${p.tier}`, Number(p.price)]));
  const now = Date.now();
  const DAY = 86_400_000;

  let reference = 1001;
  for (let i = 0; i < STAGE_MIX.length; i += 1) {
    const stage = STAGE_MIX[i]!;
    const customer = customerRows[i % customerRows.length]!;
    const ownerId = reps[i % reps.length]!;

    // Older quotations further down the list, so `lastActivityAt` spreads out and the
    // stalled-deal alert has genuine candidates rather than firing on everything.
    const ageDays = between(0, 90);
    const createdAt = new Date(now - ageDays * DAY);
    const openStages = ['draft', 'sent', 'under_negotiation', 'pending_approval'];
    const idleDays = openStages.includes(stage) ? between(0, 14) : between(0, 3);
    const lastActivityAt = new Date(now - idleDays * DAY);

    const [quotation] = await db
      .insert(quotations)
      .values({
        reference: `Q-${reference++}`,
        customerId: customer.id,
        ownerId,
        createdById: ownerId,
        tier: customer.tier,
        currency: 'INR',
        stage,
        orderDiscountPct: rand() > 0.75 ? money(between(2, 6)) : '0.00',
        negotiationStatus:
          stage === 'draft'
            ? 'none'
            : stage === 'under_negotiation'
              ? 'under_negotiation'
              : stage === 'confirmed'
                ? 'confirmed'
                : 'sent',
        sharedAt: stage === 'draft' ? null : createdAt,
        promisedDeliveryDate: new Date(now + between(5, 40) * DAY).toISOString().slice(0, 10),
        validUntil: new Date(now + between(10, 60) * DAY).toISOString().slice(0, 10),
        customerTerms: 'Prices valid until the date shown. Payment due 15 days from invoice.',
        internalNotes: rand() > 0.6 ? 'Customer pushed hard on the service line.' : null,
        lostReason: stage === 'lost' ? 'Lost on price to an incumbent reseller.' : null,
        createdAt,
        updatedAt: lastActivityAt,
        lastActivityAt,
      })
      .returning({ id: quotations.id });

    // Between two and five lines, with the occasional over-ceiling discount so the
    // risk score and the approval queue are exercised rather than always zero.
    const lineCount = between(2, 5);
    const chosen = new Set<string>();
    const lineValues = [];
    for (let l = 0; l < lineCount; l += 1) {
      const product = pick(oneTimeProducts);
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);

      const unitPrice = priceFor.get(`${product.id}:${customer.tier}`) ?? Number(product.basePrice);
      const aggressive = rand() > 0.7;
      lineValues.push({
        quotationId: quotation!.id,
        productId: product.id,
        productName: productValues[productRows.indexOf(product)]!.name,
        category: product.category,
        qty: between(1, 12),
        unitPrice: money(unitPrice),
        costPrice: product.costPrice,
        discountPct: money(aggressive ? between(12, 26) : between(0, 9)),
        taxPct: '18.00',
        position: l,
        createdAt,
      });
    }
    /**
     * Every third quotation also carries a subscription line, so the billing screen
     * has genuinely mixed orders — one-time goods invoiced up front, recurring seats
     * on their own schedule. That separation is the point of the feature, and it
     * cannot be demonstrated on an order that is entirely one or the other.
     */
    const isHybrid = i % 3 === 0 && recurringProducts.length > 0;
    if (isHybrid) {
      const product = pick(recurringProducts);
      const unitPrice = priceFor.get(`${product.id}:${customer.tier}`) ?? Number(product.basePrice);
      const plan = planRows[i % planRows.length]!;
      lineValues.push({
        quotationId: quotation!.id,
        productId: product.id,
        productName: productValues[productRows.indexOf(product)]!.name,
        category: product.category,
        qty: between(5, 40),
        unitPrice: money(unitPrice),
        costPrice: product.costPrice,
        discountPct: money(between(0, 8)),
        taxPct: '18.00',
        isSubscription: true,
        planId: plan.id,
        subscriptionStartDate: new Date(now - between(5, 60) * DAY).toISOString().slice(0, 10),
        position: lineValues.length,
        createdAt,
      });
    }

    await db.insert(quotationLines).values(lineValues);

    // A pending chain only where the stage says one is open.
    if (stage === 'pending_approval') {
      const needsFinance = rand() > 0.5;
      await db.insert(approvalSteps).values([
        {
          quotationId: quotation!.id,
          role: 'sales_manager',
          stepOrder: 0,
          status: 'pending',
          createdAt,
        },
        ...(needsFinance
          ? [
              {
                quotationId: quotation!.id,
                role: 'finance' as const,
                stepOrder: 1,
                status: 'pending' as const,
                createdAt,
              },
            ]
          : []),
      ]);
    }
  }

  // --- invoices for the billed and confirmed orders -------------------------
  console.log('Building invoices and payments…');
  const billable = await db
    .select({
      id: quotations.id,
      ref: quotations.reference,
      stage: quotations.stage,
      customerId: quotations.customerId,
    })
    .from(quotations)
    .where(sql`${quotations.stage} IN ('billed', 'confirmed')`);

  let invoiceRef = 2001;
  for (const q of billable) {
    const lines = await db
      .select()
      .from(quotationLines)
      .where(sql`${quotationLines.quotationId} = ${q.id}`);

    let subtotal = 0;
    let tax = 0;
    const snapshot = lines.map((line) => {
      const net = line.qty * Number(line.unitPrice) * (1 - Number(line.discountPct) / 100);
      subtotal += net;
      tax += net * (Number(line.taxPct) / 100);
      return {
        lineId: line.id,
        productName: line.productName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxPct: line.taxPct,
        total: money(net),
      };
    });

    const total = subtotal + tax;
    const paid = q.stage === 'confirmed' ? total : total * (rand() > 0.5 ? 0.4 : 0);

    const [invoice] = await db
      .insert(invoices)
      .values({
        reference: `INV-${invoiceRef++}`,
        quotationId: q.id,
        customerId: q.customerId,
        currency: 'INR',
        status: paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'sent',
        subtotal: money(subtotal),
        tax: money(tax),
        total: money(total),
        issueDate: new Date(now - between(5, 40) * DAY).toISOString().slice(0, 10),
        dueDate: new Date(now + between(1, 20) * DAY).toISOString().slice(0, 10),
        sentAt: new Date(),
      })
      .returning({ id: invoices.id });

    await db
      .insert(invoiceLines)
      .values(snapshot.map((line) => ({ ...line, invoiceId: invoice!.id })));

    if (paid > 0) {
      await db.insert(payments).values({
        invoiceId: invoice!.id,
        amount: money(paid),
        method: pick(['bank_transfer', 'upi', 'cheque', 'card'] as const),
        reference: `NEFT-${between(10000000, 99999999)}`,
        paidOn: new Date(now - between(1, 20) * DAY).toISOString().slice(0, 10),
        recordedById: staffBy(`vikram@${DOMAIN}`),
        recordedByName: 'Vikram Rao',
      });
    }
  }

  // --- billing schedules for a few subscription lines ------------------------
  console.log('Building recurring billing schedules…');
  const recurring = await db
    .select({
      id: quotationLines.id,
      quotationId: quotationLines.quotationId,
      unitPrice: quotationLines.unitPrice,
      discountPct: quotationLines.discountPct,
      qty: quotationLines.qty,
      startDate: quotationLines.subscriptionStartDate,
    })
    .from(quotationLines)
    .where(sql`${quotationLines.isSubscription} = true`);

  if (recurring.length > 0) {
    const occurrences = recurring.flatMap((line) => {
      // Net of the line discount, matching what the billing engine computes.
      const perCycle = line.qty * Number(line.unitPrice) * (1 - Number(line.discountPct) / 100);
      const start = new Date(
        `${line.startDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
      );
      return Array.from({ length: 12 }, (_, cycle) => {
        const occursOn = new Date(start);
        occursOn.setUTCMonth(occursOn.getUTCMonth() + cycle);
        return {
          quotationId: line.quotationId,
          lineId: line.id,
          occursOn: occursOn.toISOString().slice(0, 10),
          amount: money(perCycle),
          // Cycles already in the past are settled; the rest are still scheduled.
          status: occursOn.getTime() < now ? ('invoiced' as const) : ('scheduled' as const),
          cycleIndex: cycle,
        };
      });
    });

    for (let i = 0; i < occurrences.length; i += 200) {
      await db.insert(billingOccurrences).values(occurrences.slice(i, i + 200));
    }
  }

  // --- a couple of line comments, for the portal ----------------------------
  const shared = await db
    .select({ id: quotationLines.id })
    .from(quotationLines)
    .innerJoin(quotations, sql`${quotations.id} = ${quotationLines.quotationId}`)
    .where(sql`${quotations.stage} = 'under_negotiation'`)
    .limit(6);

  if (shared.length > 0) {
    await db.insert(lineComments).values(
      shared.flatMap((line) => [
        {
          lineId: line.id,
          authorName: 'Arjun Bose',
          side: 'customer' as const,
          message: 'Can we get the larger variant at this price?',
        },
        {
          lineId: line.id,
          authorName: 'Kiran Nair',
          side: 'staff' as const,
          message: 'The larger unit carries an uplift. I can hold this rate if you take all four.',
        },
      ]),
    );
  }

  // --- report ---------------------------------------------------------------
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM users)            AS staff,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS admins,
      (SELECT COUNT(*) FROM customers)        AS customers,
      (SELECT COUNT(*) FROM products)         AS products,
      (SELECT COUNT(*) FROM price_lists)      AS prices,
      (SELECT COUNT(*) FROM warehouses)       AS warehouses,
      (SELECT COUNT(*) FROM warehouse_stock)  AS stock,
      (SELECT COUNT(*) FROM subscription_plans) AS plans,
      (SELECT COUNT(*) FROM upsell_rules)     AS upsell,
      (SELECT COUNT(*) FROM quotations)       AS quotations,
      (SELECT COUNT(*) FROM quotation_lines)  AS lines,
      (SELECT COUNT(*) FROM approval_steps)   AS steps,
      (SELECT COUNT(*) FROM invoices)         AS invoices,
      (SELECT COUNT(*) FROM payments)         AS payments
  `);

  const row = counts.rows[0] as Record<string, unknown>;
  console.log('\nSeed complete in', ((Date.now() - started) / 1000).toFixed(1), 's\n');
  for (const [key, value] of Object.entries(row)) {
    console.log(`  ${key.padEnd(12)} ${String(value)}`);
  }
  console.log(`\n  Every account uses the password: ${PASSWORD}`);
  console.log(`  Admin: admin@${DOMAIN}\n`);

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error('seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
