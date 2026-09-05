import { differenceInDays, isAfter, isBefore, parseISO } from 'date-fns';
import { lineTotal, productMarginPct, quoteTotals, tierPrice } from '@/lib/pricing';
import { computeBlendedRisk, resolveApprovalPath, riskBand } from '@/lib/riskEngine';
import { rankSuggestions } from '@/lib/upsellEngine';
import { invoiceBalances } from '@/lib/billingEngine';
import { annualValue } from '@/lib/billingEngine';
import { FUNNEL_ORDER, OPEN_STAGES, PIPELINE_COLUMNS } from '@/lib/stageMachine';
import { stockSignal } from '@/lib/warehouseSplit';
import { mean, round2, sum } from '@/lib/utils';

/**
 * Derived read models. Nothing here mutates state — these turn the raw store
 * into exactly what each screen needs, so components stay thin and the same
 * numbers appear everywhere.
 */

// ---------------------------------------------------------------- quotations

export function selectQuoteWithTotals(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return null;
  return { ...quote, totals: quoteTotals(quote) };
}

export function selectQuoteRisk(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return null;
  const risk = computeBlendedRisk(
    quote.lines,
    state.categoryCeilings,
    state.tierCeilings[quote.tier] ?? 0,
    quote.orderDiscountPct,
  );
  return { ...risk, band: riskBand(risk.score) };
}

export function selectApprovalPath(state, quoteId) {
  const risk = selectQuoteRisk(state, quoteId);
  if (!risk) return { approvers: [], label: 'Auto-approve', ruleId: null };
  return resolveApprovalPath(risk, state.approvalChain);
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

export function selectBillingView(state, quoteId) {
  const quote = state.quotations.find((q) => q.id === quoteId);
  if (!quote) return null;

  const orderFactor = 1 - (Number(quote.orderDiscountPct) || 0) / 100;
  const oneTime = quote.lines.filter((l) => !l.isSubscription);
  const recurring = quote.lines.filter((l) => l.isSubscription);
  const schedules = state.billingSchedules[quoteId] ?? {};

  const recurringRows = recurring.map((line) => {
    const plan = state.subscriptionPlans.find((p) => p.id === line.planId) ?? null;
    const occurrences = schedules[line.id] ?? [];
    const next = occurrences.find((o) => o.status === 'scheduled') ?? null;
    return {
      line,
      plan,
      perCycle: round2(lineTotal(line) * orderFactor),
      annual: plan ? annualValue(line, plan) : 0,
      occurrences,
      nextBillingDate: next?.date ?? null,
      cancelled: line.subscriptionStatus === 'cancelled',
    };
  });

  return {
    quote,
    currency: quote.currency,
    oneTimeRows: oneTime.map((line) => ({ line, total: round2(lineTotal(line) * orderFactor) })),
    oneTimeTotal: round2(sum(oneTime, (l) => lineTotal(l) * orderFactor)),
    recurringRows,
    recurringPerCycleTotal: round2(sum(recurringRows.filter((r) => !r.cancelled), (r) => r.perCycle)),
    annualRecurringTotal: round2(sum(recurringRows.filter((r) => !r.cancelled), (r) => r.annual)),
    invoice: state.invoices.find((i) => i.quotationId === quoteId) ?? null,
    creditNotes: state.creditNotes.filter((n) => n.quotationId === quoteId),
  };
}

export function selectInvoiceWithBalances(state, invoiceId) {
  const invoice = state.invoices.find((i) => i.id === invoiceId);
  if (!invoice) return null;
  return { ...invoice, ...invoiceBalances(invoice) };
}

export function selectInvoiceForQuote(state, quoteId) {
  const invoice = state.invoices.find((i) => i.quotationId === quoteId);
  if (!invoice) return null;
  return { ...invoice, ...invoiceBalances(invoice) };
}

// ----------------------------------------------------------------- pipeline

export function selectPipelineColumns(state, { ownerId = null, tier = null, search = '' } = {}) {
  const term = search.trim().toLowerCase();

  const filtered = state.quotations.filter((q) => {
    if (ownerId && q.ownerId !== ownerId) return false;
    if (tier && q.tier !== tier) return false;
    if (term && !`${q.id} ${q.customerName} ${q.ownerName}`.toLowerCase().includes(term)) return false;
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
  const totals = quoteTotals(quote);
  const risk = computeBlendedRisk(
    quote.lines,
    state.categoryCeilings,
    state.tierCeilings[quote.tier] ?? 0,
    quote.orderDiscountPct,
  );
  const idleDays = differenceInDays(new Date(), new Date(quote.lastActivityAt));
  return {
    ...quote,
    totals,
    risk: { ...risk, band: riskBand(risk.score) },
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
      if (term && !`${q.id} ${q.customerName} ${q.ownerName}`.toLowerCase().includes(term)) return false;
      return true;
    })
    .map((q) => decorateQuote(state, q))
    .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
}

// ---------------------------------------------------------------- dashboard

export function selectDealHealth(state) {
  const open = state.quotations.filter((q) => OPEN_STAGES.includes(q.stage));
  const alerts = state.alerts;
  const pendingApproval = state.quotations.filter((q) => q.stage === 'pending_approval');

  const oldestPendingHours = pendingApproval.length
    ? Math.max(
        ...pendingApproval.map((q) =>
          Math.round((Date.now() - new Date(q.lastActivityAt).getTime()) / 3600000),
        ),
      )
    : 0;

  const closed = state.quotations.filter((q) => ['confirmed', 'lost'].includes(q.stage));
  const won = closed.filter((q) => q.stage === 'confirmed');

  return {
    activeCount: open.length,
    activeValue: round2(sum(open, (q) => quoteTotals(q).grandTotal)),
    stalledCount: alerts.filter((a) => a.type === 'stalled').length,
    anomalyCount: alerts.filter((a) => a.type === 'discount_anomaly').length,
    slippageCount: alerts.filter((a) => a.type === 'delivery_slippage').length,
    bottleneckCount: alerts.filter((a) => a.type === 'approval_bottleneck').length,
    pendingApprovalCount: pendingApproval.length,
    oldestPendingHours,
    winRate: closed.length ? round2((won.length / closed.length) * 100) : 0,
    avgCycleDays: won.length
      ? round2(mean(won, (q) => differenceInDays(new Date(q.lastActivityAt), new Date(q.createdAt))))
      : 0,
    highSeverityCount: alerts.filter((a) => a.severity === 'high').length,
  };
}

export function selectAlerts(state, { type = null, severity = null } = {}) {
  return state.alerts.filter((a) => {
    if (type && a.type !== type) return false;
    if (severity && a.severity !== severity) return false;
    return true;
  });
}

export function selectStageFunnel(state) {
  return FUNNEL_ORDER.map((stage) => ({
    stage,
    count: state.quotations.filter((q) => q.stage === stage).length,
  }));
}

// ------------------------------------------------------------------ reports

/** Applies the reporting filter bar to the quotation set. */
export function selectFilteredQuotations(state, filters = {}) {
  const { from = null, to = null, repIds = [], stages = [], category = null } = filters;

  return state.quotations.filter((q) => {
    const created = parseISO(q.createdAt);
    if (from && isBefore(created, parseISO(from))) return false;
    if (to && isAfter(created, parseISO(`${to.slice(0, 10)}T23:59:59`))) return false;
    if (repIds.length && !repIds.includes(q.ownerId)) return false;
    if (stages.length && !stages.includes(q.stage)) return false;
    if (category && !q.lines.some((l) => l.category === category)) return false;
    return true;
  });
}

export function selectReportData(state, filters = {}) {
  const rows = selectFilteredQuotations(state, filters).map((q) => decorateQuote(state, q));

  const closed = rows.filter((q) => ['confirmed', 'lost'].includes(q.stage));
  const won = closed.filter((q) => q.stage === 'confirmed');

  // --- value by rep
  const byRep = {};
  for (const q of rows) {
    if (!byRep[q.ownerId]) byRep[q.ownerId] = { name: q.ownerName, value: 0, count: 0 };
    byRep[q.ownerId].value += q.totals.grandTotal;
    byRep[q.ownerId].count += 1;
  }

  // --- discount distribution
  const buckets = [
    { name: '0–5%', min: 0, max: 5, count: 0 },
    { name: '5–10%', min: 5, max: 10, count: 0 },
    { name: '10–15%', min: 10, max: 15, count: 0 },
    { name: '15–20%', min: 15, max: 20, count: 0 },
    { name: '20%+', min: 20, max: Infinity, count: 0 },
  ];
  for (const q of rows) {
    const pct = q.totals.effectiveDiscountPct;
    const bucket = buckets.find((b) => pct >= b.min && pct < b.max);
    if (bucket) bucket.count += 1;
  }

  // --- revenue mix over time (one-time vs recurring)
  const byMonth = {};
  for (const q of rows) {
    const key = q.createdAt.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = { month: key, oneTime: 0, recurring: 0 };
    byMonth[key].oneTime += q.totals.oneTimeTotal;
    byMonth[key].recurring += q.totals.recurringTotal;
  }

  // --- product performance
  const byProduct = {};
  for (const q of rows) {
    for (const line of q.lines) {
      if (!byProduct[line.productId]) {
        byProduct[line.productId] = {
          productId: line.productId,
          productName: line.productName,
          category: line.category,
          qty: 0,
          value: 0,
          discountSum: 0,
          lineCount: 0,
        };
      }
      const entry = byProduct[line.productId];
      entry.qty += line.qty;
      entry.value += lineTotal(line);
      entry.discountSum += line.discountPct;
      entry.lineCount += 1;
    }
  }

  const approvalDurations = rows
    .flatMap((q) => q.approvalSteps.filter((s) => s.at))
    .map((s) => s.at);

  return {
    rows,
    kpis: {
      totalQuotations: rows.length,
      totalValue: round2(sum(rows, (q) => q.totals.grandTotal)),
      winRate: closed.length ? round2((won.length / closed.length) * 100) : 0,
      avgDiscountPct: round2(mean(rows, (q) => q.totals.effectiveDiscountPct)),
      avgMarginPct: round2(mean(rows, (q) => q.totals.marginPct)),
      avgCycleDays: won.length
        ? round2(mean(won, (q) => differenceInDays(new Date(q.lastActivityAt), new Date(q.createdAt))))
        : 0,
      approvalActions: approvalDurations.length,
    },
    valueByRep: Object.values(byRep).sort((a, b) => b.value - a.value),
    discountBuckets: buckets,
    revenueMix: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    products: Object.values(byProduct)
      .map((p) => ({
        ...p,
        value: round2(p.value),
        avgDiscountPct: round2(p.discountSum / Math.max(1, p.lineCount)),
      }))
      .sort((a, b) => b.value - a.value),
    funnel: FUNNEL_ORDER.map((stage) => ({
      stage,
      count: rows.filter((q) => q.stage === stage).length,
    })),
  };
}

// ------------------------------------------------------------ notifications

export function selectMyNotifications(state) {
  const me = state.currentUser;
  if (!me) return { items: [], unread: 0 };
  const items = state.notifications.filter((n) => n.userId === me.id);
  return { items, unread: items.filter((n) => !n.read).length };
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

export function selectAuditForEntity(state, entityId) {
  return state.auditLog.filter((e) => e.entityId === entityId);
}
