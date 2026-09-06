import {
  PENDING_RISK,
  riskInputKey,
  scoreQuotation,
  scoreQuotations,
} from '@/services/riskService';

/**
 * Cache of server-returned risk scores, keyed by quotation id.
 *
 * The UI reads only from this cache. Nothing renders a locally-invented score.
 * Each entry stores the fingerprint of the inputs it was computed from, so a
 * stale answer is refetched automatically when a line or a ceiling changes.
 */
export function createRiskSlice(set, get) {
  function currentKey(quotation) {
    return riskInputKey(quotation, get().categoryCeilings, get().tierCeilings);
  }

  /**
   * One batch in flight at a time.
   *
   * `loadQuotations` now writes each page of the walk into the store as it lands, so the
   * list and board screens see the quotation set change four times during a single load.
   * `useAllRisks` re-runs on each of those, and without this guard the second call would
   * start before the first had written its results — re-scoring the same rows, because
   * nothing marks them as in-flight the way `refreshRisk` does for a single quotation.
   *
   * The follow-up call is not dropped, only deferred: it awaits the batch already
   * running and then re-checks what is stale, so rows from the later pages are still
   * scored. Kept in a closure rather than in the store because it is a concurrency
   * detail, not state any component should be able to read.
   */
  let batchInFlight = null;

  return {
    riskCache: {},

    /** Read-only accessor. Returns a pending placeholder if not yet scored. */
    getRisk(quoteId) {
      return get().riskCache[quoteId] ?? PENDING_RISK;
    },

    /** Fetch (or refresh) the score for one quotation. */
    async refreshRisk(quoteId, { force = false } = {}) {
      const quotation = get().quotations.find((q) => q.id === quoteId);
      if (!quotation) return null;

      const key = currentKey(quotation);
      const cached = get().riskCache[quoteId];

      if (!force && cached && cached.inputKey === key && cached.status === 'ready') {
        return cached;
      }
      if (cached?.status === 'loading' && cached.inputKey === key) {
        return cached;
      }

      set((state) => ({
        riskCache: {
          ...state.riskCache,
          [quoteId]: { ...(cached ?? PENDING_RISK), inputKey: key, status: 'loading' },
        },
      }));

      try {
        const result = await scoreQuotation({ quotation });

        const entry = {
          ...result,
          inputKey: key,
          status: 'ready',
          scoredAt: new Date().toISOString(),
        };
        set((state) => ({ riskCache: { ...state.riskCache, [quoteId]: entry } }));
        return entry;
      } catch (error) {
        // There is no local fallback any more, and that is deliberate — an invented
        // score would resolve a different approval chain than the server will. Record
        // the failure so the gauge can say "score unavailable" rather than showing a
        // zero, which reads as "no violations".
        const entry = {
          ...PENDING_RISK,
          inputKey: key,
          status: 'error',
          error: error.message,
          approvalPath: { approvers: [], ruleId: null, label: 'Score unavailable' },
        };
        set((state) => ({ riskCache: { ...state.riskCache, [quoteId]: entry } }));
        return entry;
      }
    },

    /**
     * Batch refresh. Used on boot and by list/board screens so a table of 15
     * quotations costs one request instead of fifteen.
     */
    async refreshAllRisks({ force = false } = {}) {
      // Wait for any batch already running, then decide what is still stale against the
      // state it produced.
      if (batchInFlight) await batchInFlight.catch(() => {});

      const run = (async () => {
        const state = get();
        const stale = state.quotations.filter((q) => {
          const cached = state.riskCache[q.id];
          if (force || !cached) return true;
          return cached.inputKey !== currentKey(q) || cached.status !== 'ready';
        });

        if (stale.length === 0) return {};

        const now = new Date().toISOString();
        const patch = {};

        try {
          const results = await scoreQuotations({ quotations: stale });

          for (const quotation of stale) {
            const result = results[quotation.id];
            // A quotation the server omitted stays unscored rather than being filled in
            // with a guess.
            if (!result) continue;
            patch[quotation.id] = {
              ...result,
              inputKey: currentKey(quotation),
              status: 'ready',
              scoredAt: now,
            };
          }
        } catch (error) {
          for (const quotation of stale) {
            patch[quotation.id] = {
              ...PENDING_RISK,
              inputKey: currentKey(quotation),
              status: 'error',
              error: error.message,
              approvalPath: { approvers: [], ruleId: null, label: 'Score unavailable' },
            };
          }
        }

        set((s) => ({ riskCache: { ...s.riskCache, ...patch } }));
        return patch;
      })();

      batchInFlight = run;
      try {
        return await run;
      } finally {
        if (batchInFlight === run) batchInFlight = null;
      }
    },

    /**
     * Awaits a guaranteed-fresh score. Used by actions that must not act on a
     * stale number — submitting for approval, and customer confirmation.
     */
    async ensureRisk(quoteId) {
      const entry = await get().refreshRisk(quoteId, { force: true });
      return entry ?? PENDING_RISK;
    },

    /** Drops a cached score, e.g. after config changes invalidate everything. */
    invalidateRisk(quoteId = null) {
      if (quoteId) {
        set((state) => {
          const next = { ...state.riskCache };
          delete next[quoteId];
          return { riskCache: next };
        });
      } else {
        set({ riskCache: {} });
      }
    },
  };
}
