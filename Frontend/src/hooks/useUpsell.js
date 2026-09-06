import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { suggestUpsells } from '@/services/upsellService';

/**
 * Ranked upsell suggestions for one quotation — POST /upsell-rules/suggest (§9.5).
 *
 * WHY THIS IS A REQUEST AND NOT A SELECTOR. The panel used to be filled by
 * `rankSuggestions()` running over `state.upsellRules`, `state.products` and
 * `state.priceLists`. That reproduced the server's formula in a second place, and the
 * two could only ever agree by accident:
 *
 *  · THE MARGIN FLOOR IS A HARD DROP. A product whose margin at the customer's tier
 *    price falls under its rule's `minMarginPct` is removed entirely. Getting that
 *    wrong does not reorder the list, it puts an add-on that loses money in front of a
 *    rep — which is the one outcome the rule exists to prevent.
 *  · The local pass priced from `state.priceLists`, which is the price-list page the
 *    store happened to hold. A product priced outside it fell back to list price, so
 *    both the margin and the floor test were computed against the wrong number.
 *  · `rankScore` is `coPurchaseScore + (promoted ? 25 : 0) + marginPct × 0.3`. It is
 *    cheap to copy and expensive to keep copied: a weighting changed server-side would
 *    silently keep ranking the old way here.
 *
 * The response carries the same `breakdown` the local version built, so the panel
 * renders unchanged — it is the arithmetic behind it that moved.
 *
 * `dismissedSuggestions` is sent as `excludeProductIds` rather than filtered afterwards,
 * so a dismissal frees a slot in the top-N instead of leaving a gap in it.
 */
export function useUpsellSuggestions(quoteId, { limit = 6 } = {}) {
  const quote = useAppStore((s) => s.quotations.find((q) => q.id === quoteId));

  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const productIds = useMemo(
    () => (quote?.lines ?? []).map((l) => l.productId).filter(Boolean),
    [quote],
  );
  const excludeProductIds = useMemo(() => quote?.dismissedSuggestions ?? [], [quote]);

  // A fingerprint rather than the arrays themselves: `lines` is a new array on every
  // absorb, and depending on it directly would re-request on every unrelated re-render.
  const inputKey = useMemo(
    () => JSON.stringify([quoteId, quote?.tier, quote?.currency, productIds, excludeProductIds]),
    [quoteId, quote?.tier, quote?.currency, productIds, excludeProductIds],
  );

  // Guards against an older reply landing after a newer one and repainting the panel
  // with suggestions for a cart the rep has already changed.
  const latestKey = useRef(inputKey);

  const run = useCallback(async () => {
    latestKey.current = inputKey;
    const forThisKey = inputKey;

    if (!quote || productIds.length === 0) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const items = await suggestUpsells({
        productIds,
        tier: quote.tier,
        currency: quote.currency,
        excludeProductIds,
        limit,
      });
      if (latestKey.current !== forThisKey) return;
      setSuggestions(items);
      setError(null);
    } catch (err) {
      if (latestKey.current !== forThisKey) return;
      // An empty panel and a failed panel are different facts. The caller renders the
      // message rather than the "no suggestions right now" empty state, which would
      // otherwise claim there are no pairings when the request simply did not land.
      setSuggestions([]);
      setError(err.message);
    } finally {
      if (latestKey.current === forThisKey) setLoading(false);
    }
  }, [inputKey, quote, productIds, excludeProductIds, limit]);

  useEffect(() => {
    run();
  }, [run]);

  return { suggestions, loading, error, refresh: run };
}
