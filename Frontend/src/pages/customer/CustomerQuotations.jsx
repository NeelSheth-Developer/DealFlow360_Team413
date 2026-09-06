import { Link } from 'react-router-dom';
import { ArrowRight, FileText, MessageSquare, Repeat } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useCustomerQuotes } from '@/hooks/useCustomerQuotes';
import { portalQuoteKey, statusMeta } from '@/services/customerPortalService';
import { dateShort, money, relativeTime, tierLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { RawBadge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/Misc';

/**
 * A customer's own quotation list.
 *
 * Every row here is the server's allow-list projection, fetched from
 * GET /customer/quotations and scoped by the session's own customer id in the query
 * itself. There is no filtering on this side, and a draft never appears because the
 * server does not return one.
 */
export default function CustomerQuotations() {
  const customer = useAppStore((s) => s.currentCustomer());
  const { quotes, loading } = useCustomerQuotes();

  const awaiting = quotes.filter((q) => q.canConfirm).length;
  const unread = quotes.filter((q) => q.unreadFromSeller).length;
  const totalValue = quotes.reduce((sum, q) => sum + (q.totals?.grandTotal ?? 0), 0);

  return (
    <div className="space-y-5">
      <GlassCard strong className="p-5">
        <p className="text-xs font-semibold text-ink-muted">Signed in as</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-ink">{customer?.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {customer?.contactName} · {tierLabel(customer?.tier)} price list
        </p>

        <dl className="border-brand-500/12 mt-4 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          <Stat label="Quotations" value={quotes.length} />
          <Stat label="Awaiting your decision" value={awaiting} tone="text-state-info" />
          <Stat label="New replies" value={unread} tone="text-accent-pink" />
          <Stat label="Total value" value={money(totalValue, customer?.currency)} />
        </dl>
      </GlassCard>

      <GlassPanel
        title="Your quotations"
        description="Open one to review the detail, ask a question or confirm."
        icon={FileText}
        accent="teal"
      >
        {loading && quotes.length === 0 ? (
          <div className="space-y-2.5">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Nothing to review yet"
            description="When your account manager shares a quotation, it appears here straight away. You won't need a link."
          />
        ) : (
          <ul className="space-y-2.5">
            {quotes.map((quote) => {
              const status = statusMeta(quote);
              const key = portalQuoteKey(quote);
              const lines = quote.lines ?? [];
              const recurring = lines.filter((l) => l.isRecurring).length;
              const comments = quote.messageCount ?? 0;

              return (
                <li key={key}>
                  <Link
                    to={`/customer/quotations/${key}`}
                    className="border-brand-500/12 group flex flex-wrap items-center gap-3 rounded-xl border bg-white/60 p-4 transition-all hover:-translate-y-0.5 hover:border-accent-pink/40 hover:shadow-glass"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="num text-xs font-bold text-accent-pink">
                          {quote.reference}
                        </span>
                        <RawBadge className={cn(status.bg, status.tone)} dot dotClass="bg-current">
                          {status.label}
                        </RawBadge>
                        {quote.unreadFromSeller && (
                          <RawBadge
                            className="bg-accent-pink/14 text-accent-pink"
                            icon={MessageSquare}
                          >
                            New reply
                          </RawBadge>
                        )}
                      </div>

                      <p className="mt-1.5 text-sm font-bold text-ink">
                        {quote.lineCount} item{quote.lineCount === 1 ? '' : 's'}
                        {recurring > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-indigo">
                            <Repeat className="h-3 w-3" aria-hidden="true" />
                            {recurring} recurring
                          </span>
                        )}
                      </p>

                      <p className="mt-0.5 text-[11px] text-ink-muted">
                        Valid until {dateShort(quote.validUntil)} · updated{' '}
                        {relativeTime(quote.lastActivityAt)}
                        {comments > 0 && ` · ${comments} message${comments === 1 ? '' : 's'}`}
                      </p>

                      {quote.canConfirm && (
                        <p className="mt-1 text-[11px] font-semibold text-state-info">
                          Waiting on your review
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="num text-lg font-extrabold text-ink">
                        {money(quote.totals?.grandTotal, quote.currency)}
                      </p>
                      {quote.totals?.savings > 0 && (
                        <p className="num text-[11px] font-semibold text-state-success">
                          saving {money(quote.totals.savings, quote.currency)}
                        </p>
                      )}
                    </div>

                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-pink"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className={cn('num mt-0.5 text-lg font-extrabold text-ink', tone)}>{value}</dd>
    </div>
  );
}
