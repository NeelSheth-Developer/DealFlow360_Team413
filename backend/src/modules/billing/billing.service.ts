import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  billingOccurrences,
  creditNotes,
  invoiceLines,
  invoices,
  quotationLines,
  subscriptionPlans,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import {
  annualise,
  cycleFor,
  formatDate,
  parseDate,
  prorate,
  cancellationValue,
  scheduleFrom,
} from '../../lib/billing-math.js';
import { emailCreditNoteIssued } from '../../lib/emails.js';
import { money, num, round2 } from '../../lib/money.js';
import { withReference } from '../../lib/reference.js';
import { lineTotals } from '../../lib/totals.js';
import { ApiError } from '../../utils/api-error.js';
import { loadQuotation, type LoadedQuotation } from '../quotations/quotations.repo.js';

/**
 * Hybrid billing: one-time lines and recurring lines on the same order.
 *
 * The two streams NEVER merge. One-time lines produce an invoice; recurring lines
 * produce their own billing schedule. That separation is the whole point of the
 * feature — a customer buying eight laptops and twenty cloud seats gets one invoice
 * for the laptops and a monthly schedule for the seats, not a single blended number
 * that reconciles to neither.
 *
 * Twelve forward occurrences are kept per active recurring line: enough for a year's
 * visibility, few enough that a plan change does not rewrite an unbounded table.
 */

const FORWARD_OCCURRENCES = 12;
const PAYMENT_TERMS_DAYS = 15;

/** Resolves a line's plan, or throws when the line is not recurring. */
async function planForLine(loaded: LoadedQuotation, lineId: string) {
  const line = loaded.lines.find((candidate) => candidate.id === lineId);
  if (!line) throw ApiError.notFound('Line not found on this quotation');

  if (!line.isSubscription || !line.planId) {
    throw ApiError.conflict(
      'NOT_SUBSCRIPTION_LINE',
      `${line.productName} is not a subscription line, so it has no billing cycle.`,
    );
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, line.planId))
    .limit(1);

  if (!plan) throw ApiError.notFound('Subscription plan not found');
  return { line, plan };
}

/** The one-time / recurring split, schedules, and the credit-note ledger. */
export async function getBilling(id: string) {
  const loaded = await loadQuotation(id);

  const oneTimeRows = loaded.lines
    .filter((line) => !line.isSubscription)
    .map((line) => {
      const totals = lineTotals(line, loaded.orderDiscountPct);
      return {
        lineId: line.id,
        productName: line.productName,
        qty: line.qty,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        total: totals.net,
      };
    });

  const recurringLines = loaded.lines.filter((line) => line.isSubscription);
  const plans = await plansFor(recurringLines.map((line) => line.planId));
  const occurrences = await occurrencesFor(id);

  const recurringRows = recurringLines.map((line) => {
    const plan = line.planId ? plans.get(line.planId) : undefined;
    const totals = lineTotals(line, loaded.orderDiscountPct);
    const perCycle = totals.net;
    const rows = occurrences.get(line.id) ?? [];

    return {
      lineId: line.id,
      productName: line.productName,
      planId: line.planId,
      planName: plan?.name ?? null,
      cadence: plan?.cadence ?? null,
      prorationRule: plan?.prorationRule ?? null,
      cancellationRule: plan?.cancellationRule ?? null,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      perCycle,
      annual: plan ? annualise(perCycle, plan.cadence) : perCycle,
      nextBillingDate:
        rows.find((row) => row.status === 'scheduled')?.date ?? line.subscriptionStartDate,
      cancelled: line.subscriptionStatus === 'cancelled',
      occurrences: rows,
    };
  });

  const [invoice] = await db
    .select({ id: invoices.id, reference: invoices.reference })
    .from(invoices)
    .where(eq(invoices.quotationId, id))
    .limit(1);

  const notes = await db
    .select()
    .from(creditNotes)
    .where(eq(creditNotes.quotationId, id))
    .orderBy(asc(creditNotes.createdAt));

  const activeRecurring = recurringRows.filter((row) => !row.cancelled);

  return {
    quotationId: id,
    reference: loaded.reference,
    currency: loaded.currency,
    oneTimeRows,
    oneTimeTotal: round2(oneTimeRows.reduce((sum, row) => sum + row.total, 0)),
    recurringRows,
    recurringPerCycleTotal: round2(activeRecurring.reduce((sum, row) => sum + row.perCycle, 0)),
    annualRecurringTotal: round2(activeRecurring.reduce((sum, row) => sum + row.annual, 0)),
    invoiceId: invoice?.id ?? null,
    invoiceReference: invoice?.reference ?? null,
    creditNotes: notes.map((note) => ({
      id: note.id,
      reference: note.reference,
      quotationId: note.quotationId,
      lineId: note.lineId,
      amount: num(note.amount),
      type: note.type,
      reason: note.reason,
      createdAt: note.createdAt,
      createdById: note.createdById,
    })),
  };
}

/**
 * Builds the invoice for the one-time lines and the schedules for the recurring ones.
 *
 * Idempotent by design: calling it twice does not produce two invoices. It rebuilds
 * the schedules and returns the existing invoice, because a rebuild after a line edit
 * is a legitimate thing to want and a duplicate invoice never is.
 */
export async function buildBilling(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);

  const billable: string[] = ['approved', 'fulfillment', 'billed', 'confirmed'];
  if (!billable.includes(loaded.stage)) {
    throw ApiError.conflict(
      'STAGE_LOCKED',
      `Can't build billing — this quotation is ${loaded.stage.replace(/_/g, ' ')} and has not been approved.`,
    );
  }

  await rebuildSchedules(loaded);

  const oneTime = loaded.lines.filter((line) => !line.isSubscription);
  const [existing] = await db.select().from(invoices).where(eq(invoices.quotationId, id)).limit(1);

  if (existing) {
    await audit({
      entityType: 'invoice',
      entityId: existing.id,
      entityRef: existing.reference,
      action: 'Billing schedules rebuilt',
      actor,
      meta: { quotationId: id },
    });
    return getBilling(id);
  }

  if (oneTime.length === 0) {
    // A subscription-only order has schedules but nothing to invoice up front. That is
    // a valid state, not an error.
    return getBilling(id);
  }

  let subtotal = 0;
  let tax = 0;
  const lines = oneTime.map((line) => {
    const totals = lineTotals(line, loaded.orderDiscountPct);
    subtotal += totals.net;
    tax += totals.tax;
    return {
      lineId: line.id,
      productName: line.productName,
      qty: line.qty,
      unitPrice: money(line.unitPrice),
      discountPct: line.discountPct.toFixed(2),
      taxPct: line.taxPct.toFixed(2),
      total: money(totals.net),
    };
  });

  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime());
  dueDate.setUTCDate(dueDate.getUTCDate() + PAYMENT_TERMS_DAYS);

  const invoice = await withReference('INV', 'invoices', async (reference) => {
    const [row] = await db
      .insert(invoices)
      .values({
        reference,
        quotationId: id,
        customerId: loaded.customerId,
        currency: loaded.currency,
        status: 'draft',
        subtotal: money(subtotal),
        tax: money(tax),
        total: money(subtotal + tax),
        issueDate: formatDate(issueDate),
        dueDate: formatDate(dueDate),
      })
      .returning();
    return row;
  });

  if (!invoice) throw ApiError.notFound('Invoice not found');

  await db.insert(invoiceLines).values(lines.map((line) => ({ ...line, invoiceId: invoice.id })));

  await audit({
    entityType: 'invoice',
    entityId: invoice.id,
    entityRef: invoice.reference,
    action: `Invoice built for ${loaded.reference}`,
    actor,
    meta: { quotationId: id, total: round2(subtotal + tax), lines: lines.length },
  });

  return getBilling(id);
}

/** Regenerates forward occurrences for every active recurring line. */
async function rebuildSchedules(loaded: LoadedQuotation) {
  const recurring = loaded.lines.filter(
    (line) => line.isSubscription && line.subscriptionStatus === 'active',
  );

  if (recurring.length === 0) return;

  const plans = await plansFor(recurring.map((line) => line.planId));

  for (const line of recurring) {
    const plan = line.planId ? plans.get(line.planId) : undefined;
    if (!plan) continue;

    // Only `scheduled` rows are replaced. An occurrence already invoiced or paid is a
    // financial fact and must survive a rebuild.
    await db
      .delete(billingOccurrences)
      .where(
        and(eq(billingOccurrences.lineId, line.id), eq(billingOccurrences.status, 'scheduled')),
      );

    const settled = await db
      .select({ cycleIndex: billingOccurrences.cycleIndex })
      .from(billingOccurrences)
      .where(eq(billingOccurrences.lineId, line.id));

    const nextIndex =
      settled.length > 0 ? Math.max(...settled.map((row) => row.cycleIndex)) + 1 : 0;

    const start = parseDate(line.subscriptionStartDate ?? formatDate(new Date()));
    const perCycle = lineTotals(line, loaded.orderDiscountPct).net;

    const rows = scheduleFrom(start, plan.cadence, perCycle, FORWARD_OCCURRENCES, nextIndex);

    if (rows.length > 0) {
      await db.insert(billingOccurrences).values(
        rows.map((row) => ({
          quotationId: loaded.id,
          lineId: line.id,
          occursOn: row.occursOn,
          amount: money(row.amount),
          cycleIndex: row.cycleIndex,
        })),
      );
    }
  }
}

/** What a quantity change would cost. No mutation — the number is shown first. */
export async function previewProration(id: string, lineId: string, newQty: number) {
  const loaded = await loadQuotation(id);
  const { line, plan } = await planForLine(loaded, lineId);

  if (line.subscriptionStatus === 'cancelled') {
    throw ApiError.conflict(
      'SUBSCRIPTION_CANCELLED',
      `The subscription on ${line.productName} is cancelled.`,
    );
  }

  const start = parseDate(line.subscriptionStartDate ?? formatDate(new Date()));
  const cycle = cycleFor(start, plan.cadence, new Date());

  return prorate(line.qty, newQty, line.unitPrice, line.discountPct, plan.prorationRule, cycle);
}

/**
 * Applies the quantity change, regenerates the schedule, and — when the proration is
 * negative — issues a credit note automatically.
 *
 * The automatic credit note is the part that matters: a mid-cycle reduction that only
 * lowered the next invoice would quietly keep money the customer has already paid for
 * days they will not use.
 */
export async function applySubscriptionChange(
  actor: AuditActor,
  id: string,
  lineId: string,
  qty: number,
) {
  const loaded = await loadQuotation(id);
  const proration = await previewProration(id, lineId, qty);
  const { line } = await planForLine(loaded, lineId);

  await db.update(quotationLines).set({ qty }).where(eq(quotationLines.id, lineId));

  const fresh = await loadQuotation(id);
  await rebuildSchedules(fresh);

  if (proration.amountNow < 0) {
    await issueCreditNote(actor, id, {
      lineId,
      amount: Math.abs(proration.amountNow),
      type: 'credit_note',
      reason: `Quantity reduced from ${line.qty} to ${qty} mid-cycle. ${proration.explanation}`,
    });
  }

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Subscription quantity changed on ${line.productName}`,
    actor,
    reason: proration.explanation,
    meta: {
      lineId,
      from: line.qty,
      to: qty,
      amountNow: proration.amountNow,
      deferredAmount: proration.deferredAmount,
      prorationRule: proration.prorationRule,
    },
  });

  return { billing: await getBilling(id), proration };
}

/** What cancelling would refund. No mutation. */
export async function previewCancellation(id: string, lineId: string) {
  const loaded = await loadQuotation(id);
  const { line, plan } = await planForLine(loaded, lineId);

  const start = parseDate(line.subscriptionStartDate ?? formatDate(new Date()));
  const cycle = cycleFor(start, plan.cadence, new Date());
  const perCycle = lineTotals(line, loaded.orderDiscountPct).net;

  return cancellationValue(perCycle, plan.cancellationRule, cycle);
}

/**
 * Cancels the subscription: flips every future `scheduled` occurrence to `cancelled`
 * and creates the refund or credit note the plan's rule calls for.
 */
export async function cancelSubscription(actor: AuditActor, id: string, lineId: string) {
  const loaded = await loadQuotation(id);
  const { line } = await planForLine(loaded, lineId);

  if (line.subscriptionStatus === 'cancelled') {
    throw ApiError.conflict(
      'SUBSCRIPTION_CANCELLED',
      `The subscription on ${line.productName} is already cancelled.`,
    );
  }

  const result = await previewCancellation(id, lineId);

  await db
    .update(quotationLines)
    .set({ subscriptionStatus: 'cancelled' })
    .where(eq(quotationLines.id, lineId));

  await db
    .update(billingOccurrences)
    .set({ status: 'cancelled' })
    .where(and(eq(billingOccurrences.lineId, lineId), eq(billingOccurrences.status, 'scheduled')));

  if (result.type !== null && result.amount > 0) {
    await issueCreditNote(actor, id, {
      lineId,
      amount: result.amount,
      type: result.type,
      reason: `Subscription cancelled on ${line.productName}. ${result.explanation}`,
    });
  }

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Subscription cancelled on ${line.productName}`,
    actor,
    reason: result.explanation,
    meta: {
      lineId,
      amount: result.amount,
      type: result.type,
      cancellationRule: result.cancellationRule,
    },
  });

  return { billing: await getBilling(id), cancellation: result };
}

export async function listCreditNotes(id: string) {
  const { creditNotes: notes } = await getBilling(id);
  return notes;
}

/** Issues a credit note or refund. Also the path the automatic ones take. */
export async function issueCreditNote(
  actor: AuditActor,
  id: string,
  input: { lineId: string | null; amount: number; type: 'refund' | 'credit_note'; reason: string },
) {
  const loaded = await loadQuotation(id);

  const note = await withReference('CN', 'credit_notes', async (reference) => {
    const [row] = await db
      .insert(creditNotes)
      .values({
        reference,
        quotationId: id,
        lineId: input.lineId,
        amount: money(input.amount),
        type: input.type,
        reason: input.reason,
        createdById: actor.id ?? loaded.ownerId,
      })
      .returning();
    return row;
  });

  if (!note) throw ApiError.notFound('Credit note not found');

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `${input.type === 'refund' ? 'Refund' : 'Credit note'} ${note.reference} issued`,
    actor,
    reason: input.reason,
    meta: { amount: input.amount, type: input.type, lineId: input.lineId },
  });

  await emailCreditNoteIssued({
    to: loaded.customerEmail,
    contactName: loaded.customerContactName ?? loaded.customerName,
    reference: note.reference,
    quotationRef: loaded.reference,
    currency: loaded.currency,
    amount: input.amount,
    type: input.type,
    reason: input.reason,
  });

  return getBilling(id);
}

async function plansFor(planIds: (string | null)[]) {
  const ids = [...new Set(planIds.filter((id): id is string => id !== null))];
  const map = new Map<string, typeof subscriptionPlans.$inferSelect>();
  if (ids.length === 0) return map;

  const rows = await db.select().from(subscriptionPlans).where(inArray(subscriptionPlans.id, ids));

  for (const row of rows) map.set(row.id, row);
  return map;
}

async function occurrencesFor(quotationId: string) {
  const rows = await db
    .select()
    .from(billingOccurrences)
    .where(eq(billingOccurrences.quotationId, quotationId))
    .orderBy(asc(billingOccurrences.cycleIndex));

  const map = new Map<
    string,
    {
      id: string;
      lineId: string;
      date: string;
      amount: number;
      status: string;
      cycleIndex: number;
    }[]
  >();

  for (const row of rows) {
    const list = map.get(row.lineId) ?? [];
    list.push({
      id: row.id,
      lineId: row.lineId,
      date: row.occursOn,
      amount: num(row.amount),
      status: row.status,
      cycleIndex: row.cycleIndex,
    });
    map.set(row.lineId, list);
  }

  return map;
}
