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
/**
 * Every `/customer/quotations/:id` sub-route parses `:id` as a uuid before it does
 * anything else, so a reference like "Q-1035" is rejected with
 * 400 VALIDATION_FAILED "Invalid quotation id".
 *
 * This is used to tell the two apart, because the list projection may or may not carry
 * the uuid depending on which build of the API is deployed. See PORTAL_ID_MISSING below.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_RE.test(String(value ?? ''));
}

/**
 * The one thing on this screen the client cannot work around.
 *
 * `projectForCustomer` (portal.projection.ts) builds an allow-list that starts at
 * `reference` and never copies `loaded.id`. But the detail, comment, request, confirm
 * and PDF routes all take the quotation UUID and reject anything else at the edge. So a
 * customer session has no path to the id those five routes need — six of the seven
 * portal endpoints are unreachable from the list the seventh returns.
 *
 * WHAT THIS SLICE DOES ABOUT IT. The list payload is the FULL projection for every
 * quotation, so a detail screen keyed on the reference can still render completely from
 * the cached row rather than bouncing the customer to a 404. What it cannot do is act:
 * posting a comment, proposing terms or confirming needs the id. Those return
 * `PORTAL_ID_MISSING` so the page can say the action is unavailable, which is honest,
 * rather than firing a request that comes back as an unexplained 400.
 *
 * THE FIX IS ONE LINE OF BACKEND: add `id: loaded.id` to the object
 * `projectForCustomer` returns. Nothing else here changes when it lands — `idFor`
 * picks the uuid up the moment the payload carries it.
 */
const PORTAL_ID_MISSING = {
  ok: false,
  code: 'PORTAL_ID_MISSING',
  error:
    'This action is not available yet — the server has not sent an id for this quotation. Please contact your account manager.',
};

export function createCustomerSlice(set, get) {
  /**
   * The key a route and the cache use. Prefers the uuid, falls back to the reference,
   * because the projection carries `reference` but not always `id`.
   */
  function keyOf(view) {
    return view?.id ?? view?.reference ?? null;
  }

  /**
   * Resolve whatever the route gave us into the uuid the API needs.
   *
   * A uuid passes straight through. A reference is looked up against the cached
   * projections, which covers the case where a future build starts returning `id` while
   * old links still carry references.
   */
  function idFor(routeKey) {
    if (isUuid(routeKey)) return routeKey;

    const state = get();
    const cached =
      state.myQuotationViews[routeKey] ??
      state.myQuotations.find((q) => q.reference === routeKey || q.id === routeKey);

    return isUuid(cached?.id) ? cached.id : null;
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
    async loadMyQuotation(routeKey) {
      if (!routeKey) return { ok: false, error: 'No quotation.' };

      set({ portalLoading: true, portalError: null });

      const quotationId = idFor(routeKey);

      /**
       * No uuid available, so GET /customer/quotations/:id would answer 400 rather
       * than 404 and the page would send the customer away from a quotation that
       * exists. Fall back to the list, which returns the FULL projection per row —
       * everything this screen renders is already in it.
       */
      if (!quotationId) {
        const cached = get().myQuotationViews[routeKey];
        if (!cached) await get().loadMyQuotations();

        const view =
          get().myQuotationViews[routeKey] ??
          get().myQuotations.find((q) => q.reference === routeKey) ??
          null;

        set({ portalLoading: false });
        if (!view) return { ok: false, notFound: true, error: 'Quotation not found.' };

        // Flagged rather than silently degraded: the page disables the actions that
        // need an id and says why, instead of offering buttons that cannot work.
        cache({ ...view, actionsUnavailable: true });
        return { ok: true, view, actionsUnavailable: true };
      }

      try {
        const view = await portalApi.getMyQuotation(quotationId);
        // Cached under the key the route used, so a reference-keyed URL still resolves.
        set((state) => ({
          myQuotationViews: { ...state.myQuotationViews, [routeKey]: view, [quotationId]: view },
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
    async customerAddComment(routeKey, lineId, message) {
      if (!message?.trim()) return { ok: false, error: 'Type a message first.' };

      const quotationId = idFor(routeKey);
      if (!quotationId) return PORTAL_ID_MISSING;

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
    async customerSubmitRequest(routeKey, { counterDiscountPct = null, justification = '' } = {}) {
      const quotationId = idFor(routeKey);
      if (!quotationId) return PORTAL_ID_MISSING;

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
    async customerConfirm(routeKey) {
      const quotationId = idFor(routeKey);
      if (!quotationId) return PORTAL_ID_MISSING;

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
    async customerQuotationPdf(routeKey) {
      const quotationId = idFor(routeKey);
      if (!quotationId) return PORTAL_ID_MISSING;

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
