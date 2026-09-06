import * as billingApi from '@/services/billingService';
import * as invoicesApi from '@/services/invoicesService';

/**
 * Hybrid billing, subscriptions and invoicing — API-REFERENCE §14 and §15.
 *
 * THE TWO STREAMS NEVER MERGE. One-time lines produce an invoice; recurring lines produce
 * their own schedule. The server builds both from one call and returns them separately.
 *
 * ALL THE ARITHMETIC IS THE SERVER'S. Proration, cancellation amounts, invoice balances
 * and status are computed there and returned — including the plain-language
 * `explanation` string, which is rendered VERBATIM rather than rebuilt from the numbers.
 * `amountPaid` / `balanceRemaining` / `status` are derived from the payment rows on every
 * read and never stored, so a local copy would drift from the ledger.
 */
export function createBillingSlice(set, get) {
  function storeBilling(quoteId, billing) {
    if (!billing) return null;
    set((state) => ({
      billingViews: { ...state.billingViews, [quoteId]: billing },
    }));
    return billing;
  }

  /**
   * Merge an invoice into the cache.
   *
   * The billing payload does NOT nest one — it carries `invoiceId` and
   * `invoiceReference` only — so `syncInvoiceFromBilling` below fetches it by id
   * instead. This still takes a whole invoice from the routes that do return one
   * (GET /invoices/:id, POST /invoices/:id/send, POST /invoices/:id/payments).
   */
  function absorbInvoice(invoice) {
    if (!invoice?.id) return null;
    set((state) => {
      const exists = state.invoices.some((i) => i.id === invoice.id);
      return {
        invoices: exists
          ? state.invoices.map((i) => (i.id === invoice.id ? invoice : i))
          : [...state.invoices, invoice],
      };
    });
    return invoice;
  }

  /**
   * Pull the invoice a billing payload REFERS to into the invoice cache.
   *
   * `GET /quotations/:id/billing` names the invoice (`invoiceId`, `invoiceReference`)
   * without embedding it, so nothing but an explicit fetch can put it in the store. It
   * is skipped when the id is already cached — the only thing that changes an invoice is
   * a send or a payment, and both write it back themselves.
   */
  async function syncInvoiceFromBilling(billing) {
    const invoiceId = billing?.invoiceId;
    if (!invoiceId) return null;
    if (get().invoices.some((i) => i.id === invoiceId)) return null;

    try {
      return absorbInvoice(await invoicesApi.getInvoice(invoiceId));
    } catch {
      // A missing invoice must not fail the billing screen — the screen's own data has
      // already arrived, and the Invoice tab simply stays as it was.
      return null;
    }
  }

  function fail(error) {
    return { ok: false, error: error.message, code: error.code ?? null };
  }

  return {
    billingViews: {},
    billingLoading: false,

    /* --------------------------------------------------------------- reads */

    /** The billing view: one-time section, recurring section, schedules, credit notes. */
    async loadBilling(quoteId) {
      set({ billingLoading: true });
      try {
        const billing = await billingApi.getBilling(quoteId);
        storeBilling(quoteId, billing);
        await syncInvoiceFromBilling(billing);
        return { ok: true, billing };
      } catch (error) {
        return fail(error);
      } finally {
        set({ billingLoading: false });
      }
    },

    getBillingView(quoteId) {
      return get().billingViews[quoteId] ?? null;
    },

    /**
     * Build the invoice and the schedules.
     *
     * IDEMPOTENT server-side: a second call rebuilds the schedules and returns the
     * existing invoice, so a rebuild after a line edit is safe and a duplicate invoice is
     * impossible. Only `scheduled` occurrences are replaced — one already invoiced or
     * paid is a financial fact and survives.
     *
     * A subscription-only order produces schedules and NO invoice. That is valid, not an
     * error. 409 STAGE_LOCKED before the quotation is approved.
     */
    async buildBilling(quoteId) {
      try {
        const billing = await billingApi.buildBilling(quoteId);
        storeBilling(quoteId, billing);
        // Building is what CREATES the invoice, so this is the moment it has to reach
        // the cache — the Invoice tab and `selectInvoiceForQuote` both read from there.
        await syncInvoiceFromBilling(billing);
        return { ok: true, billing };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * The recurring lines with their occurrence schedules.
     *
     * The payload calls this `recurringRows`; there is no `schedules` key on it, so the
     * previous accessor answered an empty array for every quotation with a subscription.
     */
    getBillingSchedules(quoteId) {
      return get().billingViews[quoteId]?.recurringRows ?? [];
    },

    getInvoiceForQuote(quoteId) {
      return get().invoices.find((i) => i.quotationId === quoteId) ?? null;
    },

    getInvoice(invoiceId) {
      return get().invoices.find((i) => i.id === invoiceId) ?? null;
    },

    async loadInvoices(filters = {}) {
      set({ invoicesLoading: true });
      try {
        // Paged rather than one `pageSize: 100` request: each row is the full detail
        // object with its lines and payments, and asking for a hundred of them at once
        // is the shape that 500s.
        const { items, meta } = await invoicesApi.listAllInvoices(filters);
        set({ invoices: items, invoicesMeta: meta });
        return { ok: true, items };
      } catch (error) {
        return fail(error);
      } finally {
        set({ invoicesLoading: false });
      }
    },

    async fetchInvoice(invoiceId) {
      try {
        const invoice = await invoicesApi.getInvoice(invoiceId);
        absorbInvoice(invoice);
        return { ok: true, invoice };
      } catch (error) {
        return fail(error);
      }
    },

    /* ------------------------------------------------------- subscriptions */

    /**
     * Preview a mid-cycle quantity change. NO MUTATION — the customer-facing number has
     * to be shown before anything is committed.
     *
     * `explanation` is written by the server in plain language and must be rendered as-is.
     */
    async previewSubscriptionChange(quoteId, lineId, newQty) {
      try {
        const preview = await billingApi.previewProration(quoteId, lineId, newQty);
        return { ok: true, preview };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Apply the change.
     *
     * When the proration is NEGATIVE the server issues a credit note automatically — a
     * mid-cycle reduction that only lowered the next invoice would quietly keep money the
     * customer already paid for days they will not use.
     */
    async applySubscriptionChange(quoteId, lineId, newQty) {
      try {
        const result = await billingApi.changeSubscriptionQty(quoteId, lineId, newQty);
        storeBilling(quoteId, result.billing);
        await get().fetchQuotation(quoteId);
        return { ok: true, billing: result.billing, proration: result.proration };
      } catch (error) {
        return fail(error);
      }
    },

    /** What cancelling would produce, per the plan's cancellation rule. No mutation. */
    async previewCancellation(quoteId, lineId) {
      try {
        const preview = await billingApi.previewCancellation(quoteId, lineId);
        return { ok: true, preview };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Cancel. Flips every future `scheduled` occurrence to `cancelled` and creates the
     * refund or credit note the plan's rule calls for (`no_refund` creates neither).
     */
    async cancelSubscription(quoteId, lineId) {
      try {
        const result = await billingApi.cancelSubscription(quoteId, lineId);
        if (result?.billing) storeBilling(quoteId, result.billing);
        else await get().loadBilling(quoteId);
        await get().fetchQuotation(quoteId);
        return { ok: true, result };
      } catch (error) {
        return fail(error);
      }
    },

    /* -------------------------------------------------------- credit notes */

    creditNotesForQuote(quoteId) {
      return get().billingViews[quoteId]?.creditNotes ?? [];
    },

    async loadCreditNotes(quoteId) {
      try {
        const creditNotes = await billingApi.listCreditNotes(quoteId);
        set((state) => ({
          billingViews: {
            ...state.billingViews,
            [quoteId]: { ...(state.billingViews[quoteId] ?? {}), creditNotes },
          },
        }));
        return { ok: true, creditNotes };
      } catch (error) {
        return fail(error);
      }
    },

    /** FINANCE / ADMIN only, like every money action. Emails the customer. */
    async createCreditNote(quoteId, { lineId = null, amount, type = 'credit_note', reason }) {
      try {
        await billingApi.createCreditNote(quoteId, { lineId, amount, type, reason });
        await get().loadCreditNotes(quoteId);
        return { ok: true };
      } catch (error) {
        return fail(error);
      }
    },

    /* --------------------------------------------------- invoice lifecycle */

    /**
     * Issue the invoice. draft → sent, and moves the quotation fulfillment → billed.
     * FINANCE / ADMIN only. 409 INVOICE_ALREADY_SENT on a second call.
     */
    async sendInvoice(invoiceId) {
      try {
        const invoice = await invoicesApi.sendInvoice(invoiceId);
        absorbInvoice(invoice);
        if (invoice?.quotationId) await get().fetchQuotation(invoice.quotationId);
        return { ok: true, invoice };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Record a payment. The most security-sensitive call in the app.
     *
     * The server enforces finance/admin only, that the invoice is issued
     * (409 INVOICE_NOT_ISSUED), no overpayment (422 OVERPAYMENT naming the outstanding
     * figure), and that the actor is its own view of who called — which is why no
     * `recordedBy` is sent. Full settlement moves the quotation to `confirmed`.
     *
     * An Idempotency-Key is attached per attempt inside the service, so a double click or
     * a network retry cannot write a second payment. `replayed: true` means the key had
     * been seen and the ORIGINAL payment came back unchanged — worth telling the user,
     * because otherwise a retry looks like it silently did nothing.
     *
     * @returns {{ok, invoice, payment, status, quotationStage, replayed}}
     */
    async recordPayment(invoiceId, { amount, method, reference, date, notes }) {
      try {
        const result = await invoicesApi.recordPayment(invoiceId, {
          amount,
          method,
          reference,
          date,
          notes,
        });
        absorbInvoice(result.invoice);
        if (result.invoice?.quotationId) await get().fetchQuotation(result.invoice.quotationId);

        return {
          ok: true,
          invoice: result.invoice,
          payment: result.payment,
          status: result.status,
          quotationStage: result.quotationStage,
          replayed: Boolean(result.replayed),
        };
      } catch (error) {
        // OVERPAYMENT carries the outstanding balance in details, which is more useful to
        // show than the generic message alone.
        return {
          ...fail(error),
          balanceRemaining: error.payload?.error?.details?.balanceRemaining ?? null,
        };
      }
    },
  };
}
