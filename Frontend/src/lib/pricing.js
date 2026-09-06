import { round2 } from './utils';

/**
 * Pricing primitives. Everything the UI shows as a total, margin or discount
 * percentage is derived here — never stored on the quotation — so a badge can
 * never disagree with the table next to it.
 */

export function lineSubtotal(line) {
  return (Number(line.qty) || 0) * (Number(line.unitPrice) || 0);
}

export function lineDiscountAmount(line) {
  return lineSubtotal(line) * ((Number(line.discountPct) || 0) / 100);
}

export function lineTotal(line) {
  return lineSubtotal(line) - lineDiscountAmount(line);
}

export function lineCost(line) {
  return (Number(line.qty) || 0) * (Number(line.costPrice) || 0);
}

export function lineMargin(line) {
  const revenue = lineTotal(line);
  const cost = lineCost(line);
  return {
    amount: round2(revenue - cost),
    pct: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
  };
}

export function productMarginPct(product) {
  const price = Number(product?.basePrice) || 0;
  const cost = Number(product?.costPrice) || 0;
  if (price <= 0) return 0;
  return round2(((price - cost) / price) * 100);
}

/**
 * Full order rollup. The order-level discount is applied on top of whatever
 * line discounts were already given, which is why it also feeds the risk score.
 */
export function quoteTotals(quotation) {
  const lines = quotation?.lines ?? [];
  const orderDiscountPct = Number(quotation?.orderDiscountPct) || 0;
  const orderFactor = 1 - orderDiscountPct / 100;

  const subtotal = lines.reduce((s, l) => s + lineSubtotal(l), 0);
  const afterLineDiscounts = lines.reduce((s, l) => s + lineTotal(l), 0);
  const orderDiscountAmount = afterLineDiscounts * (orderDiscountPct / 100);
  const netBeforeTax = afterLineDiscounts - orderDiscountAmount;

  const tax = lines.reduce(
    (s, l) => s + lineTotal(l) * orderFactor * ((Number(l.taxPct) || 0) / 100),
    0,
  );
  const totalCost = lines.reduce((s, l) => s + lineCost(l), 0);

  const oneTimeLines = lines.filter((l) => !l.isSubscription);
  const recurringLines = lines.filter((l) => l.isSubscription);

  return {
    lineCount: lines.length,
    subtotal: round2(subtotal),
    lineDiscountAmount: round2(subtotal - afterLineDiscounts),
    afterLineDiscounts: round2(afterLineDiscounts),
    orderDiscountAmount: round2(orderDiscountAmount),
    netBeforeTax: round2(netBeforeTax),
    tax: round2(tax),
    grandTotal: round2(netBeforeTax + tax),
    totalCost: round2(totalCost),
    marginAmount: round2(netBeforeTax - totalCost),
    marginPct: netBeforeTax > 0 ? round2(((netBeforeTax - totalCost) / netBeforeTax) * 100) : 0,
    effectiveDiscountPct: subtotal > 0 ? round2(((subtotal - netBeforeTax) / subtotal) * 100) : 0,
    oneTimeTotal: round2(oneTimeLines.reduce((s, l) => s + lineTotal(l) * orderFactor, 0)),
    recurringTotal: round2(recurringLines.reduce((s, l) => s + lineTotal(l) * orderFactor, 0)),
    oneTimeCount: oneTimeLines.length,
    recurringCount: recurringLines.length,
  };
}

/** Resolve the price a specific customer tier pays for a product. */
export function tierPrice(product, tier, priceLists = [], currency = 'INR') {
  if (!product) return 0;
  const entry = priceLists.find(
    (p) => p.productId === product.id && p.tier === tier && p.currency === currency,
  );
  if (entry) return entry.price;
  const anyCurrency = priceLists.find((p) => p.productId === product.id && p.tier === tier);
  return anyCurrency ? anyCurrency.price : product.basePrice;
}

/** Margin impact of adding a candidate line to an existing quotation. */
export function marginImpact(quotation, candidateLine) {
  const before = quoteTotals(quotation);
  const after = quoteTotals({
    ...quotation,
    lines: [...(quotation.lines ?? []), candidateLine],
  });
  return {
    marginPctBefore: before.marginPct,
    marginPctAfter: after.marginPct,
    marginPctDelta: round2(after.marginPct - before.marginPct),
    marginAmountDelta: round2(after.marginAmount - before.marginAmount),
    totalDelta: round2(after.grandTotal - before.grandTotal),
  };
}
