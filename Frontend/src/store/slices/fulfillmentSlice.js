import * as fulfillmentApi from '@/services/fulfillmentService';

/**
 * Warehouse split and backorders — API-REFERENCE §13.
 *
 * THE SERVER OWNS THE ALLOCATION ALGORITHM. It recomputes the plan from live stock on
 * every read, unless the rep has accepted or overridden it — in which case their
 * decision is returned verbatim, because they made that call for a reason the algorithm
 * cannot see (a customer who wants one delivery, for instance).
 *
 * So there is nothing to compute here. `computeFulfillment` is now a fetch, and the
 * local greedy allocator, the shipment-count arithmetic and the cost estimate are all
 * gone. Keeping a second implementation would let the screen disagree with the order.
 *
 * `canConsolidate` also comes from the server, which excludes units already promised to
 * OTHER live quotations — a check the client could not make correctly, since it does not
 * hold every other order.
 */
export function createFulfillmentSlice(set, get) {
  function storePlan(quoteId, plan) {
    if (!plan) return null;
    set((state) => ({ fulfillmentPlans: { ...state.fulfillmentPlans, [quoteId]: plan } }));
    return plan;
  }

  function fail(error) {
    return { ok: false, error: error.message, code: error.code ?? null };
  }

  return {
    fulfillmentLoading: false,

    /**
     * Fetch the plan for one quotation.
     *
     * Async now — it used to compute synchronously and return a plan, so callers must
     * await it and read `result.plan`.
     */
    async computeFulfillment(quoteId) {
      set({ fulfillmentLoading: true });
      try {
        const plan = await fulfillmentApi.getFulfillment(quoteId);
        storePlan(quoteId, plan);
        return { ok: true, plan };
      } catch (error) {
        return fail(error);
      } finally {
        set({ fulfillmentLoading: false });
      }
    },

    /** Cached read. Returns null until `computeFulfillment` has run for this quotation. */
    getFulfillmentPlan(quoteId) {
      return get().fulfillmentPlans[quoteId] ?? null;
    },

    /**
     * The suggestion and the saved plan are the same object.
     *
     * They used to be separate: the client recomputed a fresh suggestion to diff against
     * the stored one. The server now returns `costDelta` on an override instead, which is
     * the only number that comparison existed to produce.
     */
    suggestionFor(quoteId) {
      return get().fulfillmentPlans[quoteId] ?? null;
    },

    /** True when an open backorder could now be filled from current stock. */
    canConsolidateBackorder(quoteId) {
      return Boolean(get().fulfillmentPlans[quoteId]?.canConsolidate);
    },

    /**
     * Accept the suggested split. Persists it and moves the stage approved → fulfillment.
     * 409 NOTHING_TO_SHIP when the order has no physical lines.
     */
    async acceptSplit(quoteId) {
      try {
        const plan = await fulfillmentApi.acceptSplit(quoteId);
        storePlan(quoteId, plan);
        // The stage moved server-side, so re-read the quotation rather than guessing.
        await get().fetchQuotation(quoteId);
        return { ok: true, plan };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Save a manual override.
     *
     * On 422 INVALID_ALLOCATION the server returns per-cell errors in
     * `error.details.errors` — line-level problems omit `warehouseId`, stock problems
     * name it. Those are passed through as `cellErrors` so the table can highlight the
     * exact input rather than showing one generic message.
     *
     * @returns {{ok, plan, costDelta}} `costDelta` is what the override cost against the
     *   suggestion. Surface it — seeing the price of a manual choice is the whole point.
     */
    async saveOverride(quoteId, allocations) {
      try {
        const result = await fulfillmentApi.saveOverride(quoteId, allocations);
        storePlan(quoteId, result.plan);
        await get().fetchQuotation(quoteId);
        return { ok: true, plan: result.plan, costDelta: result.costDelta };
      } catch (error) {
        return {
          ...fail(error),
          cellErrors: error.payload?.error?.details?.errors ?? [],
        };
      }
    },

    /**
     * Merge an open backorder into fewer shipments.
     * 409 NOTHING_TO_CONSOLIDATE when there is no open backorder.
     *
     * @returns {{ok, plan, saving: {shipmentsSaved, costSaved}}}
     */
    async consolidateBackorder(quoteId) {
      try {
        const result = await fulfillmentApi.consolidateBackorder(quoteId);
        storePlan(quoteId, result.plan);
        get().dismissConsolidationPrompt(quoteId);
        return { ok: true, plan: result.plan, saving: result.saving };
      } catch (error) {
        return fail(error);
      }
    },

    async setBackorderPolicy(quoteId, policy) {
      try {
        const plan = await fulfillmentApi.setBackorderPolicy(quoteId, policy);
        storePlan(quoteId, plan);
        return { ok: true, plan };
      } catch (error) {
        return fail(error);
      }
    },

    /**
     * Called after a stock change.
     *
     * The server tells us which quotations a stock increase could now fill —
     * `affectedQuotationIds` on the setStock and restock responses. That is strictly
     * better than the old local scan, which could not know about units promised to other
     * orders. Their plans are re-read so `canConsolidate` is current, then the prompt is
     * raised for whichever now qualify.
     */
    async afterStockChange(affectedQuotationIds = []) {
      if (affectedQuotationIds.length === 0) {
        set({ consolidationCandidates: [] });
        return [];
      }

      await Promise.allSettled(
        affectedQuotationIds.map((quoteId) => get().computeFulfillment(quoteId)),
      );

      const candidates = affectedQuotationIds.filter((quoteId) =>
        get().canConsolidateBackorder(quoteId),
      );
      set({ consolidationCandidates: candidates });
      return candidates;
    },

    /** Per-quotation, so the modal does not reappear on every render. */
    dismissConsolidationPrompt(quoteId) {
      set((state) => ({
        consolidationCandidates: state.consolidationCandidates.filter((id) => id !== quoteId),
      }));
    },
  };
}
