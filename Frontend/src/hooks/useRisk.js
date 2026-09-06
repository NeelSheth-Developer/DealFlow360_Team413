import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { PENDING_RISK, riskInputKey } from '@/services/riskService';

/**
 * Subscribes to the server-scored risk for one quotation and requests a refresh
 * whenever the inputs change. Components never compute a score themselves.
 */
export function useRisk(quoteId) {
  const entry = useAppStore((s) => s.riskCache[quoteId]);
  const refreshRisk = useAppStore((s) => s.refreshRisk);

  // Fingerprint of the scoring inputs — re-runs the effect when they change.
  const inputKey = useAppStore((s) => {
    const quotation = s.quotations.find((q) => q.id === quoteId);
    return riskInputKey(quotation, s.categoryCeilings, s.tierCeilings);
  });

  /**
   * `hasEntry` is a dependency so a score that DISAPPEARS is refetched.
   *
   * Keying only on `inputKey` assumed the cache can never lose an entry it already has.
   * Anything that clears one — `invalidateRisk` after a ceiling change, a role switch,
   * a config save — leaves the inputs identical, so the effect would not re-run and the
   * screen would sit on PENDING_RISK: a zero score with an empty breakdown, which reads
   * as "no violations" rather than "not scored".
   *
   * This cannot loop. `refreshRisk` always writes an entry (loading → ready or error),
   * so `hasEntry` flips to true and settles; the one path that writes nothing is a
   * quotation missing from the store, and there `inputKey` is 'none' and stays there.
   */
  const hasEntry = entry !== undefined;

  useEffect(() => {
    if (!quoteId) return;
    refreshRisk(quoteId);
  }, [quoteId, inputKey, hasEntry, refreshRisk]);

  const resolved = entry ?? PENDING_RISK;

  return {
    risk: resolved.risk,
    approvalPath: resolved.approvalPath,
    source: resolved.source,
    // 'error' is NOT loading — the caller has to be able to tell "still scoring" from
    // "scoring failed", or a failure renders forever as a spinner.
    isLoading: resolved.status === 'loading' || resolved.source === 'pending',
    isError: resolved.status === 'error',
    error: resolved.error ?? null,
    isFallback: resolved.source === 'fallback',
    /** True once a real server answer is in hand — the table renders only then. */
    isReady: resolved.status === 'ready',
  };
}

/**
 * Keeps a whole list or board scored. One batched request rather than one per
 * row. Re-runs when any quotation or ceiling changes.
 */
export function useAllRisks() {
  const refreshAllRisks = useAppStore((s) => s.refreshAllRisks);

  const fingerprint = useAppStore((s) =>
    JSON.stringify([
      s.quotations.map((q) => [
        q.id,
        q.orderDiscountPct,
        q.tier,
        (q.lines ?? []).map((l) => [l.id, l.qty, l.unitPrice, l.discountPct, l.category]),
      ]),
      s.categoryCeilings,
      s.tierCeilings,
    ]),
  );

  useEffect(() => {
    refreshAllRisks();
  }, [fingerprint, refreshAllRisks]);
}
