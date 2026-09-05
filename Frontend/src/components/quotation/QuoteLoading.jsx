import { Skeleton } from '@/components/ui/Misc';

/**
 * Placeholder for a quotation screen that is still resolving.
 *
 * It exists so a cold load — a deep link, a hard refresh, a notification link — shows
 * that something is on its way rather than an empty page or, worse, a redirect to Not
 * Found. The shape roughly matches the real header and body so the layout does not jump
 * when the data lands.
 */
export function QuoteLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading quotation…</span>
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-4 w-52" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
