/**
 * Invoices and payments — API-REFERENCE §15 (5 endpoints).
 *
 *   GET  /invoices             any staff · ?status=&customerId=&quotationId=&page=&pageSize=
 *   GET  /invoices/:id         any staff
 *   POST /invoices/:id/send    FINANCE, ADMIN
 *   POST /invoices/:id/payments FINANCE, ADMIN  ← most security-sensitive endpoint
 *   GET  /invoices/:id/pdf     any staff
 *
 * `lines` contains ONE-TIME LINES ONLY — recurring charges bill on their own schedule,
 * and invoice lines are a snapshot taken at build time. An invoice is a record; it does
 * not follow later edits to the quotation.
 *
 * `amountPaid`, `balanceRemaining` and `status` are DERIVED from the payment rows on
 * every read and never stored. A stored balance that drifts from its ledger is worse
 * than no balance at all.
 */

import { api, buildQuery } from './apiClient';

export const PAYMENT_METHODS = ['card', 'bank_transfer', 'cheque', 'upi', 'other'];

/** Each row is the full §15.2 object, so a list screen needs no follow-up per invoice. */
export function listInvoices({ status, customerId, quotationId, page = 1, pageSize = 25 } = {}) {
  return api.list(`/invoices${buildQuery({ status, customerId, quotationId, page, pageSize })}`);
}

export function getInvoice(invoiceId) {
  return api.get(`/invoices/${encodeURIComponent(invoiceId)}`);
}

/**
 * Issue the invoice. Empty body. draft → sent, and moves the quotation
 * fulfillment → billed. Emails the customer. 409 INVOICE_ALREADY_SENT on a second call.
 *
 * Finance / admin only.
 */
export function sendInvoice(invoiceId) {
  return api.post(`/invoices/${encodeURIComponent(invoiceId)}/send`);
}

/**
 * Record a payment. The most security-sensitive endpoint in the API — it enforces six
 * things, and the client's job is to not fight any of them:
 *
 * 1. FINANCE / ADMIN ONLY. Whoever sold the deal must not confirm the cash arrived.
 *    Separation of duties, not role decoration.
 * 2. The invoice must be issued → 409 INVOICE_NOT_ISSUED against a draft.
 * 3. No overpayment: amount ≤ balanceRemaining → 422 OVERPAYMENT naming the figure.
 * 4. The actor is the SERVER's view of who called. A client-supplied name is never
 *    accepted, which is why there is no `recordedBy` field here.
 * 5. Full settlement closes the deal — the quotation moves to `confirmed`.
 * 6. An Idempotency-Key header makes a retry safe.
 *
 * The key is generated per call and passed through, so a network retry or a double
 * click cannot write a second payment. `replayed: true` in the response means the key
 * had been seen and the ORIGINAL payment is being returned unchanged.
 *
 * @returns {Promise<{invoice, payment, status, quotationStage, replayed}>}
 */
export function recordPayment(invoiceId, { amount, method, reference, date, notes } = {}) {
  const body = { amount: Number(amount), method, reference };
  if (date) body.date = date;
  if (notes) body.notes = notes;

  return api.postWithHeaders(`/invoices/${encodeURIComponent(invoiceId)}/payments`, body, {
    'Idempotency-Key': newIdempotencyKey(),
  });
}

/**
 * A fresh key per payment attempt.
 *
 * `crypto.randomUUID` is unavailable over plain HTTP on some hosts, so there is a
 * fallback — a missing key would silently drop the replay protection, which is the one
 * thing this must not do quietly.
 */
function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Invoice PDF. One-time lines only, matching §15.2. Returns a hosted Cloudinary URL
 * when configured, otherwise streams the file.
 */
export function getInvoicePdf(invoiceId) {
  return api.pdf(`/invoices/${encodeURIComponent(invoiceId)}/pdf`);
}
