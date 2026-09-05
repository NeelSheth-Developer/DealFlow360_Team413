import { useMemo } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { isSharedWithCustomer, toCustomerView } from '@/lib/customerView';

/**
 * Stable customer-scoped read models.
 *
 * `toCustomerView` builds a fresh object every call, so running it *inside* a
 * zustand selector would hand React a new snapshot on every store change. React
 * 18's useSyncExternalStore requires a cached snapshot — an uncached one causes
 * render churn and can trigger the "getSnapshot should be cached" warning, which
 * is what made the chat panel feel unresponsive.
 *
 * These hooks therefore select only raw slices and do the projection in a
 * useMemo, so the result is referentially stable until its real inputs change.
 */

/** Every quotation shared with the signed-in customer, newest activity first. */
export function useCustomerQuotes() {
  const quotations = useAppStore((s) => s.quotations);
  const products = useAppStore((s) => s.products);
  const plans = useAppStore((s) => s.subscriptionPlans);
  const customerUser = useAppStore((s) => s.customerUser);

  return useMemo(() => {
    if (!customerUser) return [];
    return quotations
      .filter((q) => q.customerId === customerUser.id && isSharedWithCustomer(q))
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
      .map((q) => toCustomerView(q, { products, plans }));
  }, [quotations, products, plans, customerUser]);
}

/** One quotation, or null when it is not this customer's to see. */
export function useCustomerQuote(quoteId) {
  const quotations = useAppStore((s) => s.quotations);
  const products = useAppStore((s) => s.products);
  const plans = useAppStore((s) => s.subscriptionPlans);
  const customerUser = useAppStore((s) => s.customerUser);

  return useMemo(() => {
    if (!customerUser || !quoteId) return null;
    const quote = quotations.find((q) => q.id === quoteId);
    if (!quote) return null;
    // Ownership check mirrors the store's — a customer can only ever read a
    // quotation addressed to their own organisation, and only once shared.
    if (quote.customerId !== customerUser.id) return null;
    if (!isSharedWithCustomer(quote)) return null;
    return toCustomerView(quote, { products, plans });
  }, [quotations, products, plans, customerUser, quoteId]);
}
