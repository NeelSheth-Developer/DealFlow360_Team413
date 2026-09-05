import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Resolves one quotation for a detail screen, fetching it when the cache does not have it.
 *
 * WHY THIS EXISTS: every quotation screen used to read
 * `quotations.find(q => q.id === id)` and redirect to /404 the moment it came back
 * undefined. That was safe while the store was seeded — the row was always there on the
 * first render. Against the API it is a race: a deep link, a hard refresh, a bookmark or
 * a notification link all render before any list has loaded, so the page bounced the user
 * to a Not Found for a quotation that exists.
 *
 * `resolving` is the distinction that fixes it: "not loaded yet" and "does not exist" are
 * different answers and only the second should redirect. A genuine 404 from the server
 * ends the wait and sets `missing`.
 *
 * The fetch runs even when the row is already cached, because a list response is a
 * summary of a moment ago and a detail screen makes decisions — approve, override,
 * settle — that must be based on the current record.
 */
export function useQuotation(id) {
  const quote = useAppStore((s) => s.quotations.find((q) => q.id === id));
  const fetchQuotation = useAppStore((s) => s.fetchQuotation);

  const [resolving, setResolving] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) {
      setResolving(false);
      setMissing(true);
      return undefined;
    }

    let cancelled = false;
    setResolving(true);
    setMissing(false);

    fetchQuotation(id).then((result) => {
      if (cancelled) return;
      // 404 is also the answer when the quotation belongs to somebody the caller cannot
      // see, which is deliberate on the server's side — a 403 would confirm it exists.
      setMissing(!result.ok && result.code !== 'NETWORK_ERROR');
      setResolving(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, fetchQuotation]);

  return { quote: quote ?? null, resolving, missing };
}
