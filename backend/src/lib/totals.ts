import { round2 } from './money.js';

/**
 * Line and order arithmetic.
 *
 * The frontend derives its own totals from the lines so a badge can never disagree
 * with the table beside it, and it does not depend on ours. We compute them anyway —
 * an invoice has to be built from something, and the reporting figures have to come
 * from the server. Both sides using the same formula is the point; this file is that
 * formula, written once.
 *
 * An order-level discount COMPOUNDS on the line discount rather than adding to it:
 * 8% off, then 10% off the remainder, is 17.2% off list — not 18%. That matches the
 * risk engine, and the two must not drift apart.
 */

export type LineForTotals = {
  qty: number;
  unitPrice: number;
  costPrice: number;
  discountPct: number;
  taxPct: number;
  category: string;
  isSubscription: boolean;
};

export type LineTotals = {
  /** qty x unitPrice, before any discount. */
  gross: number;
  /** The line + order discounts compounded, as a percentage. */
  effectiveDiscountPct: number;
  /** Currency saved against gross. */
  savings: number;
  /** gross - savings. */
  net: number;
  tax: number;
  total: number;
  cost: number;
  margin: number;
  marginPct: number;
};

export function lineTotals(line: LineForTotals, orderDiscountPct = 0): LineTotals {
  const gross = line.qty * line.unitPrice;
  const effectiveDiscountPct =
    line.discountPct + orderDiscountPct * (1 - line.discountPct / 100);

  const net = gross * (1 - effectiveDiscountPct / 100);
  const savings = gross - net;
  const tax = net * (line.taxPct / 100);
  const cost = line.qty * line.costPrice;
  const margin = net - cost;

  return {
    gross: round2(gross),
    effectiveDiscountPct: round2(effectiveDiscountPct),
    savings: round2(savings),
    net: round2(net),
    tax: round2(tax),
    total: round2(net + tax),
    cost: round2(cost),
    margin: round2(margin),
    marginPct: net > 0 ? round2((margin / net) * 100) : 0,
  };
}

export type OrderTotals = {
  subtotal: number;
  savings: number;
  tax: number;
  grandTotal: number;
  cost: number;
  margin: number;
  marginPct: number;
  effectiveDiscountPct: number;
  oneTimeTotal: number;
  recurringTotal: number;
};

/**
 * Rolls lines up. `oneTimeTotal` and `recurringTotal` split on `isSubscription`,
 * because the two streams bill separately and must never be presented as one number —
 * that separation is the point of hybrid billing.
 */
export function orderTotals(lines: LineForTotals[], orderDiscountPct = 0): OrderTotals {
  let gross = 0;
  let net = 0;
  let tax = 0;
  let cost = 0;
  let oneTime = 0;
  let recurring = 0;

  for (const line of lines) {
    const totals = lineTotals(line, orderDiscountPct);
    gross += totals.gross;
    net += totals.net;
    tax += totals.tax;
    cost += totals.cost;
    if (line.isSubscription) recurring += totals.net;
    else oneTime += totals.net;
  }

  const margin = net - cost;

  return {
    subtotal: round2(gross),
    savings: round2(gross - net),
    tax: round2(tax),
    grandTotal: round2(net + tax),
    cost: round2(cost),
    margin: round2(margin),
    marginPct: net > 0 ? round2((margin / net) * 100) : 0,
    effectiveDiscountPct: gross > 0 ? round2(((gross - net) / gross) * 100) : 0,
    oneTimeTotal: round2(oneTime),
    recurringTotal: round2(recurring),
  };
}
