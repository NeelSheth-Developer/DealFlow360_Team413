import { lineSubtotal, lineTotal, quoteTotals } from './pricing';
import { round2 } from './utils';

/**
 * Builds the ONLY object the customer portal is allowed to render.
 *
 * This is an allow-list, not a deny-list: we construct a brand new object with
 * named safe fields rather than spreading the quotation and deleting things.
 * Cost prices, margins, risk scores, ceilings, internal notes, owner identity
 * and approval detail never make it into the returned value.
 *
 * Note for anyone wiring a real backend later: this filter must be re-applied
 * server-side. In a frontend-only build the full store is readable in devtools,
 * so this is presentation scoping, not access control.
 */
export function toPortalView(quotation, { products = [], plans = [] } = {}) {
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
      // Customer-friendly framing: show the saving, not the internal ceiling.
      savingsAmount: round2(gross - net),
      discountPct: round2(line.discountPct),
      lineTotal: round2(net),
      isRecurring: Boolean(line.isSubscription),
      cadence: plan?.cadence ?? null,
      planName: plan?.name ?? null,
      comments: (line.comments ?? []).map((c) => ({
        id: c.id,
        author: c.author,
        // Roles are collapsed to a coarse label — the customer never learns
        // who internally is a manager vs finance.
        side: c.role === 'customer' ? 'customer' : 'seller',
        message: c.message,
        at: c.at,
      })),
    };
  });

  return {
    reference: quotation.id,
    customerName: quotation.customerName,
    currency: quotation.currency ?? 'INR',
    status: quotation.negotiationStatus ?? 'sent',
    stage: publicStage(quotation),
    validUntil: quotation.validUntil,
    createdAt: quotation.createdAt,
    promisedDeliveryDate: quotation.promisedDeliveryDate,
    terms: quotation.customerTerms ?? '',
    lines,
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
    isLocked: isPortalLocked(quotation),
    lockReason: portalLockReason(quotation),
  };
}

/**
 * The customer sees a simplified lifecycle. Internal stages like
 * "fulfillment" or "billed" collapse into "confirmed" — and crucially,
 * "pending_approval" surfaces as an honest "pending re-approval" state so the
 * customer understands why their confirmation hasn't completed.
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

export function isPortalLocked(quotation) {
  if (['confirmed', 'billed', 'fulfillment', 'lost'].includes(quotation.stage)) return true;
  if (quotation.stage === 'pending_approval') return true;
  // Once a request is submitted the customer waits for the seller to respond.
  if (quotation.negotiationStatus === 'under_negotiation' && quotation.awaitingSeller) return true;
  return false;
}

export function portalLockReason(quotation) {
  if (quotation.stage === 'pending_approval') {
    return 'Your requested terms are being reviewed internally. We will be in touch shortly.';
  }
  if (['fulfillment', 'billed', 'confirmed'].includes(quotation.stage)) {
    return 'This quotation is confirmed and is now being processed.';
  }
  if (quotation.stage === 'lost') {
    return 'This quotation is closed.';
  }
  if (quotation.negotiationStatus === 'under_negotiation' && quotation.awaitingSeller) {
    return 'Your request has been sent. We are reviewing it and will respond shortly.';
  }
  return null;
}

export const PORTAL_STATUS_META = {
  draft: { label: 'Draft', tone: 'text-ink-soft', bg: 'bg-ink/8' },
  sent: { label: 'Sent', tone: 'text-state-info', bg: 'bg-state-info/14' },
  under_negotiation: { label: 'Under Negotiation', tone: 'text-accent-amber', bg: 'bg-accent-amber/16' },
  pending_reapproval: { label: 'Pending Re-approval', tone: 'text-brand-700', bg: 'bg-brand-500/16' },
  confirmed: { label: 'Confirmed', tone: 'text-state-success', bg: 'bg-state-success/16' },
  closed: { label: 'Closed', tone: 'text-state-danger', bg: 'bg-state-danger/12' },
};
