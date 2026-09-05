import { nextId, nowISO, round2 } from '@/lib/utils';
import { money, paymentMethodLabel, roleLabel } from '@/lib/format';
import {
  computeCancellation,
  computeProration,
  generateBillingSchedule,
  generateInvoice,
  invoiceBalances,
  nextInvoiceStatus,
} from '@/lib/billingEngine';

/**
 * Hybrid billing (spec B7) and invoicing/payments (spec B10).
 *
 * One-time lines produce an Invoice. Recurring lines produce their own billing
 * schedule. The two never merge — that separation is the point of the feature.
 */
export function createBillingSlice(set, get) {
  function planFor(line) {
    return get().subscriptionPlans.find((p) => p.id === line.planId) ?? null;
  }

  return {
    /** Builds the invoice (if missing) and all recurring schedules for a quote. */
    buildBilling(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return null;

      const oneTime = quote.lines.filter((l) => !l.isSubscription);
      const recurring = quote.lines.filter((l) => l.isSubscription);

      // --- recurring schedules
      const schedules = {};
      for (const line of recurring) {
        if (line.subscriptionStatus === 'cancelled') continue;
        const plan = planFor(line);
        schedules[line.id] = generateBillingSchedule(
          line,
          plan,
          line.subscriptionStartDate ?? quote.createdAt,
          12,
        );
      }

      set((state) => ({
        billingSchedules: { ...state.billingSchedules, [quoteId]: schedules },
      }));

      // --- one-time invoice
      let invoice = get().invoices.find((i) => i.quotationId === quoteId) ?? null;
      if (!invoice && oneTime.length) {
        invoice = generateInvoice(quote, oneTime, new Date(), 15);
        set((state) => ({ invoices: [invoice, ...state.invoices] }));
        get().logAudit({
          entityType: 'invoice',
          entityId: invoice.id,
          action: `Invoice drafted for ${quote.customerName}`,
          meta: { total: invoice.total, quotationId: quoteId },
        });
      }

      return { invoice, schedules };
    },

    getInvoiceForQuote(quoteId) {
      return get().invoices.find((i) => i.quotationId === quoteId) ?? null;
    },

    getInvoice(invoiceId) {
      return get().invoices.find((i) => i.id === invoiceId) ?? null;
    },

    getBillingSchedules(quoteId) {
      return get().billingSchedules[quoteId] ?? {};
    },

    // ----------------------------------------------- mid-cycle subscription
    /** Preview only — no mutation. Shown to the user before they commit. */
    previewSubscriptionChange(quoteId, lineId, newQty) {
      const quote = get().getQuotation(quoteId);
      const line = quote?.lines.find((l) => l.id === lineId);
      if (!line) return null;

      const plan = planFor(line);
      return {
        ...computeProration({
          line,
          oldQty: line.qty,
          newQty: Number(newQty) || 0,
          plan,
          changeDate: new Date(),
          cycleStartDate: line.subscriptionStartDate ?? quote.createdAt,
        }),
        plan,
        line,
        currency: quote.currency,
      };
    },

    applySubscriptionChange(quoteId, lineId, newQty) {
      const preview = get().previewSubscriptionChange(quoteId, lineId, newQty);
      const quote = get().getQuotation(quoteId);
      if (!preview || !quote) return { ok: false, error: 'Unable to price that change.' };

      get().updateLine(quoteId, lineId, { qty: Number(newQty) || 0 });

      // A credit means money owed back — record it in the ledger.
      if (preview.type === 'credit' && preview.amountNow < 0) {
        get().createCreditNote(quoteId, {
          lineId,
          amount: Math.abs(preview.amountNow),
          type: 'credit_note',
          reason: `Quantity reduced mid-cycle (${preview.explanation})`,
        });
      }

      get().buildBilling(quoteId);
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Subscription quantity changed on ${preview.line.productName}: ${preview.line.qty} → ${newQty}`,
        reason: preview.explanation,
        meta: {
          prorationRule: preview.plan?.prorationRule,
          amountNow: preview.amountNow,
          deferredAmount: preview.deferredAmount,
        },
      });

      return { ok: true, preview };
    },

    previewCancellation(quoteId, lineId) {
      const quote = get().getQuotation(quoteId);
      const line = quote?.lines.find((l) => l.id === lineId);
      if (!line) return null;
      const plan = planFor(line);
      return {
        ...computeCancellation({
          line,
          plan,
          cancelDate: new Date(),
          cycleStartDate: line.subscriptionStartDate ?? quote.createdAt,
        }),
        plan,
        line,
        currency: quote.currency,
      };
    },

    cancelSubscription(quoteId, lineId) {
      const preview = get().previewCancellation(quoteId, lineId);
      const quote = get().getQuotation(quoteId);
      if (!preview || !quote) return { ok: false, error: 'Unable to cancel that line.' };

      get().updateLine(quoteId, lineId, { subscriptionStatus: 'cancelled' });

      // Future occurrences stop being scheduled.
      set((state) => {
        const forQuote = { ...(state.billingSchedules[quoteId] ?? {}) };
        if (forQuote[lineId]) {
          forQuote[lineId] = forQuote[lineId].map((occ) =>
            occ.status === 'scheduled' ? { ...occ, status: 'cancelled' } : occ,
          );
        }
        return { billingSchedules: { ...state.billingSchedules, [quoteId]: forQuote } };
      });

      if (preview.type && preview.amount > 0) {
        get().createCreditNote(quoteId, {
          lineId,
          amount: preview.amount,
          type: preview.type,
          reason: preview.explanation,
        });
      }

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Subscription cancelled: ${preview.line.productName}`,
        reason: preview.explanation,
        meta: { rule: preview.plan?.cancellationRule, amount: preview.amount, type: preview.type },
      });

      return { ok: true, preview };
    },

    // ----------------------------------------------------- credit notes
    createCreditNote(quoteId, { lineId = null, amount, type = 'credit_note', reason }) {
      const me = get().currentUser;
      const note = {
        id: nextId('CN'),
        quotationId: quoteId,
        lineId,
        amount: round2(amount),
        type,
        reason,
        createdAt: nowISO(),
        createdById: me?.id ?? 'system',
      };

      set((state) => ({ creditNotes: [note, ...state.creditNotes] }));
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `${type === 'refund' ? 'Refund' : 'Credit note'} ${note.id} issued — ${round2(amount)}`,
        reason,
        meta: { amount: note.amount, type },
      });
      return note;
    },

    creditNotesForQuote(quoteId) {
      return get().creditNotes.filter((n) => n.quotationId === quoteId);
    },

    // -------------------------------------------------- invoice & payments
    sendInvoice(invoiceId) {
      if (!get().canRecordPayments()) {
        return {
          ok: false,
          error: 'Only Finance or an Admin can issue an invoice.',
        };
      }

      const invoice = get().getInvoice(invoiceId);
      if (!invoice) return { ok: false, error: 'Invoice not found.' };
      if (invoice.status !== 'draft') return { ok: false, error: 'This invoice has already been sent.' };

      set((state) => ({
        invoices: state.invoices.map((i) => (i.id === invoiceId ? { ...i, status: 'sent' } : i)),
      }));

      get().logAudit({
        entityType: 'invoice',
        entityId: invoiceId,
        action: `Invoice sent to ${invoice.customerName}`,
        meta: { total: invoice.total },
      });

      const quote = get().getQuotation(invoice.quotationId);
      if (quote && quote.stage === 'fulfillment') get().moveStage(quote.id, 'billed');

      return { ok: true };
    },

    /**
     * Records a payment against an invoice.
     *
     * Settling money is restricted to Finance and Admin. A sales rep or manager
     * can see the invoice and its balance but cannot mark it paid — separating
     * whoever sold the deal from whoever confirms the cash arrived.
     */
    recordPayment(invoiceId, { amount, method, reference, date, notes }) {
      const me = get().currentUser;

      if (!me) return { ok: false, error: 'You are not signed in.' };
      if (!get().canRecordPayments()) {
        return {
          ok: false,
          error: `${roleLabel(me.role)} cannot record payments. Only Finance or an Admin can confirm a payment has been received.`,
        };
      }

      const invoice = get().getInvoice(invoiceId);
      if (!invoice) return { ok: false, error: 'Invoice not found.' };
      if (invoice.status === 'draft') {
        return { ok: false, error: 'Issue the invoice before recording a payment against it.' };
      }

      const value = round2(Number(amount) || 0);
      if (value <= 0) return { ok: false, error: 'Enter a payment amount greater than zero.' };

      const { balanceRemaining } = invoiceBalances(invoice);
      if (value > balanceRemaining + 0.01) {
        return {
          ok: false,
          error: `That exceeds the outstanding balance of ${money(balanceRemaining, invoice.currency)}.`,
        };
      }

      const payment = {
        id: nextId('pay'),
        invoiceId,
        amount: value,
        method: method ?? 'bank_transfer',
        reference: reference ?? '',
        recordedById: me?.id ?? 'system',
        recordedByName: me?.name ?? 'System',
        date: date || nowISO().slice(0, 10),
        notes: notes ?? '',
      };

      const updated = { ...invoice, payments: [...invoice.payments, payment] };
      const status = nextInvoiceStatus(updated);
      const balances = invoiceBalances(updated);

      set((state) => ({
        invoices: state.invoices.map((i) => (i.id === invoiceId ? { ...updated, status } : i)),
      }));

      get().logAudit({
        entityType: 'invoice',
        entityId: invoiceId,
        action: `Payment recorded — ${money(value, invoice.currency)} by ${paymentMethodLabel(payment.method)}`,
        meta: {
          amount: value,
          balanceAfter: balances.balanceRemaining,
          status,
          reference: payment.reference,
        },
      });

      // Fully paid closes the deal.
      if (status === 'paid') {
        const quote = get().getQuotation(invoice.quotationId);
        if (quote && ['billed', 'fulfillment'].includes(quote.stage)) {
          if (quote.stage === 'fulfillment') get().moveStage(quote.id, 'billed');
          get().moveStage(invoice.quotationId, 'confirmed');
        }
        get().notify({
          userId: quote?.ownerId ?? me?.id,
          type: 'system',
          title: `${invoice.id} fully paid`,
          body: `${invoice.customerName} · ${money(invoice.total, invoice.currency)} settled.`,
          link: `/app/quotations/${invoice.quotationId}/invoice`,
        });
      }

      get().recomputeAlerts();
      return { ok: true, payment, status, balances };
    },
  };
}
