import { PENDING_RISK, riskInputKey, scoreQuotation, scoreQuotations } from '@/services/riskService';

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

      const result = await scoreQuotation({
        quotation,
        categoryCeilings: get().categoryCeilings,
        tierCeilings: get().tierCeilings,
        approvalChain: get().approvalChain,
      });

      const entry = { ...result, inputKey: key, status: 'ready', scoredAt: new Date().toISOString() };
      set((state) => ({ riskCache: { ...state.riskCache, [quoteId]: entry } }));
      return entry;
    },

    /**
     * Batch refresh. Used on boot and by list/board screens so a table of 15
     * quotations costs one request instead of fifteen.
     */
    async refreshAllRisks({ force = false } = {}) {
      const state = get();
      const stale = state.quotations.filter((q) => {
        const cached = state.riskCache[q.id];
        if (force || !cached) return true;
        return cached.inputKey !== currentKey(q) || cached.status !== 'ready';
      });

      if (stale.length === 0) return {};

      const results = await scoreQuotations({
        quotations: stale,
        categoryCeilings: state.categoryCeilings,
        tierCeilings: state.tierCeilings,
        approvalChain: state.approvalChain,
      });

      const now = new Date().toISOString();
      const patch = {};
      for (const quotation of stale) {
        const result = results[quotation.id];
        if (!result) continue;
        patch[quotation.id] = {
          ...result,
          inputKey: currentKey(quotation),
          status: 'ready',
          scoredAt: now,
        };
      }

      set((s) => ({ riskCache: { ...s.riskCache, ...patch } }));
      return patch;
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
