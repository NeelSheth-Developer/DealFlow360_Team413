import { differenceInDays } from 'date-fns';
import { productMarginPct, quoteTotals, tierPrice } from '@/lib/pricing';
import { rankSuggestions } from '@/lib/upsellEngine';
import { FUNNEL_ORDER, OPEN_STAGES, PIPELINE_COLUMNS } from '@/lib/stageMachine';
import { stockSignal } from '@/lib/warehouseSplit';
import { PENDING_RISK } from '@/services/riskService';
import { round2, sum } from '@/lib/utils';

/**
 * Derived read models. Nothing here mutates state — these turn the raw store
 * into exactly what each screen needs, so components stay thin and the same
 * numbers appear everywhere.
 *
 * Risk scores are read from `state.riskCache`, which the risk slice populates
 * from the backend. Selectors never compute a score.
 */

// ---------------------------------------------------------------- quotations

/**
 * Reconcile the server's totals with the extra figures the UI needs.
 *
 * The server is authoritative on money — `quotation.totals` (API-REFERENCE §11.0) is
 * computed from the lines on read, and it is the number the approval screen, the invoice
 * and the audit trail all quote. So it must win.
 *
 * But the server returns a smaller set than the screens read. `savings` and `margin`
 * only exist server-side, while `lineDiscountAmount`, `orderDiscountAmount`,
 * `netBeforeTax` and the one-time/recurring counts only exist in the local rollup and
 * are presentation breakdowns rather than independent facts. Taking one shape alone
 * left half the UI reading `undefined`, which is how a total renders as ₹0.
 *
 * So: local fills the gaps, server overrides anything it speaks about, and the last
 * block bridges the two naming conventions (`margin` vs `marginAmount`, `cost` vs
 * `totalCost`) so a component written against either one resolves.
 */
export function resolveTotals(quote) {
  const local = quoteTotals(quote);
  const server = quote?.totals;
  if (!server) return local;

  return {
    ...local,
    ...server,
    savings: server.savings ?? local.lineDiscountAmount,
    margin: server.margin ?? local.marginAmount,
    marginAmount: server.margin ?? local.marginAmount,
    totalCost: server.cost ?? local.totalCost,
  };
}

export function selectQuoteWithTotals(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return null;
  return { ...quote, totals: resolveTotals(quote) };
}

/** Server-scored risk for a quotation, or a pending placeholder. */
export function selectQuoteRisk(state, quoteId) {
  return (state.riskCache[quoteId] ?? PENDING_RISK).risk;
}

export function selectApprovalPath(state, quoteId) {
  return (state.riskCache[quoteId] ?? PENDING_RISK).approvalPath;
}

export function selectRiskEntry(state, quoteId) {
  return state.riskCache[quoteId] ?? PENDING_RISK;
}

/** Ceiling that applies to a specific line — shown as the inline hint. */
export function selectLineCeiling(state, quote, category) {
  const categoryCeiling = state.categoryCeilings[category] ?? 100;
  const tierCeiling = state.tierCeilings[quote.tier] ?? 100;
  return {
    ceiling: Math.min(categoryCeiling, tierCeiling),
    categoryCeiling,
    tierCeiling,
    binding: categoryCeiling <= tierCeiling ? 'category' : 'tier',
  };
}

export function selectSuggestions(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return [];
  return rankSuggestions({
    cartLines: quote.lines,
    products: state.products,
    upsellRules: state.upsellRules,
    priceLists: state.priceLists,
    tier: quote.tier,
    currency: quote.currency,
    dismissed: quote.dismissedSuggestions,
  });
}

export function selectDismissedSuggestions(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return [];
  return quote.dismissedSuggestions
    .map((productId) => state.products.find((p) => p.id === productId))
    .filter(Boolean)
    .map((p) => ({ productId: p.id, productName: p.name, category: p.category }));
}

/** Catalog entries priced for a given quotation, with live stock signals. */
export function selectCatalogForQuote(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return [];

  return state.products
    .filter((p) => p.active)
    .map((product) => {
      const price = tierPrice(product, quote.tier, state.priceLists, quote.currency);
      const inCart = quote.lines.find((l) => l.productId === product.id);
      return {
        ...product,
        price,
        marginPct: price > 0 ? round2(((price - product.costPrice) / price) * 100) : 0,
        listMarginPct: productMarginPct(product),
        stock: stockSignal(product.id, inCart?.qty || 1, state.warehouses),
        inCartQty: inCart?.qty ?? 0,
        plans: state.subscriptionPlans.filter((pl) => pl.active && pl.productIds.includes(product.id)),
      };
    });
}

export function selectCustomerRequests(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return { threads: [], unansweredCount: 0, counter: null };

  const threads = quote.lines
    .filter((l) => (l.comments ?? []).length > 0)
    .map((l) => ({
      lineId: l.id,
      productName: l.productName,
      comments: l.comments,
      lastFromCustomer: l.comments[l.comments.length - 1]?.role === 'customer',
    }));

  return {
    threads,
    unansweredCount: threads.filter((t) => t.lastFromCustomer).length,
    counter:
      quote.counterDiscountPct == null
        ? null
        : { pct: quote.counterDiscountPct, justification: quote.counterJustification },
  };
}

// --------------------------------------------------------------- fulfillment

export function selectFulfillmentPlan(state, quoteId) {
  return state.fulfillmentPlans[quoteId] ?? null;
}

export function selectWarehouseStockRows(state, warehouseId) {
  const warehouse = state.warehouses.find((w) => w.id === warehouseId);
  if (!warehouse) return [];
  return state.products
    .filter((p) => p.category !== 'subscription' && p.category !== 'service')
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      qty: warehouse.stock[product.id] ?? 0,
      isLow: (warehouse.stock[product.id] ?? 0) <= warehouse.replenishThreshold,
    }));
}

export function selectWarehouseSummary(state) {
  return state.warehouses.map((w) => {
    const entries = Object.entries(w.stock);
    return {
      ...w,
      skuCount: entries.length,
      totalUnits: sum(entries.filter(([, q]) => q < 900), ([, q]) => q),
      lowCount: entries.filter(([, q]) => q <= w.replenishThreshold).length,
    };
  });
}

// ------------------------------------------------------------------ billing

/**
 * The billing view as the server built it — GET /quotations/:id/billing (§14.1).
 *
 * This used to reassemble the whole thing locally: splitting lines on `isSubscription`,
 * applying the order-discount factor, recomputing each per-cycle amount and summing an
 * annual contract value. All of that is in the response now, so recomputing it here
 * could only produce a second answer that disagrees.
 *
 * Returns null until `loadBilling(quoteId)` or `buildBilling(quoteId)` has run.
 */
export function selectBillingView(state, quoteId) {
  return state.billingViews[quoteId] ?? null;
}

/**
 * `amountPaid`, `balanceRemaining` and `status` are DERIVED SERVER-SIDE from the payment
 * rows on every read (§15.2) and never stored. The old local `invoiceBalances()` pass is
 * gone: a balance the client recomputes can drift from the ledger it is supposed to
 * describe, and the server is the only thing that sees every payment row.
 */
export function selectInvoiceWithBalances(state, invoiceId) {
  return state.invoices.find((i) => i.id === invoiceId) ?? null;
}

export function selectInvoiceForQuote(state, quoteId) {
  return state.invoices.find((i) => i.quotationId === quoteId) ?? null;
}

// ----------------------------------------------------------------- pipeline

export function selectPipelineColumns(state, { ownerId = null, tier = null, search = '' } = {}) {
  const term = search.trim().toLowerCase();

  const filtered = state.quotations.filter((q) => {
    if (ownerId && q.ownerId !== ownerId) return false;
    if (tier && q.tier !== tier) return false;
    if (term && !`${q.reference ?? ''} ${q.id} ${q.customerName} ${q.ownerName}`.toLowerCase().includes(term))
        return false;
    return true;
  });

  return PIPELINE_COLUMNS.map((stage) => {
    const cards = filtered
      .filter((q) => q.stage === stage)
      .map((q) => decorateQuote(state, q))
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
    return {
      stage,
      cards,
      count: cards.length,
      value: round2(sum(cards, (c) => c.totals.grandTotal)),
    };
  });
}

/** Shared card/row decoration so list and Kanban always agree. */
export function decorateQuote(state, quote) {
  const totals = resolveTotals(quote);
  const riskEntry = state.riskCache[quote.id] ?? PENDING_RISK;
  const idleDays = differenceInDays(new Date(), new Date(quote.lastActivityAt));
  return {
    ...quote,
    totals,
    risk: riskEntry.risk,
    approvalPath: riskEntry.approvalPath,
    riskStatus: riskEntry.status ?? riskEntry.source,
    // `id` is a uuid; `reference` ("Q-1042") is what a human quotes. Guaranteed
    // present so rows never print a uuid where a quote number belongs.
    reference: quote.reference ?? quote.id,
    idleDays,
    isStale: OPEN_STAGES.includes(quote.stage) && idleDays > state.dashboardConfig.stallThresholdDays,
  };
}

export function selectQuotationRows(state, filters = {}) {
  const { ownerId = null, stage = null, tier = null, search = '' } = filters;
  const term = search.trim().toLowerCase();

  return state.quotations
    .filter((q) => {
      if (ownerId && q.ownerId !== ownerId) return false;
      if (stage && q.stage !== stage) return false;
      if (tier && q.tier !== tier) return false;
      if (term && !`${q.reference ?? ''} ${q.id} ${q.customerName} ${q.ownerName}`.toLowerCase().includes(term))
        return false;
      return true;
    })
    .map((q) => decorateQuote(state, q))
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
}

// ---------------------------------------------------------------- dashboard

/**
 * Shown while GET /dashboard/deal-health is in flight.
 *
 * Zeroes rather than nulls so the KPI tiles render their own layout instead of
 * collapsing, and `thresholds` is present so the hint text has something to read. The
 * tiles carry their own loading treatment; these are placeholders, not claims.
 */
const EMPTY_DEAL_HEALTH = {
  activeCount: 0,
  activeValue: 0,
  stalledCount: 0,
  anomalyCount: 0,
  slippageCount: 0,
  bottleneckCount: 0,
  pendingApprovalCount: 0,
  oldestPendingHours: 0,
  winRate: 0,
  avgCycleDays: 0,
  avgDiscountPct: 0,
  highSeverityCount: 0,
  thresholds: { stallThresholdDays: 5, anomalySensitivity: 1.8, approvalSlaHours: 24 },
};

/**
 * GET /dashboard/deal-health, verbatim.
 *
 * This used to be computed here from `state.quotations`. It cannot be: win rate and
 * average cycle need every closed deal, and the store only holds the page of quotations
 * the current screen asked for — so a local figure would silently mean "win rate across
 * the 100 rows I happen to have loaded".
 */
export function selectDealHealth(state) {
  return state.dealHealth ?? EMPTY_DEAL_HEALTH;
}

/**
 * The alert feed. The server already applied `type` and `severity` when the feed was
 * fetched; the same filter is re-applied here so a stale list from the previous filter
 * cannot flash on screen during the request.
 */
export function selectAlerts(state, { type = null, severity = null } = {}) {
  return state.alerts.filter((a) => {
    if (type && a.type !== type) return false;
    if (severity && a.severity !== severity) return false;
    return true;
  });
}

/**
 * Days-since-last-activity buckets for the dashboard chart.
 *
 * Grouping the loaded quotations by a date field is presentation, not governance — no
 * threshold, ceiling or score is involved — so it stays on this side. It describes the
 * rows currently loaded, which is what the chart's caption says.
 */
export function selectAgingBuckets(state) {
  const now = new Date();
  const buckets = [
    { name: '0–3 days', min: 0, max: 3, count: 0 },
    { name: '4–7 days', min: 4, max: 7, count: 0 },
    { name: '8–14 days', min: 8, max: 14, count: 0 },
    { name: '15+ days', min: 15, max: Infinity, count: 0 },
  ];

  for (const q of state.quotations) {
    if (!OPEN_STAGES.includes(q.stage)) continue;
    const idle = differenceInDays(now, new Date(q.lastActivityAt));
    const bucket = buckets.find((b) => idle >= b.min && idle <= b.max);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

export function selectStageFunnel(state) {
  return FUNNEL_ORDER.map((stage) => ({
    stage,
    count: state.quotations.filter((q) => q.stage === stage).length,
  }));
}

// ------------------------------------------------------------------ reports
//
// `selectFilteredQuotations` and `selectReportData` USED TO LIVE HERE and have been
// deleted. They aggregated `state.quotations` into the reporting screen's KPIs, charts
// and product table.
//
// They cannot work against the API. The store holds one page of quotations, so
// "total value" would quietly mean "total across the rows this browser happens to have
// loaded", and win rate would be measured against a sample instead of the business.
// Margin is worse still: `costPrice` is not on any line the client can read, so an
// average margin computed here would have been an invention.
//
// The reporting screen now calls GET /reports/summary and GET /reports/products, which
// aggregate across every matching row and add the `valueByTeam` rollup the brief asks
// for. See src/services/reportsService.js.

// ------------------------------------------------------------ notifications

/**
 * GET /notifications is scoped to the caller's own user id in the WHERE clause, so
 * `state.notifications` is already mine and nothing is filtered here.
 *
 * `unread` comes from `meta.unreadCount` rather than from counting the rows: the fetch
 * takes a `limit`, so counting locally would under-report the badge the moment there
 * were more unread rows than the panel shows.
 */
export function selectMyNotifications(state) {
  return { items: state.notifications, unread: state.notificationUnreadCount || 0 };
}

/** Approvals the current user is actually able to action right now. */
export function selectMyApprovalQueue(state) {
  const me = state.currentUser;
  if (!me) return [];
  return state.quotations
    .filter((q) => q.stage === 'pending_approval')
    .filter((q) => {
      const pending = q.approvalSteps.find((s) => s.status === 'pending');
      return pending && (pending.role === me.role || me.role === 'admin');
    })
    .map((q) => decorateQuote(state, q));
}

/**
 * The immutable trail for one entity, from GET /audit-log?entityId=.
 *
 * Reads the per-entity cache rather than filtering `state.auditLog`: that array holds
 * whichever page the platform-wide audit screen last requested, so filtering it would
 * show an empty trail on any quotation that happens to be off that page.
 */
export function selectAuditForEntity(state, entityId) {
  return state.auditByEntity[entityId] ?? [];
}
