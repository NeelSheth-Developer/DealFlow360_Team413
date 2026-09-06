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

  useEffect(() => {
    if (!quoteId) return;
    refreshRisk(quoteId);
  }, [quoteId, inputKey, refreshRisk]);

  const resolved = entry ?? PENDING_RISK;

  return {
    risk: resolved.risk,
    approvalPath: resolved.approvalPath,
    source: resolved.source,
    isLoading: resolved.status === 'loading' || resolved.source === 'pending',
    isFallback: resolved.source === 'fallback',
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
