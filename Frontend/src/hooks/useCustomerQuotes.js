import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Customer-scoped read models.
 *
 * These used to project internal quotations through `toCustomerView` inside a useMemo.
 * That is gone: the server returns the allow-list projection, so what these hooks return
 * is the payload itself. Nothing is recomputed, so nothing can drift out of step with
 * what the server decided the customer may see — and the "getSnapshot should be cached"
 * churn the old version worked around cannot happen, because the object is a stable
 * reference from the store rather than one rebuilt on every read.
 *
 * Ownership is not checked here either. Every `/customer/*` query is scoped by the
 * session's own customer id server-side, and another customer's record answers 404
 * rather than 403 — so a list can only ever contain this customer's own quotations.
 */

/**
 * One state object rather than two, so a resolve and a not-found never land in separate
 * renders and briefly describe an impossible situation.
 */
function useLoadState() {
  const [state, set] = useState({ resolving: true, missing: false });
  const update = useCallback((next) => set(next), []);
  return [state, update];
}

/** Every quotation shared with the signed-in customer, newest activity first. */
export function useCustomerQuotes() {
  const quotes = useAppStore((s) => s.myQuotations);
  const loading = useAppStore((s) => s.portalLoading);
  const loadMyQuotations = useAppStore((s) => s.loadMyQuotations);
  const customerUser = useAppStore((s) => s.customerUser);

  useEffect(() => {
    if (customerUser) loadMyQuotations();
  }, [customerUser, loadMyQuotations]);

  return { quotes, loading };
}

/**
 * One quotation.
 *
 * `missing` is kept separate from "not loaded yet": a portal deep link renders before the
 * fetch resolves, and redirecting on the first frame would bounce a customer away from a
 * quotation that exists.
 */
export function useCustomerQuote(quoteId) {
  const view = useAppStore((s) => (quoteId ? s.myQuotationViews[quoteId] : null)) ?? null;
  const loadMyQuotation = useAppStore((s) => s.loadMyQuotation);
  const customerUser = useAppStore((s) => s.customerUser);

  const [state, setState] = useLoadState();

  useEffect(() => {
    if (!customerUser || !quoteId) {
      setState({ resolving: false, missing: !quoteId });
      return undefined;
    }

    let cancelled = false;
    setState({ resolving: true, missing: false });

    loadMyQuotation(quoteId).then((result) => {
      if (cancelled) return;
      setState({ resolving: false, missing: Boolean(result.notFound) });
    });

    return () => {
      cancelled = true;
    };
  }, [customerUser, quoteId, loadMyQuotation, setState]);

  return { view, resolving: state.resolving, missing: state.missing };
}
