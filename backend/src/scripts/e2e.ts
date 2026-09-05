import 'dotenv/config';

/**
 * End-to-end walkthrough of the problem statement's Quick Test Flow (section 9).
 *
 * Every assertion here is a business rule from the brief rather than a unit of code:
 * that an over-ceiling discount routes itself for approval without the rep asking,
 * that stock splits across two warehouses, that one-time and recurring charges bill
 * separately, that the person who sold the deal cannot confirm the payment, and that
 * nothing internal reaches the customer portal.
 *
 * Run against a live server:  npm run e2e
 *
 * The suite makes roughly 150 requests. The global limiter defaults to 100 per minute
 * per IP, so two runs back to back will trip it and produce failures that move around
 * between runs. Wait a minute between runs, or raise RATE_LIMIT_MAX_REQUESTS locally.
 */

const BASE = process.env.E2E_BASE ?? 'http://localhost:5050/api/v1';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(label);
    console.log(`  FAIL  ${label}`);
    console.log(`          expected ${e}`);
    console.log(`          got      ${a}`);
  }
}

type Json = Record<string, unknown>;

async function call(
  method: string,
  path: string,
  token?: string | null,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Json> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { _status: response.status, _raw: text.slice(0, 120) };
  }
}

/** Narrow helper so the assertions below read as business statements, not casts. */
function pick<T = unknown>(value: unknown, ...path: (string | number)[]): T | undefined {
  let current: unknown = value;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current as T;
}

const stamp = Date.now();
const PASSWORD = 'S3cure!pass';

async function signIn(email: string): Promise<string> {
  const response = await call('POST', '/auth/login', null, {
    email,
    password: PASSWORD,
    type: 'internal',
  });
  return pick<string>(response, 'data', 'accessToken') ?? '';
}

/** Signs up a staff account and completes OTP verification, returning its token. */
async function createStaff(email: string, name: string): Promise<string> {
  const signup = await call('POST', '/auth/signup', null, {
    name,
    email,
    password: PASSWORD,
    type: 'internal',
  });
  // `devOtp` is returned only outside production, and only with EXPOSE_DEV_OTP=true.
  const otp = pick<string>(signup, 'devOtp');
  if (!otp) throw new Error(`No devOtp for ${email} — set EXPOSE_DEV_OTP=true in .env`);

  const verified = await call('POST', '/auth/verify-otp', null, { email, otp, type: 'internal' });
  return pick<string>(verified, 'data', 'accessToken') ?? '';
}

async function main() {
  const adminEmail = `admin${stamp}@teamvector.space`;
  const managerEmail = `mgr${stamp}@teamvector.space`;
  const financeEmail = `fin${stamp}@teamvector.space`;
  const repEmail = `rep${stamp}@teamvector.space`;

  // ---------------------------------------------------------------- accounts
  console.log('\n=== 1. Accounts and roles ===');

  const { seedAdmin } = await import('./seed-admin.js');
  await seedAdmin(adminEmail, 'Admin', PASSWORD);
  const admin = await signIn(adminEmail);
  check('admin signed in', admin.length > 0, true);

  await createStaff(managerEmail, 'Anita Desai');
  await createStaff(financeEmail, 'Vikram Rao');
  const repToken = await createStaff(repEmail, 'Priya Sharma');
  check('rep signed up and verified', repToken.length > 0, true);

  const staff = await call('GET', '/users/?pageSize=100', admin);
  const staffRows = pick<Json[]>(staff, 'data') ?? [];
  const idOf = (email: string) =>
    (staffRows.find((row) => row.email === email)?.id as string | undefined) ?? '';

  const managerId = idOf(managerEmail);
  const financeId = idOf(financeEmail);
  const repId = idOf(repEmail);

  await call('PATCH', `/users/${managerId}`, admin, { role: 'sales_manager' });
  await call('PATCH', `/users/${financeId}`, admin, { role: 'finance' });

  const manager = await signIn(managerEmail);
  const finance = await signIn(financeEmail);
  check(
    'manager and finance promoted and signed in',
    manager.length > 0 && finance.length > 0,
    true,
  );

  // Signup never accepts a role — that is what keeps `admin` unreachable from outside.
  const escalation = await call('POST', '/auth/signup', null, {
    name: 'Attacker',
    email: `evil${stamp}@teamvector.space`,
    password: PASSWORD,
    type: 'internal',
    role: 'admin',
  });
  check(
    'role cannot be self-selected at signup',
    pick(escalation, 'error', 'code'),
    'FIELD_NOT_ALLOWED',
  );

  const teams = await call('GET', '/teams/', admin);
  const teamId = pick<string>(teams, 'data', 0, 'id') ?? '';
  const assigned = await call('PATCH', `/users/${repId}`, manager, { teamId });
  check(
    'manager can assign a rep to a team',
    typeof pick(assigned, 'data', 'team') === 'string',
    true,
  );

  const roleAttempt = await call('PATCH', `/users/${repId}`, manager, { role: 'finance' });
  check('manager cannot change a role', pick(roleAttempt, 'error', 'code'), 'FORBIDDEN');

  // ------------------------------------------------------------ configuration
  console.log('\n=== 2. Backend configuration ===');

  const hardware =
    pick<string>(
      await call('POST', '/products/', admin, {
        name: 'Laptop Pro 14',
        sku: `HW-LP14-${stamp}`,
        category: 'hardware',
        basePrice: 95000,
        costPrice: 68000,
        taxPct: 18,
      }),
      'data',
      'id',
    ) ?? '';

  const service =
    pick<string>(
      await call('POST', '/products/', admin, {
        name: 'Onboarding Setup Service',
        sku: `SV-ONB-${stamp}`,
        category: 'service',
        basePrice: 20000,
        costPrice: 9000,
        taxPct: 18,
      }),
      'data',
      'id',
    ) ?? '';

  const warranty =
    pick<string>(
      await call('POST', '/products/', admin, {
        name: 'Extended Warranty',
        sku: `AC-WAR-${stamp}`,
        category: 'accessories',
        basePrice: 9000,
        costPrice: 3000,
        taxPct: 18,
      }),
      'data',
      'id',
    ) ?? '';

  check(
    'three products created, including accessories',
    Boolean(hardware && service && warranty),
    true,
  );

  const prices =
    pick<Json[]>(await call('GET', `/price-lists/?productId=${hardware}`, admin), 'data') ?? [];
  const goldPrice = prices.find((row) => row.tier === 'gold')?.price;
  check('gold tier price auto-generated (95,000 -> 87,400)', goldPrice, 87400);

  const main =
    pick<string>(
      await call('POST', '/warehouses/', admin, {
        name: `Main Warehouse ${stamp}`,
        location: 'Bhiwandi, Mumbai',
        shippingCostWeight: 1.0,
        baseShipCost: 400,
        replenishThreshold: 5,
        replenishQty: 20,
        replenishLeadDays: 4,
      }),
      'data',
      'id',
    ) ?? '';

  const east =
    pick<string>(
      await call('POST', '/warehouses/', admin, {
        name: `East Depot ${stamp}`,
        location: 'Kolkata',
        shippingCostWeight: 1.4,
        baseShipCost: 400,
        replenishThreshold: 5,
        replenishQty: 20,
        replenishLeadDays: 6,
      }),
      'data',
      'id',
    ) ?? '';

  await call('PUT', `/warehouses/${main}/stock`, admin, {
    stock: { [hardware]: 6, [warranty]: 50 },
  });
  await call('PUT', `/warehouses/${east}/stock`, admin, { stock: { [hardware]: 4 } });
  check('two warehouses stocked', Boolean(main && east), true);

  const plan =
    pick<string>(
      await call('POST', '/subscription-plans/', admin, {
        name: 'Cloud Standard — Monthly',
        cadence: 'monthly',
        prorationRule: 'daily_prorate',
        cancellationRule: 'refund_unused',
      }),
      'data',
      'id',
    ) ?? '';
  check('subscription plan created', plan.length > 0, true);

  const config = await call('GET', '/config/discount', admin);
  check('tier ceilings seeded', pick(config, 'data', 'tierCeilings', 'gold'), 15);
  check('category ceilings seeded', pick(config, 'data', 'categoryCeilings', 'service'), 10);
  check(
    'approval chain seeded',
    (pick<unknown[]>(config, 'data', 'approvalChain') ?? []).length,
    3,
  );
  check(
    'rep cannot read governance config',
    pick(await call('GET', '/config/discount', repToken), 'error', 'code'),
    'FORBIDDEN',
  );

  // ---------------------------------------------------------------- customer
  console.log('\n=== 3. Customer self-registration ===');

  const customerEmail = `cust${stamp}@acme.example`;
  const customerSignup = await call('POST', '/auth/signup', null, {
    name: 'Acme Corp',
    email: customerEmail,
    password: 'Acme@2026x',
    type: 'customer',
  });
  const customerOtp = pick<string>(customerSignup, 'devOtp') ?? '';
  const customerVerified = await call('POST', '/auth/verify-otp', null, {
    email: customerEmail,
    otp: customerOtp,
    type: 'customer',
  });
  const customerToken = pick<string>(customerVerified, 'data', 'accessToken') ?? '';
  check('customer registered and verified', customerToken.length > 0, true);

  const found = await call('GET', `/customers/?q=${encodeURIComponent(customerEmail)}`, admin);
  const customerId = pick<string>(found, 'data', 0, 'id') ?? '';
  check(
    'customer id has the DF- form',
    (pick<string>(found, 'data', 0, 'customerId') ?? '').startsWith('DF-'),
    true,
  );
  check('tier is bronze at signup, never self-selected', pick(found, 'data', 0, 'tier'), 'bronze');

  const promoted = await call('PATCH', `/customers/${customerId}/tier`, manager, { tier: 'gold' });
  check('manager promotes the customer to gold', pick(promoted, 'data', 'tier'), 'gold');
  check(
    'rep cannot change a customer tier',
    pick(
      await call('PATCH', `/customers/${customerId}/tier`, repToken, { tier: 'bronze' }),
      'error',
      'code',
    ),
    'FORBIDDEN',
  );

  const directory = await call('GET', '/customers/', admin);
  check(
    'directory lists without a search term',
    (pick<number>(directory, 'meta', 'total') ?? 0) >= 1,
    true,
  );

  // --------------------------------------------------------------- quotation
  console.log('\n=== 4. Building the quotation ===');

  const created = await call('POST', '/quotations/', repToken, { customerId });
  const quotationId = pick<string>(created, 'data', 'id') ?? '';
  const reference = pick<string>(created, 'data', 'reference') ?? '';
  check('quotation has a readable reference', reference.startsWith('Q-'), true);
  check('tier snapshotted from the customer', pick(created, 'data', 'tier'), 'gold');

  await call('POST', `/quotations/${quotationId}/lines`, repToken, { productId: hardware, qty: 8 });
  await call('POST', `/quotations/${quotationId}/lines`, repToken, { productId: service, qty: 1 });

  let quotation = await call('GET', `/quotations/${quotationId}`, repToken);
  const lines = pick<Json[]>(quotation, 'data', 'lines') ?? [];
  check('unit price resolved from the gold price list', lines[0]?.unitPrice, 87400);

  const hardwareLine = lines[0]?.id as string;
  const serviceLine = lines[1]?.id as string;

  await call('PATCH', `/quotations/${quotationId}/lines/${hardwareLine}`, repToken, {
    discountPct: 12,
  });
  await call('PATCH', `/quotations/${quotationId}/lines/${serviceLine}`, repToken, {
    discountPct: 18,
    unitPrice: 18400,
  });

  // ------------------------------------------------------------------- risk
  console.log('\n=== 5. Blended risk score (the brief’s worked example) ===');

  const risk = await call('POST', '/risk/score', repToken, {
    quotationId,
    tier: 'gold',
    orderDiscountPct: 0,
    lines: [
      {
        category: 'hardware',
        qty: 8,
        unitPrice: 87400,
        discountPct: 12,
        productName: 'Laptop Pro 14',
      },
      { category: 'service', qty: 1, unitPrice: 18400, discountPct: 18, productName: 'Onboarding' },
    ],
  });
  check('blended score', pick(risk, 'data', 'score'), 0.21);
  check('worst single overage', pick(risk, 'data', 'worstSingleOverage'), 8);
  check('one line breaches its ceiling', pick(risk, 'data', 'violationCount'), 1);
  check('routed to the manager via the 5-point trip', pick(risk, 'data', 'approvers'), [
    'sales_manager',
  ]);
  check(
    'hardware line is inside its ceiling',
    pick(risk, 'data', 'lineBreakdown', 0, 'isViolation'),
    false,
  );
  check(
    'service line binds on the category ceiling',
    pick(risk, 'data', 'lineBreakdown', 1, 'ceilingPct'),
    10,
  );

  // ----------------------------------------------------------------- upsell
  console.log('\n=== 6. Upsell suggestion ===');

  await call('POST', '/upsell-rules/', admin, {
    triggerProductId: hardware,
    suggestedProductId: warranty,
    coPurchaseScore: 92,
    promoted: true,
    minMarginPct: 25,
  });
  const suggestions = await call('POST', '/upsell-rules/suggest', repToken, {
    productIds: [hardware],
    tier: 'gold',
    currency: 'INR',
  });
  check('warranty suggested', pick(suggestions, 'data', 0, 'productName'), 'Extended Warranty');
  check(
    'ranking is explained, not a black box',
    typeof pick(suggestions, 'data', 0, 'breakdown', 'coPurchase'),
    'number',
  );

  // --------------------------------------------------------------- approval
  console.log('\n=== 7. Automatic approval routing ===');

  const submitted = await call('POST', `/quotations/${quotationId}/submit-approval`, repToken);
  check(
    'not auto-approved — a line is over its ceiling',
    pick(submitted, 'data', 'autoApproved'),
    false,
  );
  check(
    'stage moved to pending_approval',
    pick(submitted, 'data', 'quotation', 'stage'),
    'pending_approval',
  );
  check('the rep never chose the route', pick(submitted, 'data', 'approvers'), ['sales_manager']);

  check(
    'a rep cannot approve their own quotation',
    pick(await call('POST', `/quotations/${quotationId}/approve`, repToken, {}), 'error', 'code'),
    'WRONG_APPROVER',
  );
  check(
    'finance cannot act before the manager',
    pick(await call('POST', `/quotations/${quotationId}/approve`, finance, {}), 'error', 'code'),
    'WRONG_APPROVER',
  );
  check(
    'a rejection needs a reason',
    pick(
      await call('POST', `/quotations/${quotationId}/reject`, manager, { reason: 'no' }),
      'error',
      'code',
    ),
    'VALIDATION_FAILED',
  );

  const queue = await call('GET', '/approvals/queue', manager);
  check(
    'the quotation is in the manager queue',
    (pick<unknown[]>(queue, 'data') ?? []).length >= 1,
    true,
  );

  const approved = await call('POST', `/quotations/${quotationId}/approve`, manager, {
    comment: 'Strategic account, margin still acceptable.',
  });
  check('manager approval completes the chain', pick(approved, 'data', 'complete'), true);
  check('stage is now approved', pick(approved, 'data', 'quotation', 'stage'), 'approved');

  // ------------------------------------------------------------ fulfillment
  console.log('\n=== 8. Warehouse split ===');

  const plan8 = await call('GET', `/quotations/${quotationId}/fulfillment/`, repToken);
  check('two shipments for 8 units across 6 + 4 stock', pick(plan8, 'data', 'shipmentCount'), 2);
  check('nothing on backorder', (pick<unknown[]>(plan8, 'data', 'backorders') ?? []).length, 0);
  check('estimated cost 400x1.0 + 400x1.4', pick(plan8, 'data', 'estimatedCost'), 960);

  await call('POST', `/quotations/${quotationId}/fulfillment/accept`, finance);
  quotation = await call('GET', `/quotations/${quotationId}`, repToken);
  check(
    'accepting the split moves the stage to fulfillment',
    pick(quotation, 'data', 'stage'),
    'fulfillment',
  );

  // ---------------------------------------------------------------- billing
  console.log('\n=== 9. Hybrid billing ===');

  const billing = await call('POST', `/quotations/${quotationId}/billing/build`, finance);
  check('one-time rows built', (pick<unknown[]>(billing, 'data', 'oneTimeRows') ?? []).length, 2);
  check(
    'invoice reference generated',
    (pick<string>(billing, 'data', 'invoiceReference') ?? '').startsWith('INV-'),
    true,
  );
  const invoiceId = pick<string>(billing, 'data', 'invoiceId') ?? '';

  // ---------------------------------------------------------------- payment
  console.log('\n=== 10. Invoicing and payment ===');

  check(
    'a rep cannot issue an invoice',
    pick(await call('POST', `/invoices/${invoiceId}/send`, repToken), 'error', 'code'),
    'FORBIDDEN',
  );
  check(
    'a payment cannot be recorded against a draft',
    pick(
      await call('POST', `/invoices/${invoiceId}/payments`, finance, { amount: 1, method: 'upi' }),
      'error',
      'code',
    ),
    'INVOICE_NOT_ISSUED',
  );

  await call('POST', `/invoices/${invoiceId}/send`, finance);
  let invoice = await call('GET', `/invoices/${invoiceId}`, finance);
  check('invoice issued', pick(invoice, 'data', 'status'), 'sent');
  check(
    'quotation moved to billed',
    pick(await call('GET', `/quotations/${quotationId}`, repToken), 'data', 'stage'),
    'billed',
  );

  const balance = pick<number>(invoice, 'data', 'balanceRemaining') ?? 0;
  check(
    'a rep cannot record a payment',
    pick(
      await call('POST', `/invoices/${invoiceId}/payments`, repToken, { amount: 1, method: 'upi' }),
      'error',
      'code',
    ),
    'FORBIDDEN',
  );
  check(
    'overpayment refused',
    pick(
      await call('POST', `/invoices/${invoiceId}/payments`, finance, {
        amount: balance + 1000,
        method: 'upi',
      }),
      'error',
      'code',
    ),
    'OVERPAYMENT',
  );

  const half = Math.round((balance / 2) * 100) / 100;
  await call('POST', `/invoices/${invoiceId}/payments`, finance, {
    amount: half,
    method: 'bank_transfer',
    reference: 'NEFT-88213004',
  });
  invoice = await call('GET', `/invoices/${invoiceId}`, finance);
  check('partial payment', pick(invoice, 'data', 'status'), 'partially_paid');

  const remaining = pick<number>(invoice, 'data', 'balanceRemaining') ?? 0;
  const key = `idem-${stamp}`;
  await call(
    'POST',
    `/invoices/${invoiceId}/payments`,
    finance,
    { amount: remaining, method: 'upi', reference: 'UPI-1' },
    { 'idempotency-key': key },
  );
  const replay = await call(
    'POST',
    `/invoices/${invoiceId}/payments`,
    finance,
    { amount: remaining, method: 'upi', reference: 'UPI-1' },
    { 'idempotency-key': key },
  );
  check('idempotency key prevents a double payment', pick(replay, 'data', 'replayed'), true);

  invoice = await call('GET', `/invoices/${invoiceId}`, finance);
  check('invoice settled', pick(invoice, 'data', 'status'), 'paid');
  check(
    'full settlement confirms the order',
    pick(await call('GET', `/quotations/${quotationId}`, repToken), 'data', 'stage'),
    'confirmed',
  );

  // ----------------------------------------------------------------- portal
  console.log('\n=== 11. Customer portal isolation ===');

  check(
    'customer token blocked from /quotations',
    pick(await call('GET', '/quotations/', customerToken), 'error', 'code'),
    'WRONG_KIND',
  );
  check(
    'customer token blocked from /config',
    pick(await call('GET', '/config/discount', customerToken), 'error', 'code'),
    'WRONG_KIND',
  );
  check(
    'customer token blocked from /invoices',
    pick(await call('GET', '/invoices/', customerToken), 'error', 'code'),
    'WRONG_KIND',
  );
  check(
    'customer token blocked from /audit-log',
    pick(await call('GET', '/audit-log/', customerToken), 'error', 'code'),
    'WRONG_KIND',
  );
  check(
    'staff token blocked from /customer/*',
    pick(await call('GET', '/customer/quotations', repToken), 'error', 'code'),
    'WRONG_KIND',
  );

  // An unshared quotation must never be visible, even to the customer it names.
  const beforeShare = await call('GET', '/customer/quotations', customerToken);
  check(
    'an unshared quotation is invisible to the customer',
    (pick<unknown[]>(beforeShare, 'data') ?? []).length,
    0,
  );

  // ------------------------------------------------------------ negotiation
  console.log('\n=== 12. Negotiation and automatic re-approval ===');

  // A second quotation, priced inside every ceiling so it auto-approves — the point is
  // to prove that the CUSTOMER's counter-offer is what forces it back into approval.
  const negotiation = await call('POST', '/quotations/', repToken, { customerId });
  const negotiationId = pick<string>(negotiation, 'data', 'id') ?? '';
  const negotiationRef = pick<string>(negotiation, 'data', 'reference') ?? '';
  await call('POST', `/quotations/${negotiationId}/lines`, repToken, {
    productId: hardware,
    qty: 4,
  });
  await call('PATCH', `/quotations/${negotiationId}`, repToken, {
    customerTerms: 'Prices valid until the date shown. Payment due 15 days from invoice.',
  });

  const clean = await call('POST', `/quotations/${negotiationId}/submit-approval`, repToken);
  check(
    'a quotation inside every ceiling auto-approves',
    pick(clean, 'data', 'autoApproved'),
    true,
  );
  check('auto-approval needs no approvers', pick(clean, 'data', 'approvers'), []);

  await call('POST', `/quotations/${negotiationId}/stage`, repToken, { toStage: 'sent' });
  const shared = await call('POST', `/quotations/${negotiationId}/share`, repToken);
  check('sharing moves the stage to sent', pick(shared, 'data', 'quotation', 'stage'), 'sent');

  const portal = await call('GET', '/customer/quotations', customerToken);
  check(
    'customer now sees the shared quotation',
    pick(portal, 'data', 0, 'reference'),
    negotiationRef,
  );
  check(
    'customer may message, propose and confirm',
    [
      pick(portal, 'data', 0, 'canMessage'),
      pick(portal, 'data', 0, 'canProposeTerms'),
      pick(portal, 'data', 0, 'canConfirm'),
    ],
    [true, true, true],
  );

  const serialised = JSON.stringify(portal);
  const forbidden = [
    'costPrice',
    'marginPct',
    'ceilingPct',
    'internalNotes',
    'ownerName',
    'ownerId',
    'approvalSteps',
    'sales_manager',
    'sales_rep',
    'riskScore',
  ];
  const leaked = forbidden.filter((field) => serialised.includes(field));
  check('no internal field reaches the portal', leaked, []);

  const portalLineId = pick<string>(portal, 'data', 0, 'lines', 0, 'id') ?? '';
  const commented = await call(
    'POST',
    `/customer/quotations/${negotiationId}/lines/${portalLineId}/comments`,
    customerToken,
    {
      message: 'Are these the height-adjustable stands?',
    },
  );
  check(
    'customer comment lands and flags the seller',
    pick(commented, 'data', 'awaitingSellerReply'),
    true,
  );
  check(
    'the comment is attributed to the customer side',
    pick(commented, 'data', 'lines', 0, 'comments', 0, 'side'),
    'customer',
  );

  const replied = await call(
    'POST',
    `/quotations/${negotiationId}/lines/${portalLineId}/comments`,
    repToken,
    {
      message: 'Yes — all four are height adjustable.',
    },
  );
  check('rep reply clears the awaiting flag', pick(replied, 'data', 'awaitingSeller'), false);

  const reply = await call('GET', `/customer/quotations/${negotiationId}`, customerToken);
  check(
    'the rep is shown to the customer only as "seller"',
    pick(reply, 'data', 'lines', 0, 'comments', 1, 'side'),
    'seller',
  );

  // 25% on hardware is 10 points past the gold ceiling of 15 — enough to demand
  // both a manager and finance once it is applied.
  const countered = await call(
    'POST',
    `/customer/quotations/${negotiationId}/request`,
    customerToken,
    {
      counterDiscountPct: 25,
      justification: 'Comparing three vendors, others landing about 25% below list.',
    },
  );
  check(
    'counter-offer moves the quotation to under_negotiation',
    pick(countered, 'data', 'stage'),
    'under_negotiation',
  );

  const applied = await call('POST', `/quotations/${negotiationId}/apply-counter`, repToken);
  check('applying the counter re-scores immediately', pick(applied, 'data', 'risk', 'score'), 10);
  check('the re-score demands manager and finance', pick(applied, 'data', 'risk', 'approvers'), [
    'sales_manager',
    'finance',
  ]);

  const confirmed = await call(
    'POST',
    `/customer/quotations/${negotiationId}/confirm`,
    customerToken,
  );
  check(
    'customer confirmation re-enters approval automatically',
    pick(confirmed, 'data', 'reapproval'),
    true,
  );
  check('two approvers required', pick(confirmed, 'data', 'requiredApprovers'), 2);
  check('the score is never returned to the customer', pick(confirmed, 'data', 'risk'), undefined);
  check(
    'stage is pending_approval again',
    pick(confirmed, 'data', 'quotation', 'stage'),
    'pending_approval',
  );

  const reapprovalTrail = await call(
    'GET',
    `/audit-log/?entityId=${negotiationId}&pageSize=100`,
    manager,
  );
  const reapprovalEntries = pick<Json[]>(reapprovalTrail, 'data') ?? [];
  check(
    're-approval is audited against the customer',
    reapprovalEntries.some(
      (row) => String(row.action).includes('Re-approval triggered') && row.actorRole === 'customer',
    ),
    true,
  );
  check(
    'the auto-approval was audited as a system action',
    reapprovalEntries.some((row) => row.actorRole === 'system'),
    true,
  );

  // ------------------------------------------------------------------ audit
  console.log('\n=== 13. Audit trail ===');

  const trail = await call('GET', `/audit-log/?entityId=${quotationId}&pageSize=100`, manager);
  const entries = pick<Json[]>(trail, 'data') ?? [];
  check('the quotation has a full trail', entries.length >= 8, true);
  check(
    'the approval is recorded with its reason',
    entries.some((row) => String(row.action).includes('Approved by')),
    true,
  );
  // The payment is audited against the INVOICE, which is the entity it belongs to.
  const invoiceTrail =
    pick<Json[]>(
      await call('GET', `/audit-log/?entityId=${invoiceId}&pageSize=100`, finance),
      'data',
    ) ?? [];
  check(
    'the payment is recorded against the invoice',
    invoiceTrail.some((row) => String(row.action).includes('Payment recorded')),
    true,
  );
  check(
    'the payment records who confirmed it',
    invoiceTrail.some((row) => row.actorRole === 'finance'),
    true,
  );
  check(
    'a rep cannot read the audit log',
    pick(await call('GET', '/audit-log/', repToken), 'error', 'code'),
    'FORBIDDEN',
  );

  // -------------------------------------------------------------- reporting
  console.log('\n=== 14. Reporting ===');

  const report = await call('GET', '/reports/summary', manager);
  check(
    'team rollup present',
    (pick<unknown[]>(report, 'data', 'valueByTeam') ?? []).length >= 1,
    true,
  );
  check(
    'rep breakdown present',
    (pick<unknown[]>(report, 'data', 'valueByRep') ?? []).length >= 1,
    true,
  );
  check(
    'revenue mix splits one-time from recurring',
    typeof pick(report, 'data', 'revenueMix', 0, 'oneTime'),
    'number',
  );
  check('funnel covers every stage', (pick<unknown[]>(report, 'data', 'funnel') ?? []).length, 9);

  const health = await call('GET', '/dashboard/deal-health', manager);
  check('deal health returns KPIs', typeof pick(health, 'data', 'winRate'), 'number');

  // -------------------------------------------------------------------- pdf
  console.log('\n=== 15. Document generation ===');

  const pdfResponse = await fetch(`${BASE}/quotations/${quotationId}/pdf/`, {
    headers: { authorization: `Bearer ${repToken}` },
  });
  const contentType = pdfResponse.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    const bytes = Buffer.from(await pdfResponse.arrayBuffer());
    check(
      'quotation PDF streamed (Cloudinary not configured)',
      bytes.subarray(0, 4).toString(),
      '%PDF',
    );
  } else {
    const hosted = (await pdfResponse.json()) as Json;
    check('quotation PDF uploaded to Cloudinary', pick(hosted, 'data', 'hosted'), true);
    check(
      'hosted URL returned',
      String(pick(hosted, 'data', 'url') ?? '').startsWith('http'),
      true,
    );
  }

  // ------------------------------------------------------------------ result
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failing checks:');
    for (const failure of failures) console.log(`    - ${failure}`);
  }
  console.log('='.repeat(64));

  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('\nE2E run aborted:', error instanceof Error ? error.message : error);
  process.exit(1);
});
