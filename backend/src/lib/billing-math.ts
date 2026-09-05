import type { Cadence, CancellationRule, ProrationRule } from '../db/schema.js';
import { round2 } from './money.js';

/**
 * Subscription arithmetic: cycle boundaries, proration on a mid-cycle change, and
 * refunds on cancellation.
 *
 * Every figure here is shown to a customer, so the explanations are written in plain
 * language and rendered verbatim — they are part of the output, not a debug string.
 */

/** How many months one cycle spans. Used to normalise a plan to an annual figure. */
export const CADENCE_MONTHS: Record<Cadence, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/** Parses a `yyyy-MM-dd` date column into a UTC Date at midnight. */
export function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** Formats a Date as the `yyyy-MM-dd` a date column and the API both expect. */
export function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Adds whole months, clamping the day so 31 Jan + 1 month is 28/29 Feb, not 3 Mar. */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();

  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function addDays(from: Date, days: number): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export type Cycle = {
  start: Date;
  end: Date;
  daysInCycle: number;
  daysUsed: number;
  daysRemaining: number;
};

/**
 * The cycle `on` falls inside, given a subscription that started on `startDate`.
 *
 * Walks forward in whole cadence steps from the start rather than dividing elapsed
 * days, because month lengths differ: a monthly plan started on 31 January has cycles
 * of 28, 31, 30... days, and an average would put the boundary in the wrong place.
 */
export function cycleFor(startDate: Date, cadence: Cadence, on: Date): Cycle {
  const step = CADENCE_MONTHS[cadence];

  let start = startDate;
  let end = addMonths(start, step);

  // Guarded rather than `while (true)`: a pathological start date far in the past
  // should stop, not spin.
  for (let i = 0; i < 600 && end <= on; i += 1) {
    start = end;
    end = addMonths(start, step);
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const daysInCycle = Math.max(1, Math.round((end.getTime() - start.getTime()) / dayMs));
  const daysUsed = Math.max(0, Math.min(daysInCycle, Math.round((on.getTime() - start.getTime()) / dayMs)));

  return { start, end, daysInCycle, daysUsed, daysRemaining: daysInCycle - daysUsed };
}

export type ProrationResult = {
  daysInCycle: number;
  daysUsed: number;
  daysRemaining: number;
  qtyDelta: number;
  unitNet: number;
  amountNow: number;
  deferredAmount: number;
  type: 'charge' | 'credit' | 'none' | 'deferred';
  prorationRule: ProrationRule;
  explanation: string;
};

/**
 * What a mid-cycle quantity change costs, by rule. No mutation — the number must be
 * shown before anything is committed.
 *
 *   daily_prorate      charge only for the days remaining in the cycle
 *   full_period        no adjustment now; the new quantity bills from next cycle
 *   next_cycle_adjust  defer the full delta to the next invoice
 */
export function prorate(
  currentQty: number,
  newQty: number,
  unitPrice: number,
  discountPct: number,
  rule: ProrationRule,
  cycle: Cycle,
): ProrationResult {
  const qtyDelta = newQty - currentQty;
  const unitNet = round2(unitPrice * (1 - discountPct / 100));
  const { daysInCycle, daysUsed, daysRemaining } = cycle;

  const base = {
    daysInCycle,
    daysUsed,
    daysRemaining,
    qtyDelta,
    unitNet,
    prorationRule: rule,
  };

  if (rule === 'full_period') {
    return {
      ...base,
      amountNow: 0,
      deferredAmount: 0,
      type: 'none',
      explanation: `No charge now — the quantity change takes effect from the next billing cycle on ${formatDate(cycle.end)}.`,
    };
  }

  if (rule === 'next_cycle_adjust') {
    const deferred = round2(qtyDelta * unitNet);
    return {
      ...base,
      amountNow: 0,
      deferredAmount: deferred,
      type: 'deferred',
      explanation: `Nothing charged now. ${formatMoney(Math.abs(deferred))} will be ${deferred >= 0 ? 'added to' : 'deducted from'} your next invoice on ${formatDate(cycle.end)}.`,
    };
  }

  const amountNow = round2((qtyDelta * unitNet * daysRemaining) / daysInCycle);

  return {
    ...base,
    amountNow,
    deferredAmount: 0,
    type: amountNow >= 0 ? 'charge' : 'credit',
    explanation:
      amountNow >= 0
        ? `Day ${daysUsed} of ${daysInCycle}: +${qtyDelta} unit(s) x ${unitNet.toFixed(2)} x ${daysRemaining}/${daysInCycle} days = ${amountNow.toFixed(2)} charged now.`
        : `Day ${daysUsed} of ${daysInCycle}: ${qtyDelta} unit(s) x ${unitNet.toFixed(2)} x ${daysRemaining}/${daysInCycle} days = ${Math.abs(amountNow).toFixed(2)} credited back.`,
  };
}

export type CancellationResult = {
  daysInCycle: number;
  daysRemaining: number;
  amount: number;
  type: 'refund' | 'credit_note' | null;
  cancellationRule: CancellationRule;
  explanation: string;
};

/**
 * What cancelling costs, by rule.
 *
 *   refund_unused     money back for the unused days
 *   credit_note_only  same figure, issued as credit rather than cash
 *   no_refund         nothing; the customer keeps the service to the cycle end
 */
export function cancellationValue(
  perCycle: number,
  rule: CancellationRule,
  cycle: Cycle,
): CancellationResult {
  const { daysInCycle, daysRemaining } = cycle;

  if (rule === 'no_refund') {
    return {
      daysInCycle,
      daysRemaining,
      amount: 0,
      type: null,
      cancellationRule: rule,
      explanation: `No refund is due under this plan. Your service continues until ${formatDate(cycle.end)}.`,
    };
  }

  const amount = round2((perCycle * daysRemaining) / daysInCycle);
  const isRefund = rule === 'refund_unused';

  return {
    daysInCycle,
    daysRemaining,
    amount,
    type: isRefund ? 'refund' : 'credit_note',
    cancellationRule: rule,
    explanation: isRefund
      ? `${amount.toFixed(2)} refunded for ${daysRemaining} unused days of ${daysInCycle}.`
      : `${amount.toFixed(2)} issued as a credit note for ${daysRemaining} unused days of ${daysInCycle}.`,
  };
}

/**
 * The next N billing dates for a line, starting from the cycle after `from`.
 * Twelve forward occurrences are kept per active recurring line.
 */
export function scheduleFrom(
  startDate: Date,
  cadence: Cadence,
  perCycle: number,
  count: number,
  firstCycleIndex = 0,
): { occursOn: string; amount: number; cycleIndex: number }[] {
  const step = CADENCE_MONTHS[cadence];
  const rows: { occursOn: string; amount: number; cycleIndex: number }[] = [];

  for (let i = 0; i < count; i += 1) {
    rows.push({
      occursOn: formatDate(addMonths(startDate, step * i)),
      amount: round2(perCycle),
      cycleIndex: firstCycleIndex + i,
    });
  }

  return rows;
}

/** Normalises a per-cycle amount to twelve months, for the annual recurring figure. */
export function annualise(perCycle: number, cadence: Cadence): number {
  return round2((perCycle * 12) / CADENCE_MONTHS[cadence]);
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}
