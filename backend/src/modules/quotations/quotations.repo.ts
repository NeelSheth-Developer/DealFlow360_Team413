import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  approvalSteps,
  customers,
  lineComments,
  quotationLines,
  quotations,
  users,
  type Category,
  type Stage,
} from '../../db/schema.js';
import { num, numOrNull } from '../../lib/money.js';
import { orderTotals, type LineForTotals } from '../../lib/totals.js';
import { ApiError } from '../../utils/api-error.js';

/**
 * Loading and shaping a quotation.
 *
 * Shared rather than living in the service because five modules need the same object:
 * quotations, approvals, fulfillment, billing and the portal all start from a loaded
 * quotation, and each re-deriving it would be five chances to drift apart.
 *
 * Totals are computed, never stored — see the note on the `quotations` table. They are
 * included on the response as a cross-check; the frontend derives its own from the
 * lines so a badge can never disagree with the table beside it.
 */

export type LoadedLine = {
  id: string;
  productId: string;
  productName: string;
  category: Category;
  qty: number;
  unitPrice: number;
  costPrice: number;
  discountPct: number;
  taxPct: number;
  isSubscription: boolean;
  planId: string | null;
  subscriptionStartDate: string | null;
  subscriptionStatus: 'active' | 'cancelled';
  position: number;
  comments: {
    id: string;
    author: string;
    role: 'customer' | 'seller';
    message: string;
    at: Date;
  }[];
};

export type LoadedQuotation = {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerContactName: string | null;
  tier: 'bronze' | 'silver' | 'gold';
  currency: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  createdById: string;
  createdByName: string;
  stage: Stage;
  orderDiscountPct: number;
  negotiationStatus: string;
  awaitingSeller: boolean;
  sharedAt: Date | null;
  counterDiscountPct: number | null;
  counterJustification: string | null;
  dismissedSuggestions: string[];
  createdAt: Date;
  lastActivityAt: Date;
  promisedDeliveryDate: string | null;
  validUntil: string | null;
  internalNotes: string | null;
  customerTerms: string | null;
  lostReason: string | null;
  backorderPolicy: string;
  approvalSteps: {
    id: string;
    role: string;
    status: string;
    stepOrder: number;
    reviewerId: string | null;
    reviewerName: string | null;
    at: Date | null;
    reason: string | null;
  }[];
  lines: LoadedLine[];
  totals: ReturnType<typeof orderTotals>;
};

const owner = { id: users.id, name: users.name, email: users.email };

/** Loads one quotation in full. Throws 404 when it does not exist. */
export async function loadQuotation(id: string): Promise<LoadedQuotation> {
  const creator = { id: users.id, name: users.name };

  const [row] = await db
    .select({
      q: quotations,
      customerName: customers.name,
      customerEmail: customers.email,
      customerContactName: customers.contactName,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(eq(quotations.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Quotation not found');

  const [[ownerRow], [creatorRow], lineRows, stepRows] = await Promise.all([
    db.select(owner).from(users).where(eq(users.id, row.q.ownerId)).limit(1),
    db.select(creator).from(users).where(eq(users.id, row.q.createdById)).limit(1),
    db
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, id))
      .orderBy(asc(quotationLines.position), asc(quotationLines.createdAt)),
    db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.quotationId, id))
      .orderBy(asc(approvalSteps.stepOrder)),
  ]);

  const comments = await commentsFor(lineRows.map((line) => line.id));

  const lines: LoadedLine[] = lineRows.map((line) => ({
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    category: line.category,
    qty: line.qty,
    unitPrice: num(line.unitPrice),
    costPrice: num(line.costPrice),
    discountPct: num(line.discountPct),
    taxPct: num(line.taxPct),
    isSubscription: line.isSubscription,
    planId: line.planId,
    subscriptionStartDate: line.subscriptionStartDate,
    subscriptionStatus: line.subscriptionStatus,
    position: line.position,
    comments: comments.get(line.id) ?? [],
  }));

  return {
    id: row.q.id,
    reference: row.q.reference,
    customerId: row.q.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    customerContactName: row.customerContactName,
    tier: row.q.tier,
    currency: row.q.currency,
    ownerId: row.q.ownerId,
    ownerName: ownerRow?.name ?? 'Unknown',
    ownerEmail: ownerRow?.email ?? '',
    createdById: row.q.createdById,
    createdByName: creatorRow?.name ?? 'Unknown',
    stage: row.q.stage,
    orderDiscountPct: num(row.q.orderDiscountPct),
    negotiationStatus: row.q.negotiationStatus,
    awaitingSeller: row.q.awaitingSeller,
    sharedAt: row.q.sharedAt,
    counterDiscountPct: numOrNull(row.q.counterDiscountPct),
    counterJustification: row.q.counterJustification,
    dismissedSuggestions: row.q.dismissedSuggestions,
    createdAt: row.q.createdAt,
    lastActivityAt: row.q.lastActivityAt,
    promisedDeliveryDate: row.q.promisedDeliveryDate,
    validUntil: row.q.validUntil,
    internalNotes: row.q.internalNotes,
    customerTerms: row.q.customerTerms,
    lostReason: row.q.lostReason,
    backorderPolicy: row.q.backorderPolicy,
    approvalSteps: stepRows.map((step) => ({
      id: step.id,
      role: step.role,
      status: step.status,
      stepOrder: step.stepOrder,
      reviewerId: step.reviewerId,
      reviewerName: step.reviewerName,
      at: step.actedAt,
      reason: step.reason,
    })),
    lines,
    totals: orderTotals(lines as LineForTotals[], num(row.q.orderDiscountPct)),
  };
}

async function commentsFor(lineIds: string[]) {
  const map = new Map<string, LoadedLine['comments']>();
  if (lineIds.length === 0) return map;

  const rows = await db
    .select()
    .from(lineComments)
    .where(inArray(lineComments.lineId, lineIds))
    .orderBy(asc(lineComments.createdAt));

  for (const row of rows) {
    const list = map.get(row.lineId) ?? [];
    list.push({
      id: row.id,
      author: row.authorName,
      // The internal role is collapsed to a side. A customer never learns whether the
      // person replying is a rep, a manager or finance.
      role: row.side === 'customer' ? 'customer' : 'seller',
      message: row.message,
      at: row.createdAt,
    });
    map.set(row.lineId, list);
  }

  return map;
}

/** The staff-facing shape. Carries costs, margins and internal notes. */
export function presentQuotation(loaded: LoadedQuotation) {
  return {
    id: loaded.id,
    reference: loaded.reference,
    customerId: loaded.customerId,
    customerName: loaded.customerName,
    tier: loaded.tier,
    currency: loaded.currency,
    ownerId: loaded.ownerId,
    ownerName: loaded.ownerName,
    createdById: loaded.createdById,
    createdByName: loaded.createdByName,
    stage: loaded.stage,
    orderDiscountPct: loaded.orderDiscountPct,
    negotiationStatus: loaded.negotiationStatus,
    awaitingSeller: loaded.awaitingSeller,
    sharedAt: loaded.sharedAt,
    counterDiscountPct: loaded.counterDiscountPct,
    counterJustification: loaded.counterJustification,
    dismissedSuggestions: loaded.dismissedSuggestions,
    createdAt: loaded.createdAt,
    lastActivityAt: loaded.lastActivityAt,
    promisedDeliveryDate: loaded.promisedDeliveryDate,
    validUntil: loaded.validUntil,
    internalNotes: loaded.internalNotes,
    customerTerms: loaded.customerTerms,
    lostReason: loaded.lostReason,
    backorderPolicy: loaded.backorderPolicy,
    approvalSteps: loaded.approvalSteps.map((step) => ({
      role: step.role,
      status: step.status,
      reviewerId: step.reviewerId,
      reviewerName: step.reviewerName,
      at: step.at,
      reason: step.reason,
    })),
    lines: loaded.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productName,
      category: line.category,
      qty: line.qty,
      unitPrice: line.unitPrice,
      costPrice: line.costPrice,
      discountPct: line.discountPct,
      taxPct: line.taxPct,
      isSubscription: line.isSubscription,
      planId: line.planId,
      subscriptionStartDate: line.subscriptionStartDate,
      subscriptionStatus: line.subscriptionStatus,
      comments: line.comments,
    })),
    totals: loaded.totals,
  };
}

/** Bumps `lastActivityAt`, which drives the stalled-deal alert. */
export async function touch(id: string) {
  const now = new Date();
  await db
    .update(quotations)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(quotations.id, id));
}
