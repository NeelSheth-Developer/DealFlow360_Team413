import * as portalApi from '@/services/customerPortalService';

/**
 * Customer portal — API-REFERENCE §16.
 *
 * THERE IS NO CLIENT-SIDE PROJECTION ANY MORE. `toCustomerView` used to rebuild a safe
 * object out of the internal quotation held in this store. That was presentation
 * scoping, not access control — the whole store was readable in devtools — and it is
 * obsolete now: `/customer/*` returns an allow-list projection built server-side from
 * named safe fields. Cost prices, margins, the risk score, ceilings, internal notes,
 * owner identity, `approvalSteps` and the internal role names are simply not in the
 * payload, so rendering it directly IS the safe path.
 *
 * A staff token on these routes gets 403 WRONG_KIND, and another customer's record
 * returns 404 rather than 403 — a 403 would confirm the record exists. So there is no
 * ownership check to mirror here either; the server scopes every query by the session's
 * own customer id in the WHERE clause.
 *
 * ALSO GONE: the local `canMessage` / `canProposeTerms` / `canConfirm` derivations and
 * every `logAudit` / `notify` call. The three capabilities arrive as independent
 * booleans on the payload, and the server audits and emails inside the same transaction
 * as the action.
 *
 * THERE IS NO PORTAL TOKEN AND NO SHARE LINK. Access is by authenticated account only —
 * a link that grants access is a credential, and a forwarded one would hand a competitor
 * the full commercial terms.
 */
export function createCustomerSlice(set, get) {
  /**
   * The projection carries `reference` ("Q-1035") but no separate uuid, so the reference
   * is what routes and cache keys use. `id` is read first anyway in case a deployment
   * includes it — the two are different fields per §0 and must not be conflated.
   */
  function keyOf(view) {
    return view?.id ?? view?.reference ?? null;
  }

  function cache(view) {
    const key = keyOf(view);
    if (!key) return;
    set((state) => ({
      myQuotationViews: { ...state.myQuotationViews, [key]: view },
      myQuotations: state.myQuotations.map((q) => (keyOf(q) === key ? view : q)),
    }));
  }

  function fail(error) {
    return { ok: false, error: error.message, code: error.code ?? null };
  }

  return {
    /**
     * Every quotation shared with the signed-in customer, newest activity first.
     * A DRAFT IS NEVER RETURNED — the server excludes it, so there is nothing to filter.
     */
    async loadMyQuotations() {
      if (!get().customerUser) return { ok: false, skipped: true };

      set({ portalLoading: true, portalError: null });
      try {
        const items = await portalApi.listMyQuotations();
        set((state) => ({
          myQuotations: items,
          myQuotationViews: items.reduce(
            (acc, view) => {
              const key = keyOf(view);
              if (key) acc[key] = view;
              return acc;
            },
            { ...state.myQuotationViews },
          ),
          portalLoading: false,
        }));
        return { ok: true, items };
      } catch (error) {
        set({ portalLoading: false, portalError: error.message });
        return fail(error);
      }
    },

    /**
     * One quotation. A 404 means it is not this customer's to see, which is the same
     * answer as "does not exist" on purpose — so it is reported as not-found rather
     * than as a permission problem.
     */
    async loadMyQuotation(quotationId) {
      if (!quotationId) return { ok: false, error: 'No quotation.' };

      set({ portalLoading: true, portalError: null });
      try {
        const view = await portalApi.getMyQuotation(quotationId);
        set((state) => ({
          myQuotationViews: { ...state.myQuotationViews, [quotationId]: view },
          portalLoading: false,
        }));
        return { ok: true, view };
      } catch (error) {
        set({ portalLoading: false, portalError: error.message });
        return { ...fail(error), notFound: error.status === 404 };
      }
    },

    /** Cache read. Null until `loadMyQuotation` resolves. */
    myQuotation(quotationId) {
      return get().myQuotationViews[quotationId] ?? null;
    },

    /**
     * Post a message on a line.
     *
     * Permitted whenever `canMessage`, which stays true right through internal approval —
     * a customer waiting on a decision must still be able to chase it. Only a closed
     * quotation blocks messaging, and the server is the one that decides.
     */
    async customerAddComment(quotationId, lineId, message) {
      if (!message?.trim()) return { ok: false, error: 'Type a message first.' };

      try {
        const view = await portalApi.addComment(quotationId, lineId, message.trim());
        cache(view);
        return { ok: true, view };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Propose different terms. Either field may be omitted but not both — a request with
     * neither a number nor a sentence gives the rep nothing to act on.
     *
     * 409 ACTION_NOT_AVAILABLE when the previous request is still under review; the
     * server's message explains that, so it is surfaced verbatim.
     */
    async customerSubmitRequest(quotationId, { counterDiscountPct = null, justification = '' } = {}) {
      try {
        const view = await portalApi.submitRequest(quotationId, {
          counterDiscountPct,
          justification: justification.trim(),
        });
        cache(view);
        return { ok: true, view };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Confirm — the automatic re-approval branch, and the whole point of the feature.
     *
     * The server re-scores the FINAL agreed terms, resolves the chain from stored config
     * and either routes the quotation back into approval or confirms it outright. No rep
     * action is involved, which is what stops a negotiated discount bypassing governance
     * because it was agreed after the last approval.
     *
     * THE SCORE IS NEVER RETURNED and must never be shown here — it is internal
     * governance data. Only `requiredApprovers` comes back, and even that is reported as
     * "needs a further sign-off" rather than as a count of who.
     */
    async customerConfirm(quotationId) {
      try {
        const result = await portalApi.confirmQuotation(quotationId);
        if (result?.quotation) cache(result.quotation);
        return {
          ok: true,
          reapproval: Boolean(result?.reapproval),
          requiredApprovers: Number(result?.requiredApprovers) || 0,
          view: result?.quotation ?? null,
        };
      } catch (error) {
        return fail(error);
      }
    },

    /** The customer's own quotation as a PDF. Ownership is re-checked server-side. */
    async customerQuotationPdf(quotationId) {
      try {
        return { ok: true, ...(await portalApi.getMyQuotationPdf(quotationId)) };
      } catch (error) {
        return fail(error);
      }
    },

    /** The customer's own invoice as a PDF. A draft invoice 404s — it is not issued. */
    async customerInvoicePdf(invoiceId) {
      try {
        return { ok: true, ...(await portalApi.getMyInvoicePdf(invoiceId)) };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
