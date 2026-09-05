import { useState } from 'react';
import { ChevronDown, Sparkles, TrendingUp, Undo2, X } from 'lucide-react';
import { categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Misc';
import { ProgressBar } from '@/components/ui/Misc';

/**
 * Ranked upsell / cross-sell suggestions (spec B5).
 *
 * Dismissals are non-destructive — they collapse into an undo tray rather than
 * disappearing, so a rep who dismisses by accident isn't stuck.
 */
export function UpsellPanel({
  suggestions,
  dismissed,
  currency,
  disabled,
  onAccept,
  onDismiss,
  onUndoDismiss,
}) {
  const [trayOpen, setTrayOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {suggestions.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No suggestions right now"
          description="Add a product with a configured pairing, or relax the margin floor in the back-end upsell rules."
        />
      ) : (
        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {suggestions.map((s) => (
            <li
              key={s.productId}
              className={cn(
                'rounded-xl border bg-white/60 p-3 transition-colors',
                s.promoted ? 'border-accent-pink/35' : 'border-brand-500/12',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-ink">{s.productName}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{s.reason}</p>
                </div>
                {s.promoted && (
                  <Badge tone="pink" size="xs" className="shrink-0">
                    Promoted
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral" size="xs">
                  {categoryLabel(s.category)}
                </Badge>
                <span className="num inline-flex items-center gap-1 rounded-full bg-state-success/12 px-1.5 py-0.5 text-[10px] font-bold text-state-success">
                  <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
                  +{money(s.marginDelta, currency)} margin
                </span>
                <span className="num rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                  {percent(s.marginPct, 0)}
                </span>
              </div>

              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-ink-muted">
                    Co-purchase strength
                  </span>
                  <span className="num text-[10px] font-bold text-brand-700">
                    {s.coPurchaseScore}
                  </span>
                </div>
                <ProgressBar value={s.coPurchaseScore} max={100} />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="num text-sm font-extrabold text-ink">
                  {money(s.price, currency)}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => onDismiss(s.productId)}
                  >
                    Dismiss
                  </Button>
                  <Button size="xs" disabled={disabled} onClick={() => onAccept(s.productId)}>
                    Add to Quote
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------- dismissed tray */}
      {dismissed.length > 0 && (
        <div className="mt-3 border-t border-brand-500/12 pt-3">
          <button
            type="button"
            onClick={() => setTrayOpen((v) => !v)}
            aria-expanded={trayOpen}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:text-brand-700"
          >
            <span className="inline-flex items-center gap-1.5">
              <X className="h-3 w-3" aria-hidden="true" />
              Dismissed ({dismissed.length})
            </span>
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', trayOpen && 'rotate-180')}
              aria-hidden="true"
            />
          </button>

          {trayOpen && (
            <ul className="mt-1.5 space-y-1">
              {dismissed.map((d) => (
                <li
                  key={d.productId}
                  className="flex items-center gap-2 rounded-lg bg-white/50 px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
                    {d.productName}
                  </span>
                  <IconButton
                    icon={Undo2}
                    label={`Restore ${d.productName} suggestion`}
                    size="xs"
                    variant="ghost"
                    onClick={() => onUndoDismiss(d.productId)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
