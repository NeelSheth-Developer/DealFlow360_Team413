import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { scoreBlended } from '@/services/riskService';

/**
 * Live blended-score preview for the quotation currently on screen.
 *
 * `POST /risk/blended-score` is stateless — it takes line totals directly and needs no
 * saved quotation — which is exactly what makes it usable while a rep is still typing.
 * The authoritative path (`/risk/score` behind `useRisk`) can only score what the server
 * already holds, so it lags a PATCH by two round trips: one to save the line, one to
 * re-score it. This fills that gap.
 *
 * IT IS A PREVIEW AND MUST BE LABELLED AS ONE. The endpoint matches `approval_level`
 * against the chain's score bands only and ignores `singleLineTrip`, so a quotation with
 * one badly-over line can preview as "Manager approval" and still route to
 * "Manager + Finance" when submitted. `POST /submit-approval` re-scores with the full
 * rule and its answer is the binding one. Never render this number as the decision.
 *
 * DEGRADES SILENTLY WHEN THE ROUTE IS ABSENT. The endpoint is newer than some deployed
 * backends — it 404s on at least one host the app is pointed at. A missing preview must
 * not produce an error banner on a screen that is otherwise working, so the first 404
 * sets `unsupported` and no further requests are made for the life of the hook.
 */
const DEBOUNCE_MS = 300;

/**
 * The line shape the endpoint wants.
 *
 * `lineTotal` must be the NET value of the line as the rep sees it — quantity × price,
 * less the line discount, less the order-level discount — because the server weights
 * each overage by it. Passing the gross would over-weight heavily discounted lines and
 * quietly inflate the score.
 */
export function blendedLinesFromQuote(quote) {
  const orderFactor = 1 - (Number(quote?.orderDiscountPct) || 0) / 100;

  return (quote?.lines ?? []).map((l) => {
    const gross = (Number(l.qty) || 0) * (Number(l.unitPrice) || 0);
    const afterLine = gross * (1 - (Number(l.discountPct) || 0) / 100);
    return {
      lineId: l.id,
      category: l.category,
      discountPct: Number(l.discountPct) || 0,
      lineTotal: Math.max(0, afterLine * orderFactor),
    };
  });
}

export function useBlendedPreview(quote) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const lines = useMemo(() => blendedLinesFromQuote(quote), [quote]);
  const tier = quote?.tier ?? null;

  // Fingerprint rather than the array itself: `quote.lines` is a fresh array on every
  // absorb, so depending on it directly would re-request on every unrelated re-render.
  const inputKey = useMemo(
    () => JSON.stringify([tier, lines.map((l) => [l.lineId, l.category, l.discountPct, l.lineTotal])]),
    [tier, lines],
  );

  // Guards against an older reply landing after a newer one and showing a score for a
  // discount the rep has already changed.
  const latest = useRef(inputKey);

  const run = useCallback(async () => {
    latest.current = inputKey;
    const mine = inputKey;

    if (unsupported || !tier || lines.length === 0) {
      setPreview(null);
      return;
    }

    setLoading(true);
    try {
      const result = await scoreBlended({ customerTier: tier, lines });
      if (latest.current !== mine) return;
      setPreview(result);
    } catch (error) {
      if (latest.current !== mine) return;
      // 404 means this backend predates the route. Stop asking; the authoritative score
      // from `useRisk` still renders, so the screen loses a nicety, not a number.
      if (error?.status === 404 || error?.code === 'NOT_FOUND') setUnsupported(true);
      setPreview(null);
    } finally {
      if (latest.current === mine) setLoading(false);
    }
  }, [inputKey, tier, lines, unsupported]);

  useEffect(() => {
    if (unsupported) return undefined;
    const timer = setTimeout(run, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [run, unsupported]);

  return { preview, loading, unsupported };
}
