import type { LoadedQuotation } from '../quotations/quotations.repo.js';
import { lineTotals } from '../../lib/totals.js';
import { round2 } from '../../lib/money.js';
import type { Stage } from '../../db/schema.js';

/**
 * The customer projection.
 *
 * This is an ALLOW-LIST built from named safe fields, not the internal quotation with
 * fields deleted. The difference matters: a column added to `quotations` next month
 * cannot appear here by accident, because nothing here is spread.
 *
 * Never present, at any stage:
 *   costPrice, any margin figure, the risk score or its line breakdown, any ceiling,
 *   internalNotes, ownerId / ownerName / createdBy*, approvalSteps, another customer's
 *   anything, or the internal role names sales_rep / sales_manager / finance / admin.
 *
 * The problem statement calls for the customer view to be a real, separate, restricted
 * surface rather than an internal screen with a different label. This file is where
 * that is true on the server; the portal routes are where it is enforced.
 */

/**
 * Three independent capabilities, not one `locked` flag.
 *
 * The important one is `canMessage`: it stays open during internal approval. A
 * customer waiting on a decision must still be able to chase it, and freezing them out
 * of a conversation they are in the middle of is the exact failure this shape avoids.
 */
export type Capabilities = {
  canMessage: boolean;
  canProposeTerms: boolean;
  canConfirm: boolean;
};

export function capabilitiesFor(stage: Stage): Capabilities {
  switch (stage) {
    case 'sent':
    case 'under_negotiation':
      return { canMessage: true, canProposeTerms: true, canConfirm: true };
    case 'pending_approval':
    case 'approved':
    case 'fulfillment':
    case 'billed':
    case 'confirmed':
      return { canMessage: true, canProposeTerms: false, canConfirm: false };
    default:
      // draft is never visible to a customer at all; lost is read-only.
      return { canMessage: false, canProposeTerms: false, canConfirm: false };
  }
}

type StatusNote = { tone: 'info' | 'warning' | 'success' | 'danger'; text: string };

function statusNoteFor(loaded: LoadedQuotation): StatusNote {
  if (loaded.stage === 'lost') {
    return { tone: 'danger', text: 'This quotation is closed and can no longer be actioned.' };
  }
  if (loaded.stage === 'confirmed') {
    return { tone: 'success', text: 'Your order is confirmed. Thank you.' };
  }
  if (loaded.stage === 'billed') {
    return { tone: 'info', text: 'Your invoice has been issued.' };
  }
  if (loaded.stage === 'fulfillment') {
    return { tone: 'info', text: 'Your order is being prepared for delivery.' };
  }
  if (loaded.stage === 'approved') {
    return { tone: 'success', text: 'These terms are approved and ready for you to proceed.' };
  }
  if (loaded.stage === 'pending_approval') {
    return {
      tone: 'info',
      // No internal role names — the customer learns that a review is happening, not
      // who is doing it.
      text: 'Your request is with our team for review. You can still send us a message.',
    };
  }
  if (loaded.awaitingSeller) {
    return { tone: 'warning', text: 'We have your request and will come back to you shortly.' };
  }
  if (loaded.negotiationStatus === 'under_negotiation') {
    return {
      tone: 'warning',
      text: 'We have replied to your request. Review the updated terms below.',
    };
  }
  return { tone: 'info', text: 'This quotation is ready for your review.' };
}

/** The only shape a customer endpoint may return. */
export function projectForCustomer(loaded: LoadedQuotation) {
  const capabilities = capabilitiesFor(loaded.stage);

  const lines = loaded.lines.map((line) => {
    const totals = lineTotals(line, loaded.orderDiscountPct);

    return {
      id: line.id,
      productName: line.productName,
      description: null,
      unit: 'unit',
      qty: line.qty,
      unitPrice: line.unitPrice,
      discountPct: round2(totals.effectiveDiscountPct),
      // Customer-friendly framing: "You save 28,160", never "22% off a ceiling of 5%".
      savingsAmount: totals.savings,
      lineTotal: totals.net,
      isRecurring: line.isSubscription,
      cadence: null,
      planName: null,
      comments: line.comments.map((comment) => ({
        id: comment.id,
        author: comment.author,
        // The internal role is collapsed to a side. See the file header.
        side: comment.role === 'customer' ? 'customer' : 'seller',
        message: comment.message,
        at: comment.at,
      })),
    };
  });

  const messageCount = lines.reduce((sum, line) => sum + line.comments.length, 0);
  // Read from the loaded lines rather than the projected ones: the projection has
  // already collapsed the role into `side`, and this needs to know who spoke last.
  const lastComment = loaded.lines
    .flatMap((line) => line.comments)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

  return {
    /*
     * The quotation's own id.
     *
     * Every other portal route parses `:id` as a uuid (`portal.routes.ts`), but this
     * projection is the ONLY thing a customer session can read — so omitting the id left
     * the detail view, the PDF, the comment thread, the terms request and the confirm
     * action unreachable. The list rendered, and nothing on it could be opened.
     *
     * Safe to expose: it is an opaque uuid, every route re-scopes by the session's own
     * customer id, and another customer's record still answers 404 rather than 403. The
     * line ids below have always been projected for exactly this reason.
     */
    id: loaded.id,
    reference: loaded.reference,
    customerId: loaded.customerId,
    customerName: loaded.customerName,
    currency: loaded.currency,
    status: loaded.negotiationStatus,
    stage: loaded.stage,
    validUntil: loaded.validUntil,
    createdAt: loaded.createdAt,
    lastActivityAt: loaded.lastActivityAt,
    promisedDeliveryDate: loaded.promisedDeliveryDate,
    terms: loaded.customerTerms,
    lineCount: lines.length,
    lines,
    totals: {
      subtotal: loaded.totals.subtotal,
      savings: loaded.totals.savings,
      tax: loaded.totals.tax,
      grandTotal: loaded.totals.grandTotal,
      oneTimeTotal: loaded.totals.oneTimeTotal,
      recurringTotal: loaded.totals.recurringTotal,
      effectiveDiscountPct: loaded.totals.effectiveDiscountPct,
      // `cost`, `margin` and `marginPct` are on `loaded.totals` and are deliberately
      // NOT copied across.
    },
    counterDiscountPct: loaded.counterDiscountPct,
    counterJustification: loaded.counterJustification,
    messageCount,
    unreadFromSeller: lastComment?.role === 'seller',
    ...capabilities,
    awaitingSellerReply: loaded.awaitingSeller,
    isDecided: loaded.stage === 'confirmed' || loaded.stage === 'lost',
    statusNote: statusNoteFor(loaded),
  };
}
