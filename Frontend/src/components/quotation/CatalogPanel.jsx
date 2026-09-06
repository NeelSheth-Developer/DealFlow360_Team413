import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Misc';
import { EmptyState } from '@/components/ui/Misc';

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'service', label: 'Services' },
  { value: 'subscription', label: 'Subscriptions' },
  { value: 'accessories', label: 'Accessories' },
];

const STOCK_META = {
  full: { dot: 'bg-state-success', label: 'In stock' },
  partial: { dot: 'bg-accent-amber', label: 'Partial stock' },
  none: { dot: 'bg-state-danger', label: 'Backorder' },
};

/** Left-hand product picker in the builder. */
export function CatalogPanel({ items, currency, onAdd, disabled }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [planChoice, setPlanChoice] = useState({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((p) => {
      if (category && p.category !== category) return false;
      if (term && !`${p.name} ${p.sku}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [items, search, category]);

  return (
    /* `min-h-0 flex-1` rather than `h-full`: this sits inside a flex column, so it
       takes the remaining space directly instead of asking for 100% of a parent whose
       height is only a max. `min-h-0` is what lets it shrink below its content so the
       list below can scroll. */
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2.5 border-b border-brand-500/12 pb-3">
        <Input
          placeholder="Search catalog…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<Search className="h-3.5 w-3.5" />}
          className="pl-9"
          aria-label="Search catalog"
        />
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={cn(
                'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors',
                category === cat.value
                  ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white'
                  : 'bg-white/60 text-ink-soft hover:text-brand-700',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nothing matches"
            description="Try a different search term or category."
          />
        ) : (
          filtered.map((product) => {
            const stock = STOCK_META[product.stock.level];
            const isSubscription = product.category === 'subscription';
            const selectedPlan = planChoice[product.id] ?? product.plans[0]?.id ?? '';

            return (
              <article
                key={product.id}
                className="rounded-xl border border-brand-500/12 bg-white/55 p-3 transition-colors hover:border-brand-500/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{product.name}</p>
                    <p className="mt-0.5 text-[10px] text-ink-muted">{product.sku}</p>
                  </div>
                  {product.inCartQty > 0 && (
                    <Badge tone="brand" size="xs">
                      {product.inCartQty} in cart
                    </Badge>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge
                    tone={
                      product.category === 'hardware'
                        ? 'indigo'
                        : product.category === 'service'
                          ? 'pink'
                          : product.category === 'subscription'
                            ? 'teal'
                            : 'neutral'
                    }
                    size="xs"
                  >
                    {categoryLabel(product.category)}
                  </Badge>

                  <Tooltip content={`Margin at this customer's tier price`}>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                        product.marginPct >= 40
                          ? 'bg-state-success/14 text-state-success'
                          : product.marginPct >= 25
                            ? 'bg-accent-amber/14 text-accent-amber'
                            : 'bg-state-danger/12 text-state-danger',
                      )}
                    >
                      {percent(product.marginPct, 0)} margin
                    </span>
                  </Tooltip>

                  {!isSubscription && product.category !== 'service' && (
                    <Tooltip content={`${stock.label} — ${product.stock.total} unit(s) across the network`}>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
                        <span className={cn('h-1.5 w-1.5 rounded-full', stock.dot)} />
                        {product.stock.total}
                      </span>
                    </Tooltip>
                  )}
                </div>

                {isSubscription && product.plans.length > 0 && (
                  <Select
                    className="mt-2 h-8 text-[11px]"
                    aria-label={`Billing plan for ${product.name}`}
                    value={selectedPlan}
                    onChange={(e) => setPlanChoice((s) => ({ ...s, [product.id]: e.target.value }))}
                    options={product.plans.map((pl) => ({
                      value: pl.id,
                      label: `${pl.name} (${pl.cadence})`,
                    }))}
                  />
                )}

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
                  <span className="num min-w-0 text-sm font-extrabold text-ink">
                    {money(product.price, currency)}
                    <span className="ml-1 text-[10px] font-normal text-ink-muted">
                      /{product.unit}
                    </span>
                  </span>
                  <Button
                    size="xs"
                    icon={Plus}
                    className="ml-auto shrink-0"
                    disabled={disabled}
                    onClick={() => onAdd(product.id, isSubscription ? selectedPlan : null)}
                  >
                    Add
                  </Button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
