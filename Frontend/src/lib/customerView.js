import { lineSubtotal, lineTotal, quoteTotals } from './pricing';
import { round2 } from './utils';

/**
 * Builds the ONLY object the customer-facing screens are allowed to render.
 *
 * This is an allow-list: a brand new object is constructed from named safe
 * fields rather than spreading the quotation and deleting things. Cost prices,
 * margins, risk scores, ceilings, internal notes, owner identity and approval
 * detail are never present in the result.
 *
 * Note for whoever wires the backend: re-apply this filter server-side. In a
 * frontend-only build the whole store is readable in devtools, so this is
 * presentation scoping, not access control.
 */
export function toCustomerView(quotation, { products = [], plans = [] } = {}) {
  if (!quotation) return null;

  const totals = quoteTotals(quotation);
  const orderFactor = 1 - (Number(quotation.orderDiscountPct) || 0) / 100;

  const lines = (quotation.lines ?? []).map((line) => {
    const product = products.find((p) => p.id === line.productId);
    const plan = line.planId ? plans.find((p) => p.id === line.planId) : null;
    const gross = lineSubtotal(line);
    const net = lineTotal(line) * orderFactor;

    return {
      id: line.id,
      productName: line.productName,
      description: product?.description ?? '',
      unit: product?.unit ?? 'unit',
      qty: line.qty,
      unitPrice: round2(line.unitPrice),
      // Customer-friendly framing: show the saving, never the internal ceiling.
      savingsAmount: round2(gross - net),
      discountPct: round2(line.discountPct),
      lineTotal: round2(net),
      isRecurring: Boolean(line.isSubscription),
      cadence: plan?.cadence ?? null,
      planName: plan?.name ?? null,
      comments: (line.comments ?? []).map((c) => ({
        id: c.id,
        author: c.author,
        // Roles collapse to a coarse label — the customer never learns who is
        // internally a manager versus finance.
        side: c.role === 'customer' ? 'customer' : 'seller',
        message: c.message,
        at: c.at,
      })),
    };
  });

  return {
    reference: quotation.id,
    customerId: quotation.customerId,
    customerName: quotation.customerName,
    currency: quotation.currency ?? 'INR',
    status: quotation.negotiationStatus ?? 'sent',
    stage: publicStage(quotation),
    validUntil: quotation.validUntil,
    createdAt: quotation.createdAt,
    lastActivityAt: quotation.lastActivityAt,
    promisedDeliveryDate: quotation.promisedDeliveryDate,
    terms: quotation.customerTerms ?? '',
    lines,
    lineCount: lines.length,
    totals: {
      subtotal: totals.subtotal,
      savings: round2(totals.lineDiscountAmount + totals.orderDiscountAmount),
      tax: totals.tax,
      grandTotal: totals.grandTotal,
      oneTimeTotal: totals.oneTimeTotal,
      recurringTotal: totals.recurringTotal,
      effectiveDiscountPct: totals.effectiveDiscountPct,
    },
    counterDiscountPct: quotation.counterDiscountPct ?? null,
    counterJustification: quotation.counterJustification ?? null,

    messageCount: lines.reduce((n, l) => n + l.comments.length, 0),
    unreadFromSeller: lines.some((l) => {
      const last = l.comments[l.comments.length - 1];
      return last && last.side === 'seller';
    }),

    // Three independent capabilities rather than one blunt "locked" flag.
    canMessage: canMessage(quotation),
    canProposeTerms: canProposeTerms(quotation),
    canConfirm: canConfirm(quotation),
    awaitingSellerReply: Boolean(quotation.awaitingSeller),
    statusNote: customerStatusNote(quotation),
    isDecided: isDecided(quotation),
  };
}

/**
 * Capability model.
 *
 * A customer who has asked a question must still be able to talk and still be
 * able to accept — being mid-conversation is not a reason to freeze them out.
 * Only two things genuinely close the door: the quotation is under internal
 * review, or it has already been decided.
 */

/** Terms are settled or the deal has moved on — nothing left to negotiate. */
export function isDecided(quotation) {
  return ['approved', 'fulfillment', 'billed', 'confirmed', 'lost'].includes(quotation.stage);
}

/** Sitting with an internal approver right now. */
export function isUnderInternalReview(quotation) {
  return quotation.stage === 'pending_approval';
}

/** Messaging stays open right through internal review — questions never hurt. */
export function canMessage(quotation) {
  return !['lost'].includes(quotation.stage);
}

/** Proposing new terms only makes sense while the quotation is still open. */
export function canProposeTerms(quotation) {
  return ['sent', 'under_negotiation'].includes(quotation.stage);
}

/** Accepting is possible while open, even with a question outstanding. */
export function canConfirm(quotation) {
  return ['sent', 'under_negotiation'].includes(quotation.stage);
}

/** Plain-language status line shown at the top of the customer's view. */
export function customerStatusNote(quotation) {
  if (quotation.stage === 'pending_approval') {
    return {
      tone: 'info',
      text: 'Your requested terms are with our team for approval. You can still send questions here, and we will confirm as soon as it clears.',
    };
  }
  if (['approved', 'fulfillment', 'billed'].includes(quotation.stage)) {
    return { tone: 'success', text: 'Terms are agreed and this order is being processed.' };
  }
  if (quotation.stage === 'confirmed') {
    return { tone: 'success', text: 'This quotation is confirmed. Thank you.' };
  }
  if (quotation.stage === 'lost') {
    return { tone: 'danger', text: 'This quotation is closed.' };
  }
  if (quotation.awaitingSeller) {
    return {
      tone: 'warning',
      text: 'We have your request and are reviewing it. You can keep messaging, or accept the current terms at any time.',
    };
  }
  if (quotation.negotiationStatus === 'under_negotiation') {
    return {
      tone: 'warning',
      text: 'We have replied to your request. Review the updated terms below.',
    };
  }
  return null;
}

/**
 * The customer sees a simplified lifecycle. Internal stages like "fulfillment"
 * or "billed" collapse into "confirmed". "pending_approval" surfaces honestly as
 * "pending re-approval" so the customer understands why their confirmation is
 * not yet complete.
 */
export function publicStage(quotation) {
  switch (quotation.stage) {
    case 'draft':
      return 'draft';
    case 'pending_approval':
      return 'pending_reapproval';
    case 'sent':
    case 'under_negotiation':
      return quotation.negotiationStatus === 'under_negotiation' ? 'under_negotiation' : 'sent';
    case 'approved':
    case 'fulfillment':
    case 'billed':
    case 'confirmed':
      return 'confirmed';
    case 'lost':
      return 'closed';
    default:
      return 'sent';
  }
}

/** A quotation is only visible to a customer once it has been shared with them. */
export function isSharedWithCustomer(quotation) {
  return Boolean(quotation) && quotation.negotiationStatus !== 'none' && quotation.stage !== 'draft';
}

export const CUSTOMER_STATUS_META = {
  draft: { label: 'Draft', tone: 'text-ink-soft', bg: 'bg-ink/8' },
  sent: { label: 'Awaiting your review', tone: 'text-state-info', bg: 'bg-state-info/14' },
  under_negotiation: {
    label: 'Under Negotiation',
    tone: 'text-accent-amber',
    bg: 'bg-accent-amber/16',
  },
  pending_reapproval: {
    label: 'Pending Re-approval',
    tone: 'text-brand-700',
    bg: 'bg-brand-500/16',
  },
  confirmed: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  closed: { label: 'Closed', tone: 'text-state-danger', bg: 'bg-state-danger/12' },
};
