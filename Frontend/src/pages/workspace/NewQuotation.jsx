import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Building2, Percent } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { percent, tierLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TierBadge } from '@/components/shared/Indicators';

/** Customer selection step before opening the builder. */
export default function NewQuotation() {
  const navigate = useNavigate();
  const customers = useAppStore((s) => s.customers);
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);
  const createQuotation = useAppStore((s) => s.createQuotation);

  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = () => {
    if (!selected) return;
    setBusy(true);
    const quote = createQuotation(selected);
    setBusy(false);

    if (!quote) {
      toast.error('Could not create the quotation.');
      return;
    }
    toast.success(`${quote.id} created for ${quote.customerName}`, {
      description: `${tierLabel(quote.tier)} tier · up to ${tierCeilings[quote.tier]}% discount before ceilings apply.`,
    });
    navigate(`/app/quotations/${quote.id}`);
  };

  const selectedCustomer = customers.find((c) => c.id === selected);

  return (
    <div>
      <PageHeader
        title="New quotation"
        description="Pick a customer. Their tier decides the price list applied and the discount ceiling every line is measured against."
        breadcrumbs={[{ label: 'Quotations', to: '/app/quotations' }, { label: 'New' }]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <GlassPanel title="Choose a customer" icon={Building2}>
          <ul className="grid gap-2 sm:grid-cols-2">
            {customers.map((customer) => {
              const active = selected === customer.id;
              return (
                <li key={customer.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(customer.id)}
                    aria-pressed={active}
                    className={cn(
                      'w-full rounded-xl border p-3 text-left transition-all',
                      active
                        ? 'border-brand-500/50 bg-brand-500/10 shadow-glass'
                        : 'border-brand-500/15 bg-white/55 hover:-translate-y-0.5 hover:border-brand-500/35',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-ink">
                          {customer.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
                          {customer.contactName} · {customer.industry}
                        </span>
                      </span>
                      <TierBadge tier={customer.tier} showIcon={false} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge tone="neutral" size="xs">
                        {customer.currency}
                      </Badge>
                      <span className="text-[11px] text-ink-muted">
                        ceiling {percent(tierCeilings[customer.tier], 0)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel title="Discount ceilings in force" icon={Percent} accent="amber">
            {selectedCustomer ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-brand-500/8 p-3">
                  <p className="text-xs font-bold text-ink">{selectedCustomer.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                    {tierLabel(selectedCustomer.tier)} tier allows up to{' '}
                    <span className="font-bold text-ink">
                      {percent(tierCeilings[selectedCustomer.tier], 0)}
                    </span>
                    . Each line is also capped by its own category, whichever is stricter.
                  </p>
                </div>

                <ul className="space-y-1.5">
                  {Object.entries(categoryCeilings).map(([category, pct]) => {
                    const tierPct = tierCeilings[selectedCustomer.tier];
                    const binding = Math.min(pct, tierPct);
                    return (
                      <li
                        key={category}
                        className="flex items-center justify-between rounded-lg bg-white/55 px-2.5 py-2"
                      >
                        <span className="text-xs font-semibold capitalize text-ink">{category}</span>
                        <span className="num text-xs font-bold text-brand-700">
                          {percent(binding, 0)}
                          {binding < pct && (
                            <span className="ml-1 font-normal text-ink-muted">(tier-capped)</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                Select a customer to see the ceilings that will apply to this quotation.
              </p>
            )}
          </GlassPanel>

          <GlassCard className="p-4">
            <Button
              fullWidth
              size="lg"
              iconRight={ArrowRight}
              disabled={!selected}
              loading={busy}
              onClick={handleCreate}
            >
              Create quotation
            </Button>
            <p className="mt-2 text-center text-[11px] text-ink-muted">
              You can change the customer later only by starting a new quotation.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
