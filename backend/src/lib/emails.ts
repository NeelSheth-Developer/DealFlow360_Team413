import { deliver, deliverAll, formatAmount, type DetailRow } from './mailer.js';

/**
 * Every transactional email the platform sends, in one file.
 *
 * Keeping the copy together rather than scattering it through the services is
 * deliberate: the wording is a product surface, and it is much easier to keep a
 * consistent voice when all of it is visible at once. Each function is a thin shape
 * over `deliver`, so a service calls one line and never assembles HTML.
 *
 * All of them are fire-and-forget. A failed send is logged, never thrown — the
 * business action that triggered it has already succeeded.
 */

// ---------------------------------------------------------------------------
// Customer-facing
// ---------------------------------------------------------------------------

/**
 * A quotation has been shared to the portal.
 *
 * There is no link and no token in this email: access is by authenticated account
 * only. When the customer has not registered yet, the copy tells them to sign up with
 * this address rather than handing them a way in.
 */
export async function emailQuotationShared(input: {
  to: string;
  contactName: string;
  companyName: string;
  reference: string;
  currency: string;
  grandTotal: number;
  validUntil: string | null;
  needsRegistration: boolean;
}) {
  const rows: DetailRow[] = [
    { label: 'Reference', value: input.reference },
    { label: 'Total', value: formatAmount(input.grandTotal, input.currency) },
  ];
  if (input.validUntil) rows.push({ label: 'Valid until', value: input.validUntil });

  return deliver({
    to: input.to,
    subject: `Your quotation ${input.reference} is ready`,
    heading: `Quotation ${input.reference}`,
    lead: `Hi ${input.contactName}, we have prepared a quotation for ${input.companyName}. You can review it, ask questions on any line, propose different terms, or confirm it — all from your DealFlow360 portal.`,
    rows,
    note: input.needsRegistration
      ? 'You do not have a portal account yet. Sign up at the customer portal using this email address and this quotation will be waiting for you.'
      : 'Sign in to your portal to review the full breakdown.',
  });
}

/** A rep has replied to a question the customer asked on a line. */
export async function emailSellerReplied(input: {
  to: string;
  contactName: string;
  reference: string;
  productName: string;
  message: string;
}) {
  return deliver({
    to: input.to,
    subject: `New reply on quotation ${input.reference}`,
    heading: 'You have a reply',
    lead: `Hi ${input.contactName}, we have answered your question on ${input.reference}.`,
    rows: [
      { label: 'Line', value: input.productName },
      { label: 'Reply', value: input.message },
    ],
    note: 'Sign in to your portal to continue the conversation or confirm the quotation.',
  });
}

/** Terms changed and the quotation is back with the customer. */
export async function emailTermsUpdated(input: {
  to: string;
  contactName: string;
  reference: string;
  currency: string;
  grandTotal: number;
}) {
  return deliver({
    to: input.to,
    subject: `Updated terms on quotation ${input.reference}`,
    heading: 'Your quotation has been updated',
    lead: `Hi ${input.contactName}, we have applied the changes you asked for on ${input.reference}. The revised terms are ready for you to review.`,
    rows: [
      { label: 'Reference', value: input.reference },
      { label: 'New total', value: formatAmount(input.grandTotal, input.currency) },
    ],
    note: 'Sign in to your portal to accept the updated terms.',
  });
}

/** The customer's confirmation landed and needs internal sign-off before it is final. */
export async function emailConfirmationPendingApproval(input: {
  to: string;
  contactName: string;
  reference: string;
}) {
  return deliver({
    to: input.to,
    subject: `We have received your confirmation for ${input.reference}`,
    heading: 'Confirmation received',
    lead: `Hi ${input.contactName}, thank you for confirming ${input.reference}. The agreed terms need a final internal review before we can release the order, and we will write to you as soon as that is done.`,
    note: 'No action is needed from you.',
  });
}

/** Fully confirmed — nothing further required. */
export async function emailOrderConfirmed(input: {
  to: string;
  contactName: string;
  reference: string;
  currency: string;
  grandTotal: number;
}) {
  return deliver({
    to: input.to,
    subject: `Order confirmed — ${input.reference}`,
    heading: 'Your order is confirmed',
    lead: `Hi ${input.contactName}, ${input.reference} is confirmed and moving to fulfillment. Thank you for your business.`,
    rows: [
      { label: 'Reference', value: input.reference },
      { label: 'Total', value: formatAmount(input.grandTotal, input.currency) },
    ],
  });
}

/** An invoice has been issued. */
export async function emailInvoiceIssued(input: {
  to: string;
  contactName: string;
  invoiceRef: string;
  quotationRef: string;
  currency: string;
  total: number;
  dueDate: string | null;
}) {
  const rows: DetailRow[] = [
    { label: 'Invoice', value: input.invoiceRef },
    { label: 'Order', value: input.quotationRef },
    { label: 'Amount due', value: formatAmount(input.total, input.currency) },
  ];
  if (input.dueDate) rows.push({ label: 'Due date', value: input.dueDate });

  return deliver({
    to: input.to,
    subject: `Invoice ${input.invoiceRef} from DealFlow360`,
    heading: `Invoice ${input.invoiceRef}`,
    lead: `Hi ${input.contactName}, your invoice for ${input.quotationRef} is ready.`,
    rows,
    note: 'The full breakdown is available in your portal.',
  });
}

/** A payment was recorded — receipt, including whatever is still outstanding. */
export async function emailPaymentRecorded(input: {
  to: string;
  contactName: string;
  invoiceRef: string;
  currency: string;
  amount: number;
  balanceRemaining: number;
  method: string;
}) {
  const settled = input.balanceRemaining <= 0;

  return deliver({
    to: input.to,
    subject: settled
      ? `Payment received — ${input.invoiceRef} is settled`
      : `Payment received for ${input.invoiceRef}`,
    heading: settled ? 'Invoice settled' : 'Payment received',
    lead: `Hi ${input.contactName}, we have recorded your payment against ${input.invoiceRef}.`,
    rows: [
      { label: 'Amount', value: formatAmount(input.amount, input.currency) },
      { label: 'Method', value: input.method.replace(/_/g, ' ') },
      {
        label: settled ? 'Balance' : 'Still outstanding',
        value: formatAmount(Math.max(0, input.balanceRemaining), input.currency),
      },
    ],
    note: settled ? 'Nothing further is due. Thank you.' : undefined,
  });
}

/** A credit note or refund was issued. */
export async function emailCreditNoteIssued(input: {
  to: string;
  contactName: string;
  reference: string;
  quotationRef: string;
  currency: string;
  amount: number;
  type: string;
  reason: string;
}) {
  const isRefund = input.type === 'refund';

  return deliver({
    to: input.to,
    subject: `${isRefund ? 'Refund' : 'Credit note'} ${input.reference} issued`,
    heading: isRefund ? 'A refund has been issued' : 'A credit note has been issued',
    lead: `Hi ${input.contactName}, we have issued a ${isRefund ? 'refund' : 'credit note'} against ${input.quotationRef}.`,
    rows: [
      { label: 'Reference', value: input.reference },
      { label: 'Amount', value: formatAmount(input.amount, input.currency) },
      { label: 'Reason', value: input.reason },
    ],
  });
}

// ---------------------------------------------------------------------------
// Staff-facing
// ---------------------------------------------------------------------------

/** A quotation needs this person's approval. Sent to every approver on the step. */
export async function emailApprovalRequested(input: {
  recipients: string[];
  reference: string;
  customerName: string;
  ownerName: string;
  currency: string;
  grandTotal: number;
  score: number;
  worstSingleOverage: number;
  violationCount: number;
  label: string;
}) {
  return deliverAll(input.recipients, (to) => ({
    to,
    subject: `${input.reference} needs your approval`,
    heading: `${input.reference} is waiting on you`,
    lead: `${input.ownerName} has submitted a quotation for ${input.customerName} that exceeds the discount ceilings and needs sign-off.`,
    rows: [
      { label: 'Customer', value: input.customerName },
      { label: 'Value', value: formatAmount(input.grandTotal, input.currency) },
      { label: 'Blended risk', value: `${input.score.toFixed(2)} pts` },
      { label: 'Worst line', value: `${input.worstSingleOverage.toFixed(2)} pts over its ceiling` },
      {
        label: 'Lines over',
        value: `${input.violationCount} of the order's lines breach a ceiling`,
      },
      { label: 'Route', value: input.label },
    ],
    note: 'Open the approval screen to see the per-line breakdown before you decide.',
  }));
}

/** The chain finished. Sent to the owning rep. */
export async function emailApprovalApproved(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  approverName: string;
  comment: string | null;
}) {
  const rows: DetailRow[] = [
    { label: 'Customer', value: input.customerName },
    { label: 'Approved by', value: input.approverName },
  ];
  if (input.comment) rows.push({ label: 'Comment', value: input.comment });

  return deliver({
    to: input.to,
    subject: `${input.reference} approved`,
    heading: `${input.reference} has been approved`,
    lead: `Hi ${input.ownerName}, your quotation for ${input.customerName} cleared its approval chain and is ready to move to fulfillment.`,
    rows,
  });
}

/** Rejected outright — the deal is marked lost. */
export async function emailApprovalRejected(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  approverName: string;
  reason: string;
}) {
  return deliver({
    to: input.to,
    subject: `${input.reference} was rejected`,
    heading: `${input.reference} has been rejected`,
    lead: `Hi ${input.ownerName}, your quotation for ${input.customerName} was rejected and the deal has been marked lost.`,
    rows: [
      { label: 'Rejected by', value: input.approverName },
      { label: 'Reason', value: input.reason },
    ],
  });
}

/** Returned for revision — back to draft, chain cleared. */
export async function emailApprovalReturned(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  approverName: string;
  reason: string;
}) {
  return deliver({
    to: input.to,
    subject: `${input.reference} returned for revision`,
    heading: `${input.reference} needs changes`,
    lead: `Hi ${input.ownerName}, your quotation for ${input.customerName} has been returned to draft so you can revise it.`,
    rows: [
      { label: 'Returned by', value: input.approverName },
      { label: 'What to change', value: input.reason },
    ],
    note: 'Resubmitting re-scores the quotation from scratch, so the approval route may change.',
  });
}

/** The customer wrote something on a line. */
export async function emailCustomerMessage(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  productName: string;
  message: string;
}) {
  return deliver({
    to: input.to,
    subject: `${input.customerName} commented on ${input.reference}`,
    heading: 'New message from your customer',
    lead: `Hi ${input.ownerName}, ${input.customerName} has left a question on ${input.reference}.`,
    rows: [
      { label: 'Line', value: input.productName },
      { label: 'Message', value: input.message },
    ],
    note: 'They are waiting on a reply.',
  });
}

/** The customer proposed different terms. */
export async function emailCounterProposed(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  counterDiscountPct: number | null;
  justification: string | null;
}) {
  const rows: DetailRow[] = [{ label: 'Customer', value: input.customerName }];
  if (input.counterDiscountPct !== null) {
    rows.push({ label: 'Requested discount', value: `${input.counterDiscountPct}%` });
  }
  if (input.justification) rows.push({ label: 'Their reasoning', value: input.justification });

  return deliver({
    to: input.to,
    subject: `${input.customerName} proposed new terms on ${input.reference}`,
    heading: 'Counter-proposal received',
    lead: `Hi ${input.ownerName}, ${input.customerName} has asked for different terms on ${input.reference}.`,
    rows,
    note: 'Applying their counter will re-score the quotation and may change who has to approve it.',
  });
}

/**
 * The customer confirmed terms that breach a ceiling, so the quotation re-entered the
 * approval flow with no rep action. Sent to the approvers and the owning rep.
 */
export async function emailReapprovalTriggered(input: {
  recipients: string[];
  reference: string;
  customerName: string;
  score: number;
  requiredApprovers: number;
  label: string;
}) {
  return deliverAll(input.recipients, (to) => ({
    to,
    subject: `${input.reference} re-entered approval after customer confirmation`,
    heading: 'Re-approval triggered by the customer',
    lead: `${input.customerName} confirmed ${input.reference} on negotiated terms that exceed the discount ceilings, so it has automatically returned to the approval chain.`,
    rows: [
      { label: 'Blended risk', value: `${input.score.toFixed(2)} pts` },
      { label: 'Approvers needed', value: String(input.requiredApprovers) },
      { label: 'Route', value: input.label },
    ],
    note: 'No rep action was required for this — the customer confirming the terms is what triggered it.',
  }));
}

/** A manager nudged the owning rep about a stalled or risky deal. */
export async function emailNudge(input: {
  to: string;
  ownerName: string;
  reference: string;
  customerName: string;
  managerName: string;
  detail: string;
}) {
  return deliver({
    to: input.to,
    subject: `Nudge: ${input.reference} needs attention`,
    heading: `${input.reference} needs attention`,
    lead: `Hi ${input.ownerName}, ${input.managerName} flagged your deal with ${input.customerName}.`,
    rows: [{ label: 'Why', value: input.detail }],
  });
}

/** An alert was escalated to every manager. */
export async function emailEscalation(input: {
  recipients: string[];
  reference: string;
  customerName: string;
  ownerName: string;
  title: string;
  detail: string;
}) {
  return deliverAll(input.recipients, (to) => ({
    to,
    subject: `Escalated: ${input.reference}`,
    heading: input.title,
    lead: `${input.reference} (${input.customerName}, owned by ${input.ownerName}) has been escalated for management attention.`,
    rows: [{ label: 'Detail', value: input.detail }],
  }));
}

/** A quotation changed hands. */
export async function emailOwnerAssigned(input: {
  to: string;
  newOwnerName: string;
  reference: string;
  customerName: string;
  assignedByName: string;
}) {
  return deliver({
    to: input.to,
    subject: `${input.reference} has been assigned to you`,
    heading: 'A quotation was assigned to you',
    lead: `Hi ${input.newOwnerName}, ${input.assignedByName} has made you the owner of ${input.reference}.`,
    rows: [{ label: 'Customer', value: input.customerName }],
  });
}
