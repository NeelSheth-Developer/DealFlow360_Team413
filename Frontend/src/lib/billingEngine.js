import { addMonths, differenceInCalendarDays, formatISO } from 'date-fns';
import { addDaysISO, nextId, round2 } from './utils';
import { lineTotal } from './pricing';

const CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

export function cadenceMonths(cadence) {
  return CADENCE_MONTHS[cadence] ?? 1;
}

/** Amount charged per billing cycle for a recurring line. */
export function perCycleAmount(line) {
  return round2(lineTotal(line));
}

/** Forward-looking billing schedule for one recurring line. */
export function generateBillingSchedule(line, plan, startDate, occurrences = 12) {
  const step = cadenceMonths(plan?.cadence);
  const perCycle = perCycleAmount(line);
  const out = [];
  const base = new Date(startDate);

  for (let i = 0; i < occurrences; i += 1) {
    out.push({
      id: `${line.id}-occ-${i}`,
      lineId: line.id,
      planId: plan?.id ?? null,
      date: formatISO(addMonths(base, i * step), { representation: 'date' }),
      amount: perCycle,
      status: i === 0 ? 'invoiced' : 'scheduled',
      cycleIndex: i,
    });
  }
  return out;
}

/** Annual contract value for a recurring line. */
export function annualValue(line, plan) {
  const cyclesPerYear = 12 / cadenceMonths(plan?.cadence);
  return round2(perCycleAmount(line) * cyclesPerYear);
}

export function cycleWindow(plan, referenceDate) {
  const step = cadenceMonths(plan?.cadence);
  const start = new Date(referenceDate);
  const end = addMonths(start, step);
  return { start, end, daysInCycle: Math.max(1, differenceInCalendarDays(end, start)) };
}

/**
 * Mid-cycle quantity change. Returns what to charge or credit NOW, plus a
 * plain-language explanation shown to the user before anything is committed.
 */
export function computeProration({ line, oldQty, newQty, plan, changeDate, cycleStartDate }) {
  const { daysInCycle } = cycleWindow(plan, cycleStartDate);
  const daysUsed = Math.max(
    0,
    Math.min(daysInCycle, differenceInCalendarDays(new Date(changeDate), new Date(cycleStartDate))),
  );
  const daysRemaining = Math.max(0, daysInCycle - daysUsed);
  const qtyDelta = (Number(newQty) || 0) - (Number(oldQty) || 0);
  const unitNet = (Number(line.unitPrice) || 0) * (1 - (Number(line.discountPct) || 0) / 100);

  const base = { daysUsed, daysRemaining, daysInCycle, qtyDelta, unitNet: round2(unitNet) };

  if (qtyDelta === 0) {
    return { ...base, amountNow: 0, deferredAmount: 0, type: 'none', explanation: 'No quantity change.' };
  }

  if (plan?.prorationRule === 'full_period') {
    return {
      ...base,
      amountNow: 0,
      deferredAmount: 0,
      type: 'none',
      explanation: `No mid-cycle charge under "full period" rules. The new quantity (${newQty}) applies from the next ${plan.cadence} cycle.`,
    };
  }

  if (plan?.prorationRule === 'next_cycle_adjust') {
    const deferred = round2(qtyDelta * unitNet);
    return {
      ...base,
      amountNow: 0,
      deferredAmount: deferred,
      type: 'deferred',
      explanation: `Nothing charged today. ${Math.abs(deferred).toFixed(2)} will be ${deferred >= 0 ? 'added to' : 'deducted from'} the next cycle's invoice.`,
    };
  }

  // daily_prorate
  const amount = round2(qtyDelta * unitNet * (daysRemaining / daysInCycle));
  return {
    ...base,
    amountNow: amount,
    deferredAmount: 0,
    type: amount >= 0 ? 'charge' : 'credit',
    explanation:
      `Day ${daysUsed} of ${daysInCycle}: ${qtyDelta >= 0 ? '+' : ''}${qtyDelta} unit(s) × ` +
      `${unitNet.toFixed(2)} × ${daysRemaining}/${daysInCycle} days = ` +
      `${Math.abs(amount).toFixed(2)} ${amount >= 0 ? 'charged now' : 'credited back'}.`,
  };
}

/** Cancellation outcome driven by the plan's configured rule. */
export function computeCancellation({ line, plan, cancelDate, cycleStartDate }) {
  const { daysInCycle } = cycleWindow(plan, cycleStartDate);
  const daysUsed = Math.max(
    0,
    Math.min(daysInCycle, differenceInCalendarDays(new Date(cancelDate), new Date(cycleStartDate))),
  );
  const daysRemaining = Math.max(0, daysInCycle - daysUsed);
  const unused = round2(perCycleAmount(line) * (daysRemaining / daysInCycle));

  if (plan?.cancellationRule === 'no_refund') {
    return {
      amount: 0,
      type: null,
      daysRemaining,
      daysInCycle,
      explanation: `No refund under this plan. Service continues to the end of the paid cycle (${daysRemaining} days remaining).`,
    };
  }

  if (plan?.cancellationRule === 'credit_note_only') {
    return {
      amount: unused,
      type: 'credit_note',
      daysRemaining,
      daysInCycle,
      explanation: `${unused.toFixed(2)} issued as a credit note for ${daysRemaining} unused days (not refunded to the original payment method).`,
    };
  }

  return {
    amount: unused,
    type: 'refund',
    daysRemaining,
    daysInCycle,
    explanation: `${unused.toFixed(2)} refunded for ${daysRemaining} unused days of ${daysInCycle}.`,
  };
}

/** Build the one-time invoice for a confirmed order. */
export function generateInvoice(quotation, oneTimeLines, issueDate = new Date(), dueDays = 15) {
  const orderFactor = 1 - (Number(quotation.orderDiscountPct) || 0) / 100;

  const lines = oneTimeLines.map((l) => ({
    lineId: l.id,
    productName: l.productName,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    total: round2(lineTotal(l) * orderFactor),
  }));

  const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const tax = round2(
    oneTimeLines.reduce((s, l) => s + lineTotal(l) * orderFactor * ((Number(l.taxPct) || 0) / 100), 0),
  );

  return {
    id: nextId('INV'),
    quotationId: quotation.id,
    customerName: quotation.customerName,
    currency: quotation.currency ?? 'INR',
    status: 'draft',
    lines,
    subtotal,
    tax,
    total: round2(subtotal + tax),
    payments: [],
    issueDate: formatISO(new Date(issueDate), { representation: 'date' }),
    dueDate: addDaysISO(issueDate, dueDays),
  };
}

export function invoiceBalances(invoice) {
  const amountPaid = (invoice?.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    amountPaid: round2(amountPaid),
    balanceRemaining: round2((Number(invoice?.total) || 0) - amountPaid),
  };
}

export function nextInvoiceStatus(invoice) {
  const { balanceRemaining, amountPaid } = invoiceBalances(invoice);
  if (balanceRemaining <= 0.001) return 'paid';
  if (amountPaid > 0) return 'partially_paid';
  return invoice.status === 'draft' ? 'draft' : 'sent';
}

export const INVOICE_STEPS = ['draft', 'sent', 'partially_paid', 'paid'];

export function invoiceStepIndex(status) {
  const i = INVOICE_STEPS.indexOf(status);
  return i < 0 ? 0 : i;
}

/** Group a flat occurrence list by calendar month for the schedule view. */
export function groupOccurrencesByMonth(occurrences = []) {
  const map = new Map();
  for (const occ of occurrences) {
    const key = occ.date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(occ);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => ({
      month,
      items,
      total: round2(items.reduce((s, i) => s + i.amount, 0)),
    }));
}
