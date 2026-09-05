/**
 * DealFlow360 API tester — development only.
 *
 * Served from the API's own origin so there is no CORS hop between this page and the
 * endpoints it calls, and mounted only when NODE_ENV is not production.
 *
 * The endpoint list below is the single source of truth for the UI. Each entry can
 * declare a `capture` map, which pulls ids out of a successful response into the
 * variable bag so the next request in a flow is already filled in — that is what makes
 * it possible to walk quote -> approve -> fulfil -> bill -> pay without copying uuids
 * by hand.
 */

const VARS_KEY = 'df360.vars';

/** Everything captured from earlier responses. Persisted so a reload keeps the session. */
let vars = load();
if (!vars.tier) vars.tier = 'gold';

function load() {
  try {
    return JSON.parse(localStorage.getItem(VARS_KEY) || '{}');
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(VARS_KEY, JSON.stringify(vars));
  } catch {
    /* private window — the page still works, it just will not survive a reload */
  }
  renderVars();
  renderChips();
}

/** Replaces {{name}} with whatever is in the bag, leaving unknown names visible. */
function interpolate(text) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (whole, name) => vars[name] ?? whole);
}

/** Reads a dotted path out of a response body, tolerating missing links. */
function dig(source, path) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    const index = /^\d+$/.test(key) ? Number(key) : key;
    return current[index];
  }, source);
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const B = (obj) => JSON.stringify(obj, null, 2);

const ENDPOINTS = [
  ['Health', [
    { m: 'GET', p: '/health', auth: 'none', d: 'Liveness.' },
    { m: 'GET', p: '/health/ready', auth: 'none', d: 'Database and Redis reachability.' },
  ]],

  ['Auth', [
    { m: 'POST', p: '/auth/signup', auth: 'none',
      d: 'Always creates a sales_rep. A "role" in the body is rejected with 400 FIELD_NOT_ALLOWED — that is what keeps admin unreachable from outside.',
      b: B({ name: 'Priya Sharma', email: 'priya@teamvector.co', password: 'Passw0rd!2026', type: 'internal' }),
      capture: { otp: 'devOtp', staffEmail: '_req.email' } },
    { m: 'POST', p: '/auth/verify-otp', auth: 'none',
      d: 'Six digits, ten minutes, five attempts, single use.',
      b: B({ email: '{{staffEmail}}', otp: '{{otp}}', type: 'internal' }),
      capture: { staffToken: 'data.accessToken', refreshToken: 'data.refreshToken' } },
    { m: 'POST', p: '/auth/login', auth: 'none',
      d: 'Identical error for unknown email and wrong password, so this is not an account-enumeration oracle.',
      b: B({ email: '{{staffEmail}}', password: 'Passw0rd!2026', type: 'internal' }),
      capture: { staffToken: 'data.accessToken', refreshToken: 'data.refreshToken' } },
    { m: 'POST', p: '/auth/login', name: 'Login (admin)', auth: 'none',
      d: 'The first admin is seeded with `npm run seed:admin` — the API cannot create one.',
      b: B({ email: 'admin@teamvector.co', password: 'Passw0rd!2026', type: 'internal' }),
      capture: { staffToken: 'data.accessToken', refreshToken: 'data.refreshToken' } },
    { m: 'POST', p: '/auth/signup', name: 'Signup (customer)', auth: 'none',
      d: 'Creates a portal account at the lowest tier. Tier is never self-selected — it decides pricing.',
      b: B({ name: 'Acme Corp', email: 'buyer@acme.teamvector.co', password: 'Passw0rd!2026', type: 'customer' }),
      capture: { otp: 'devOtp', customerEmail: '_req.email' } },
    { m: 'POST', p: '/auth/verify-otp', name: 'Verify OTP (customer)', auth: 'none',
      b: B({ email: '{{customerEmail}}', otp: '{{otp}}', type: 'customer' }),
      capture: { customerToken: 'data.accessToken' } },
    { m: 'POST', p: '/auth/login', name: 'Login (customer)', auth: 'none',
      b: B({ email: '{{customerEmail}}', password: 'Passw0rd!2026', type: 'customer' }),
      capture: { customerToken: 'data.accessToken' } },
    { m: 'GET', p: '/auth/me' },
    { m: 'POST', p: '/auth/refresh', auth: 'none',
      d: 'Rotates the pair. Replaying a used token revokes every session for that subject.',
      b: B({ refreshToken: '{{refreshToken}}' }),
      capture: { staffToken: 'data.accessToken', refreshToken: 'data.refreshToken' } },
    { m: 'POST', p: '/auth/resend-otp', auth: 'none',
      d: 'Rate-limited by a cooldown (default 60s). purpose is signup or password_reset.',
      b: B({ email: '{{staffEmail}}', type: 'internal', purpose: 'signup' }),
      capture: { otp: 'devOtp' } },
    { m: 'POST', p: '/auth/forgot-password', auth: 'none',
      d: 'Always 200, whether or not the address exists.',
      b: B({ email: '{{staffEmail}}', type: 'internal' }), capture: { otp: 'devOtp' } },
    { m: 'POST', p: '/auth/reset-password', auth: 'none',
      d: 'The new password is checked against the old one before the code is spent, so a reused password does not burn the OTP.',
      b: B({ email: '{{staffEmail}}', otp: '{{otp}}', password: 'N3wS3cure!pass', type: 'internal' }) },
    { m: 'POST', p: '/auth/change-password', b: B({ currentPassword: 'S3cure!pass', newPassword: 'N3wS3cure!pass' }) },
    { m: 'POST', p: '/auth/logout', b: B({ refreshToken: '{{refreshToken}}' }) },
  ]],

  ['Directory', [
    { m: 'GET', p: '/users', q: 'pageSize=50', capture: { userId: 'data.0.id' } },
    { m: 'GET', p: '/users/{{userId}}' },
    { m: 'PATCH', p: '/users/{{userId}}',
      d: 'role needs admin; teamId and name accept sales_manager too. Demoting the last active admin is refused with 409 LAST_ADMIN.',
      b: B({ teamId: '{{teamId}}' }) },
    { m: 'GET', p: '/roles', d: 'Drives the admin role picker. "admin" is deliberately absent.' },
    { m: 'GET', p: '/teams', d: 'Read-only, seeded by migration.', capture: { teamId: 'data.0.id' } },
    { m: 'GET', p: '/customers', q: '',
      d: 'With no q this lists the directory. A DF-CMC827 term is matched exactly.',
      capture: { customerId: 'data.0.id' } },
    { m: 'GET', p: '/customers/{{customerId}}' },
    { m: 'PATCH', p: '/customers/{{customerId}}/tier',
      d: 'admin / sales_manager only. The one mutation allowed on a customer record.',
      b: B({ tier: 'gold' }) },
  ]],

  ['Governance config', [
    { m: 'GET', p: '/config/discount', d: 'Tier ceilings, category ceilings and the approval chain in one call.',
      capture: { ruleId: 'data.approvalChain.0.id' } },
    { m: 'PUT', p: '/config/discount/tier-ceilings', b: B({ bronze: 5, silver: 10, gold: 15 }) },
    { m: 'PUT', p: '/config/discount/category-ceilings',
      b: B({ hardware: 15, service: 10, subscription: 12, accessories: 20 }) },
    { m: 'GET', p: '/config/approval-chain', capture: { ruleId: 'data.approvalChain.0.id' } },
    { m: 'POST', p: '/config/approval-chain',
      b: B({ minScore: 5, maxScore: null, approvers: ['sales_manager', 'finance'], singleLineTrip: 12, note: 'Finance must co-sign.' }) },
    { m: 'PUT', p: '/config/approval-chain/{{ruleId}}',
      b: B({ minScore: 0, maxScore: 5, approvers: ['sales_manager'], singleLineTrip: 5, note: 'Mild blended overage.' }) },
    { m: 'PUT', p: '/config/approval-chain/order', b: B({ ids: ['{{ruleId}}'] }) },
    { m: 'DELETE', p: '/config/approval-chain/{{ruleId}}', d: 'Refused when it is the last rule.' },
    { m: 'GET', p: '/customer-tiers/{{tier}}',
      d: 'The ceiling for one tier. GET /config/discount returns all three at once; this is the per-tier form.' },
    { m: 'PATCH', p: '/customer-tiers/{{tier}}',
      d: '0 is legitimate — it means that tier gets no discretionary discount at all.',
      b: B({ maxDiscountPct: 15 }) },
    { m: 'GET', p: '/config/dashboard' },
    { m: 'PUT', p: '/config/dashboard', b: B({ stallThresholdDays: 5, anomalySensitivity: 1.8, approvalSlaHours: 24 }) },
  ]],

  ['Catalog', [
    { m: 'GET', p: '/products', q: 'pageSize=50', capture: { productId: 'data.0.id' } },
    { m: 'GET', p: '/products/{{productId}}' },
    { m: 'POST', p: '/products',
      d: 'Generates the three tier price rows on create so the product is immediately quotable.',
      b: B({ name: 'Laptop Pro 14', sku: 'HW-LP14', category: 'hardware', basePrice: 95000, costPrice: 68000,
             unit: 'unit', taxPct: 18, description: '14-inch business laptop.',
             variants: [{ attribute: 'Memory', value: '32GB', extraPrice: 12000 }] }),
      capture: { productId: 'data.id' } },
    { m: 'PUT', p: '/products/{{productId}}', b: B({ basePrice: 96000 }) },
    { m: 'PATCH', p: '/products/{{productId}}/active', d: 'Archive or restore. There is no DELETE.', b: B({ active: false }) },
    { m: 'POST', p: '/products/{{productId}}/duplicate', d: 'The copy starts archived.' },
    { m: 'GET', p: '/price-lists', q: 'productId={{productId}}',
      d: 'Tier pricing is not a discount — it is the starting price for that customer.' },
    { m: 'PUT', p: '/price-lists', b: B({ productId: '{{productId}}', tier: 'gold', currency: 'INR', price: 86000 }) },
  ]],

  ['Warehouses', [
    { m: 'GET', p: '/warehouses', capture: { warehouseId: 'data.0.id' } },
    { m: 'GET', p: '/warehouses/{{warehouseId}}' },
    { m: 'POST', p: '/warehouses',
      b: B({ name: 'Main Warehouse', location: 'Bhiwandi, Mumbai', shippingCostWeight: 1.0, baseShipCost: 400,
             replenishThreshold: 5, replenishQty: 20, replenishLeadDays: 4 }),
      capture: { warehouseId: 'data.id' } },
    { m: 'PUT', p: '/warehouses/{{warehouseId}}', b: B({ shippingCostWeight: 1.4 }) },
    { m: 'PUT', p: '/warehouses/{{warehouseId}}/stock',
      d: 'Partial map. Returns affectedQuotationIds — the open backorders this could now fill.',
      b: B({ stock: { '{{productId}}': 12 } }) },
    { m: 'POST', p: '/warehouses/{{warehouseId}}/restock', d: 'Tops up everything at or below the threshold.' },
  ]],

  ['Plans & upsell', [
    { m: 'GET', p: '/subscription-plans', capture: { planId: 'data.0.id' } },
    { m: 'GET', p: '/subscription-plans/{{planId}}' },
    { m: 'POST', p: '/subscription-plans',
      d: 'A subscription CATEGORY does not make a line recurring — an attached plan does.',
      b: B({ name: 'Cloud Standard — Monthly', cadence: 'monthly', prorationRule: 'daily_prorate',
             cancellationRule: 'refund_unused', trialDays: 14, billingDayOfCycle: 1, productIds: [] }),
      capture: { planId: 'data.id' } },
    { m: 'PUT', p: '/subscription-plans/{{planId}}', b: B({ trialDays: 30 }) },
    { m: 'GET', p: '/upsell-rules', capture: { upsellRuleId: 'data.0.id' } },
    { m: 'POST', p: '/upsell-rules',
      b: B({ triggerProductId: '{{productId}}', suggestedProductId: '', coPurchaseScore: 92, promoted: true, minMarginPct: 25 }) },
    { m: 'PUT', p: '/upsell-rules/{{upsellRuleId}}', b: B({ promoted: false }) },
    { m: 'DELETE', p: '/upsell-rules/{{upsellRuleId}}' },
    { m: 'POST', p: '/upsell-rules/suggest',
      d: 'Ranked coPurchaseScore + (promoted ? 25 : 0) + marginPct * 0.3. Anything below the rule’s margin floor is dropped, not ranked low.',
      b: B({ productIds: ['{{productId}}'], tier: 'gold', currency: 'INR', excludeProductIds: [], limit: 5 }) },
  ]],

  ['Risk scoring', [
    { m: 'POST', p: '/risk/score',
      d: 'The worked example from the problem statement: returns score 0.21, worstSingleOverage 8, approvers [sales_manager].',
      b: B({ quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [
        { id: 'l-1', productName: 'Laptop Pro 14', category: 'hardware', qty: 8, unitPrice: 87400, discountPct: 12 },
        { id: 'l-2', productName: 'Onboarding Setup Service', category: 'service', qty: 1, unitPrice: 18400, discountPct: 18 }] }) },
    { m: 'POST', p: '/risk/score-batch',
      b: B({ quotations: [{ quotationId: null, tier: 'gold', orderDiscountPct: 0, lines: [
        { id: 'l-1', productName: 'Laptop', category: 'hardware', qty: 8, unitPrice: 87400, discountPct: 12 }] }] }) },
    { m: 'GET', p: '/risk/config' },
  ]],

  ['Quotations', [
    { m: 'GET', p: '/quotations', q: 'pageSize=25', capture: { quotationId: 'data.0.id' } },
    { m: 'GET', p: '/quotations/{{quotationId}}', capture: { lineId: 'data.lines.0.id' } },
    { m: 'POST', p: '/quotations',
      d: 'The customer must already exist. Tier and currency are snapshotted from them.',
      b: B({ customerId: '{{customerId}}' }), capture: { quotationId: 'data.id' } },
    { m: 'PATCH', p: '/quotations/{{quotationId}}',
      b: B({ orderDiscountPct: 5, promisedDeliveryDate: '2026-03-28', validUntil: '2026-04-04',
             customerTerms: 'Prices valid until the date shown. Payment due 15 days from invoice.' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/lines',
      d: 'No unitPrice — the server resolves it from the customer’s tier price list.',
      b: B({ productId: '{{productId}}', qty: 8, planId: null }), capture: { lineId: 'data.lines.0.id' } },
    { m: 'PATCH', p: '/quotations/{{quotationId}}/lines/{{lineId}}',
      d: 'A negotiated unitPrice IS accepted here, bounded and audited. Cost and category stay server-owned.',
      b: B({ qty: 8, discountPct: 12 }) },
    { m: 'DELETE', p: '/quotations/{{quotationId}}/lines/{{lineId}}' },
    { m: 'POST', p: '/quotations/{{quotationId}}/lines/{{lineId}}/comments',
      b: B({ message: 'Yes — all six are height adjustable.' }) },
    { m: 'PATCH', p: '/quotations/{{quotationId}}/owner', b: B({ ownerId: '{{userId}}' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/share',
      d: 'No share link and no token — access is by authenticated account only.' },
    { m: 'POST', p: '/quotations/{{quotationId}}/stage', b: B({ toStage: 'sent' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/lost', b: B({ reason: 'Lost on price to an incumbent reseller.' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/apply-counter', d: 'Applies the counter to every line, then re-scores.' },
    { m: 'POST', p: '/quotations/{{quotationId}}/dismiss-suggestion', b: B({ productId: '{{productId}}' }) },
    { m: 'GET', p: '/quotations/{{quotationId}}/pdf', d: 'Hosted Cloudinary URL, or the PDF streamed back.' },
  ]],

  ['Approvals', [
    { m: 'POST', p: '/quotations/{{quotationId}}/submit-approval',
      d: 'The server decides the route. The rep never chooses it and never gets to skip it.' },
    { m: 'POST', p: '/quotations/{{quotationId}}/approve',
      d: 'Only the first pending step is actionable, so finance cannot act before the manager.',
      b: B({ comment: 'Strategic account, margin still acceptable.' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/reject',
      b: B({ reason: 'Bronze tier caps at 5% and the service ceiling is 10%. Resubmit at 5%.' }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/return',
      d: 'Back to draft, chain cleared entirely — a resubmission re-scores from scratch.',
      b: B({ reason: 'Please bring the service line back to 10% and resubmit.' }) },
    { m: 'GET', p: '/approvals/queue' },
  ]],

  ['Fulfillment', [
    { m: 'GET', p: '/quotations/{{quotationId}}/fulfillment',
      d: 'Recomputed from live stock unless a plan has been accepted or overridden.' },
    { m: 'POST', p: '/quotations/{{quotationId}}/fulfillment/accept' },
    { m: 'POST', p: '/quotations/{{quotationId}}/fulfillment/override',
      d: 'Returns per-cell errors on 422 so the UI can highlight the exact input.',
      b: B({ allocations: [{ lineId: '{{lineId}}', warehouseId: '{{warehouseId}}', qty: 8 }] }) },
    { m: 'POST', p: '/quotations/{{quotationId}}/fulfillment/consolidate' },
    { m: 'POST', p: '/quotations/{{quotationId}}/fulfillment/backorder-policy', b: B({ policy: 'ship_available' }) },
  ]],

  ['Billing', [
    { m: 'GET', p: '/quotations/{{quotationId}}/billing', capture: { invoiceId: 'data.invoiceId' } },
    { m: 'POST', p: '/quotations/{{quotationId}}/billing/build',
      d: 'Idempotent — calling it twice rebuilds schedules and returns the existing invoice.',
      capture: { invoiceId: 'data.invoiceId' } },
    { m: 'POST', p: '/quotations/{{quotationId}}/lines/{{lineId}}/proration-preview',
      d: 'No mutation. The explanation is rendered verbatim to the customer.',
      b: B({ newQty: 12 }) },
    { m: 'PATCH', p: '/quotations/{{quotationId}}/lines/{{lineId}}/subscription',
      d: 'A negative proration issues a credit note automatically.', b: B({ qty: 12 }) },
    { m: 'GET', p: '/quotations/{{quotationId}}/lines/{{lineId}}/cancellation-preview' },
    { m: 'DELETE', p: '/quotations/{{quotationId}}/lines/{{lineId}}/subscription' },
    { m: 'GET', p: '/quotations/{{quotationId}}/credit-notes' },
    { m: 'POST', p: '/quotations/{{quotationId}}/credit-notes',
      b: B({ lineId: '{{lineId}}', amount: 4370, type: 'credit_note', reason: 'Goodwill credit.' }) },
  ]],

  ['Invoices & payments', [
    { m: 'GET', p: '/invoices', q: 'pageSize=25', capture: { invoiceId: 'data.0.id' } },
    { m: 'GET', p: '/invoices/{{invoiceId}}',
      d: 'amountPaid and balanceRemaining are derived from the payment rows, never stored.' },
    { m: 'POST', p: '/invoices/{{invoiceId}}/send', d: 'finance / admin only. Moves the quotation to billed.' },
    { m: 'POST', p: '/invoices/{{invoiceId}}/payments',
      d: 'finance / admin only — the person who sold the deal must not confirm the cash. Send an Idempotency-Key so a double-click cannot record twice.',
      idem: true,
      b: B({ amount: 100000, method: 'bank_transfer', reference: 'NEFT-88213011' }) },
    { m: 'GET', p: '/invoices/{{invoiceId}}/pdf' },
  ]],

  ['Customer portal', [
    { m: 'GET', p: '/customer/quotations', auth: 'customer',
      d: 'Shared quotations only — a draft is never visible.', capture: { quotationId: 'data.0.id' } },
    { m: 'GET', p: '/customer/quotations/{{quotationId}}', auth: 'customer', capture: { lineId: 'data.lines.0.id' } },
    { m: 'POST', p: '/customer/quotations/{{quotationId}}/lines/{{lineId}}/comments', auth: 'customer',
      d: 'Permitted whenever canMessage — which stays true during internal approval.',
      b: B({ message: 'Are the stands height adjustable?' }) },
    { m: 'POST', p: '/customer/quotations/{{quotationId}}/request', auth: 'customer',
      b: B({ counterDiscountPct: 25, justification: 'Three vendors quoted, we need 25% to proceed.' }) },
    { m: 'POST', p: '/customer/quotations/{{quotationId}}/confirm', auth: 'customer',
      d: 'The automatic re-approval branch. Re-scores the final terms; if approvers are needed the quotation re-enters the chain with no rep action. The score is never returned.' },
    { m: 'GET', p: '/customer/quotations/{{quotationId}}/pdf', auth: 'customer' },
    { m: 'GET', p: '/customer/invoices/{{invoiceId}}/pdf', auth: 'customer' },
  ]],

  ['Dashboard & reports', [
    { m: 'GET', p: '/dashboard/deal-health' },
    { m: 'GET', p: '/dashboard/alerts', q: '',
      d: 'Computed on read. The anomaly rule compares each rep against their own 90-day average.',
      capture: { alertId: 'data.0.id' } },
    { m: 'POST', p: '/dashboard/alerts/{{alertId}}/nudge' },
    { m: 'POST', p: '/dashboard/alerts/{{alertId}}/escalate' },
    { m: 'GET', p: '/reports/summary', q: '',
      d: 'KPIs, per-rep AND per-team rollups, discount buckets, funnel, and the one-time / recurring revenue mix.' },
    { m: 'GET', p: '/reports/products', q: '' },
    { m: 'GET', p: '/audit-log', q: 'pageSize=25', d: 'Append-only. There is no update or delete endpoint, ever.' },
    { m: 'GET', p: '/notifications', q: '', capture: { notificationId: 'data.0.id' } },
    { m: 'PATCH', p: '/notifications/{{notificationId}}/read' },
    { m: 'PATCH', p: '/notifications/read-all' },
  ]],
];

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
let current = null;

function renderNav() {
  const nav = $('nav');
  nav.innerHTML = '';

  for (const [group, entries] of ENDPOINTS) {
    const heading = document.createElement('div');
    heading.className = 'group';
    heading.textContent = group;
    nav.append(heading);

    for (const entry of entries) {
      const button = document.createElement('button');
      button.innerHTML =
        `<span class="m ${entry.m}">${entry.m}</span>` +
        (entry.name ?? entry.p.replace(/\{\{\w+\}\}/g, ':id'));
      button.onclick = () => select(entry, button);
      nav.append(button);
    }
  }
}

function select(entry, button) {
  current = entry;
  document.querySelectorAll('nav button').forEach((b) => b.classList.remove('active'));
  button.classList.add('active');

  $('title').textContent = entry.name ?? `${entry.m} ${entry.p}`;
  $('path').textContent = `${entry.m} ${entry.p}`;
  $('desc').textContent = entry.d ?? '';
  $('editor').hidden = false;
  $('auth').value = entry.auth ?? 'staff';

  // Path variables get their own inputs so a uuid can be pasted without editing the URL.
  const names = [...entry.p.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const wrap = $('pathVars');
  wrap.innerHTML = '';
  $('pathVarsWrap').hidden = names.length === 0;

  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '6px';
    row.innerHTML = `<span style="color:var(--muted);font-family:var(--mono);font-size:11px;min-width:110px">${name}</span>`;
    const input = document.createElement('input');
    input.className = 'field';
    input.value = vars[name] ?? '';
    input.oninput = () => {
      vars[name] = input.value;
      save();
    };
    row.append(input);
    wrap.append(row);
  }

  $('queryWrap').hidden = entry.q === undefined;
  $('query').value = entry.q ?? '';

  $('bodyWrap').hidden = entry.b === undefined;
  $('body').value = entry.b ?? '';
}

async function send() {
  if (!current) return;

  const base = $('base').value.replace(/\/$/, '');
  const query = $('query').value.trim();
  const url = base + interpolate(current.p) + (query ? `?${interpolate(query)}` : '');

  const headers = {};
  const authMode = $('auth').value;
  const token = authMode === 'customer' ? vars.customerToken : vars.staffToken;
  if (authMode !== 'none' && token) headers.Authorization = `Bearer ${token}`;

  let sentBody;
  const options = { method: current.m, headers };

  if (current.b !== undefined) {
    const raw = interpolate($('body').value);
    try {
      sentBody = JSON.parse(raw);
    } catch (error) {
      $('status').textContent = 'Body is not valid JSON';
      $('status').className = 'status s5';
      $('out').textContent = String(error);
      return;
    }
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(sentBody);
  }

  if (current.idem) headers['Idempotency-Key'] = crypto.randomUUID();

  $('status').textContent = 'sending…';
  $('status').className = 'status';

  const started = performance.now();
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    $('status').textContent = 'Network error';
    $('status').className = 'status s5';
    $('out').textContent = String(error);
    return;
  }
  const ms = Math.round(performance.now() - started);

  $('status').textContent = `${response.status} ${response.statusText} · ${ms} ms`;
  $('status').className = `status s${String(response.status)[0]}`;

  const type = response.headers.get('content-type') ?? '';

  // A PDF comes back as bytes when Cloudinary is not configured — show it as a link
  // rather than dumping binary into the pane.
  if (type.includes('application/pdf')) {
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    $('out').innerHTML =
      `PDF received (${blob.size.toLocaleString()} bytes).\n\n` +
      `<a href="${href}" target="_blank" style="color:var(--accent)">Open in a new tab</a>`;
    return;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    $('out').textContent = await response.text();
    return;
  }

  $('out').textContent = JSON.stringify(body, null, 2);

  if (response.ok && current.capture) {
    for (const [name, path] of Object.entries(current.capture)) {
      // `_req.x` reads from the request that was just sent — used to remember the
      // email a signup used, which the response does not echo back.
      const value = path.startsWith('_req.')
        ? dig(sentBody, path.slice(5))
        : dig(body, path);
      if (value !== undefined && value !== null) vars[name] = String(value);
    }
    save();
  }
}

function renderVars() {
  const view = $('varsView');
  view.innerHTML = '';
  const names = Object.keys(vars).sort();

  if (names.length === 0) {
    view.innerHTML = '<b>—</b><span>nothing captured yet</span>';
    return;
  }

  for (const name of names) {
    const value = vars[name] ?? '';
    const shown = name.toLowerCase().includes('token') ? `${value.slice(0, 18)}…` : value;
    view.insertAdjacentHTML('beforeend', `<b>${name}</b><span>${escapeHtml(shown)}</span>`);
  }
}

function renderChips() {
  $('staffChip').textContent = vars.staffToken ? 'staff: signed in' : 'staff: —';
  $('staffChip').className = `chip${vars.staffToken ? ' on' : ''}`;
  $('custChip').textContent = vars.customerToken ? 'customer: signed in' : 'customer: —';
  $('custChip').className = `chip${vars.customerToken ? ' on' : ''}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function checkHealth() {
  const chip = $('health');
  try {
    const response = await fetch(`${$('base').value.replace(/\/$/, '')}/health`);
    const ok = response.ok;
    chip.textContent = ok ? 'api: up' : `api: ${response.status}`;
    chip.className = `chip${ok ? ' on' : ''}`;
  } catch {
    chip.textContent = 'api: unreachable';
    chip.className = 'chip';
  }
}

$('send').onclick = send;
$('reset').onclick = () => {
  vars = {};
  save();
};
$('base').onchange = checkHealth;

renderNav();
renderVars();
renderChips();
checkHealth();
