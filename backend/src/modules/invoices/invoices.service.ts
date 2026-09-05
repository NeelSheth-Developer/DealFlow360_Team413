import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  customers,
  invoiceLines,
  invoices,
  payments,
  quotations,
  type InvoiceStatus,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { emailInvoiceIssued, emailPaymentRecorded } from '../../lib/emails.js';
import { formatDate } from '../../lib/billing-math.js';
import { exceeds, money, num, round2 } from '../../lib/money.js';
import { notify } from '../../lib/notify.js';
import { ApiError } from '../../utils/api-error.js';
import type { ListInvoicesQuery, RecordPaymentInput } from '../billing/billing.schemas.js';

/**
 * Invoices and payments.
 *
 * `POST /invoices/:id/payments` is the most security-sensitive endpoint in the API and
 * enforces six things, each for a specific reason:
 *
 *   1. finance / admin only — whoever sold the deal must not be the person who
 *      confirms the cash arrived. This is separation of duties, not role decoration.
 *   2. The invoice must be issued. Recording money against a draft means recording it
 *      against something the customer has never been asked to pay.
 *   3. No overpayment. A payment above the balance is a data-entry error every time.
 *   4. The actor is the server's view of who called, never a client-supplied name.
 *   5. Full settlement moves the quotation to `confirmed`, closing the loop.
 *   6. An idempotency key makes a double-click or a retry safe.
 *
 * `amountPaid` and `balanceRemaining` are DERIVED from the payment rows on every read
 * and never stored. A stored balance that drifts from its ledger is worse than no
 * balance at all.
 */

export async function listInvoices(query: ListInvoicesQuery) {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(invoices.status, query.status));
  if (query.customerId) filters.push(eq(invoices.customerId, query.customerId));
  if (query.quotationId) filters.push(eq(invoices.quotationId, query.quotationId));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;

  const [rows, [totals]] = await Promise.all([
    db
      .select({ id: invoices.id })
      .from(invoices)
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(invoices).where(where),
  ]);

  const data = await Promise.all(rows.map((row) => getInvoice(row.id)));
  const total = totals?.total ?? 0;

  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}

export async function getInvoice(id: string) {
  const [row] = await db
    .select({
      invoice: invoices,
      customerName: customers.name,
      customerEmail: customers.email,
      customerContactName: customers.contactName,
      quotationRef: quotations.reference,
    })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .innerJoin(quotations, eq(quotations.id, invoices.quotationId))
    .where(eq(invoices.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Invoice not found');

  const [lines, paymentRows] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, id)),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(desc(payments.paidOn)),
  ]);

  const amountPaid = round2(paymentRows.reduce((sum, payment) => sum + num(payment.amount), 0));
  const total = num(row.invoice.total);
  const balanceRemaining = round2(total - amountPaid);

  return {
    id: row.invoice.id,
    reference: row.invoice.reference,
    quotationId: row.invoice.quotationId,
    quotationReference: row.quotationRef,
    customerId: row.invoice.customerId,
    customerName: row.customerName,
    currency: row.invoice.currency,
    status: deriveStatus(row.invoice.status, amountPaid, balanceRemaining),
    lines: lines.map((line) => ({
      lineId: line.lineId,
      productName: line.productName,
      qty: line.qty,
      unitPrice: num(line.unitPrice),
      discountPct: num(line.discountPct),
      taxPct: num(line.taxPct),
      total: num(line.total),
    })),
    subtotal: num(row.invoice.subtotal),
    tax: num(row.invoice.tax),
    total,
    amountPaid,
    balanceRemaining,
    issueDate: row.invoice.issueDate,
    dueDate: row.invoice.dueDate,
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      invoiceId: payment.invoiceId,
      amount: num(payment.amount),
      method: payment.method,
      reference: payment.reference,
      recordedById: payment.recordedById,
      recordedByName: payment.recordedByName,
      date: payment.paidOn,
      notes: payment.notes,
    })),
  };
}

/**
 * A draft or sent invoice takes its status from the payment ledger once money has
 * arrived. Derived on read rather than trusted from the column, so the two can never
 * disagree.
 */
function deriveStatus(
  stored: InvoiceStatus,
  amountPaid: number,
  balanceRemaining: number,
): InvoiceStatus {
  if (stored === 'draft') return 'draft';
  if (balanceRemaining <= 0) return 'paid';
  if (amountPaid > 0) return 'partially_paid';
  return stored;
}

/** Draft to sent. Also moves the quotation from fulfillment to billed. */
export async function sendInvoice(actor: AuditActor, id: string) {
  const invoice = await getInvoice(id);

  if (invoice.status !== 'draft') {
    throw ApiError.conflict(
      'INVOICE_ALREADY_SENT',
      `Invoice ${invoice.reference} has already been issued.`,
    );
  }

  await db
    .update(invoices)
    .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(eq(invoices.id, id));

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, invoice.quotationId))
    .limit(1);

  if (quotation && quotation.stage === 'fulfillment') {
    await db
      .update(quotations)
      .set({ stage: 'billed', lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, quotation.id));
  }

  await audit({
    entityType: 'invoice',
    entityId: id,
    entityRef: invoice.reference,
    action: `Invoice ${invoice.reference} issued`,
    actor,
    meta: { quotationId: invoice.quotationId, total: invoice.total },
  });

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, invoice.customerId))
    .limit(1);

  if (customer) {
    await emailInvoiceIssued({
      to: customer.email,
      contactName: customer.contactName ?? customer.name,
      invoiceRef: invoice.reference,
      quotationRef: invoice.quotationReference,
      currency: invoice.currency,
      total: invoice.total,
      dueDate: invoice.dueDate,
    });
  }

  return getInvoice(id);
}

/**
 * Records a payment. See the six rules at the top of this file.
 *
 * `idempotencyKey` comes from the `Idempotency-Key` header. When a key is replayed the
 * existing payment is returned unchanged rather than a second one being written —
 * a duplicate payment is the one mistake here that really hurts.
 */
export async function recordPayment(
  actor: AuditActor,
  id: string,
  input: RecordPaymentInput,
  idempotencyKey: string | null,
) {
  if (idempotencyKey) {
    const [replay] = await db
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.idempotencyKey, idempotencyKey))
      .limit(1);

    if (replay) {
      const invoice = await getInvoice(id);
      const existing = invoice.payments.find((payment) => payment.id === replay.id);
      return {
        invoice,
        payment: existing ?? null,
        status: invoice.status,
        quotationStage: await stageOf(invoice.quotationId),
        replayed: true,
      };
    }
  }

  const invoice = await getInvoice(id);

  if (invoice.status === 'draft') {
    throw ApiError.conflict(
      'INVOICE_NOT_ISSUED',
      `Invoice ${invoice.reference} is still a draft. Issue it before recording a payment.`,
    );
  }

  if (exceeds(input.amount, invoice.balanceRemaining)) {
    throw ApiError.unprocessable(
      'OVERPAYMENT',
      `That is more than the outstanding balance of ${invoice.currency} ${invoice.balanceRemaining.toFixed(2)}.`,
      { balanceRemaining: invoice.balanceRemaining, attempted: input.amount },
    );
  }

  const [payment] = await db
    .insert(payments)
    .values({
      invoiceId: id,
      amount: money(input.amount),
      method: input.method,
      reference: input.reference,
      paidOn: input.date ?? formatDate(new Date()),
      notes: input.notes,
      // Never trusted from the client — rule 4.
      recordedById: actor.id ?? '',
      recordedByName: actor.name,
      idempotencyKey,
    })
    .returning();

  const updated = await getInvoice(id);
  const settled = updated.balanceRemaining <= 0;

  await db
    .update(invoices)
    .set({
      status: settled ? 'paid' : 'partially_paid',
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id));

  if (settled) {
    await db
      .update(quotations)
      .set({ stage: 'confirmed', lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(quotations.id, invoice.quotationId));
  }

  await audit({
    entityType: 'invoice',
    entityId: id,
    entityRef: invoice.reference,
    action: `Payment recorded on ${invoice.reference}`,
    actor,
    meta: {
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      balanceAfter: updated.balanceRemaining,
      settled,
    },
  });

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, invoice.customerId))
    .limit(1);

  if (customer) {
    await emailPaymentRecorded({
      to: customer.email,
      contactName: customer.contactName ?? customer.name,
      invoiceRef: invoice.reference,
      currency: invoice.currency,
      amount: input.amount,
      balanceRemaining: updated.balanceRemaining,
      method: input.method,
    });
  }

  const [quotation] = await db
    .select({ ownerId: quotations.ownerId, reference: quotations.reference })
    .from(quotations)
    .where(eq(quotations.id, invoice.quotationId))
    .limit(1);

  if (quotation) {
    await notify({
      userIds: [quotation.ownerId],
      type: 'system',
      title: settled
        ? `${quotation.reference} is paid in full`
        : `Payment received on ${invoice.reference}`,
      body: `${invoice.currency} ${input.amount.toFixed(2)} recorded by ${actor.name}`,
      entityType: 'invoice',
      entityId: id,
      entityRef: invoice.reference,
      view: 'billing',
    });
  }

  const final = await getInvoice(id);

  return {
    invoice: final,
    payment: payment
      ? {
          id: payment.id,
          invoiceId: payment.invoiceId,
          amount: num(payment.amount),
          method: payment.method,
          reference: payment.reference,
          recordedById: payment.recordedById,
          recordedByName: payment.recordedByName,
          date: payment.paidOn,
          notes: payment.notes,
        }
      : null,
    status: final.status,
    quotationStage: await stageOf(invoice.quotationId),
    replayed: false,
  };
}

async function stageOf(quotationId: string): Promise<string | null> {
  const [row] = await db
    .select({ stage: quotations.stage })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  return row?.stage ?? null;
}
