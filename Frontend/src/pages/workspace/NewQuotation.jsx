import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, Building2, Percent, UserCircle2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { percent, tierLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { TierBadge } from '@/components/shared/Indicators';

/** Customer selection step before opening the builder. */
export default function NewQuotation() {
  const navigate = useNavigate();
  const customers = useAppStore((s) => s.customers);
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);
  const createQuotation = useAppStore((s) => s.createQuotation);
  const currentUser = useAppStore((s) => s.currentUser);
  const canAssign = useAppStore((s) => s.canAssignQuotations());
  const reps = useAppStore((s) =>
    s.users.filter((u) => ['sales_rep', 'sales_manager'].includes(u.role)),
  );

  const [selected, setSelected] = useState(null);
  const [ownerId, setOwnerId] = useState(currentUser?.id ?? '');
  const [busy, setBusy] = useState(false);

  const handleCreate = () => {
    if (!selected) return;
    setBusy(true);
    const quote = createQuotation(selected, canAssign ? ownerId : null);
    setBusy(false);

    if (!quote) {
      toast.error('Could not create the quotation.');
      return;
    }
    toast.success(`${quote.id} created for ${quote.customerName}`, {
      description: `Assigned to ${quote.ownerName} · ${tierLabel(quote.tier)} tier, up to ${tierCeilings[quote.tier]}% before ceilings apply.`,
    });
    navigate(`/app/quotations/${quote.id}`);
  };

  const selectedCustomer = customers.find((c) => c.id === selected);
  const registered = customers.filter((c) => c.password);
  const unclaimed = customers.filter((c) => !c.password);

  return (
    <div>
      <PageHeader
        title="New quotation"
        description="Pick a customer. Their tier decides the price list applied and the discount ceiling every line is measured against."
        breadcrumbs={[{ label: 'Quotations', to: '/app/quotations' }, { label: 'New' }]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <GlassPanel
          title="Assign to a customer"
          description="Only registered organisations appear here — customers create their own accounts."
          icon={Building2}
        >
          <ul className="grid gap-2 sm:grid-cols-2">
            {registered.map((customer) => (
              <li key={customer.id}>
                <CustomerOption
                  customer={customer}
                  active={selected === customer.id}
                  ceiling={tierCeilings[customer.tier]}
                  onSelect={() => setSelected(customer.id)}
                />
              </li>
            ))}
          </ul>

          {unclaimed.length > 0 && (
            <div className="mt-4 border-t border-brand-500/12 pt-4">
              <p className="mb-2 text-xs font-semibold text-ink-soft">
                Not yet registered ({unclaimed.length})
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {unclaimed.map((customer) => (
                  <li key={customer.id}>
                    <CustomerOption
                      customer={customer}
                      active={selected === customer.id}
                      ceiling={tierCeilings[customer.tier]}
                      unclaimed
                      onSelect={() => setSelected(customer.id)}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                You can quote these organisations, but they need to sign up at{' '}
                <code className="rounded bg-white/70 px-1 py-0.5 text-[10px]">/customer/signup</code>{' '}
                with their contact email before they can review it online.
              </p>
            </div>
          )}
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

          <GlassPanel title="Assign an owner" icon={UserCircle2} accent="indigo">
            {canAssign ? (
              <Select
                label="Owning sales rep"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                options={reps.map((u) => ({ value: u.id, label: `${u.name} · ${u.team}` }))}
                hint="As an Admin or Sales Manager you can assign this to any rep."
              />
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2.5">
                  <UserCircle2 className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                  <span className="text-xs font-bold text-ink">{currentUser?.name}</span>
                  <Badge tone="indigo" size="xs" className="ml-auto">
                    You
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                  Reps own what they create. A Sales Manager or Admin can reassign it later.
                </p>
              </>
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
              The customer is fixed once created. Start a new quotation to bill someone else.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function CustomerOption({ customer, active, ceiling, unclaimed = false, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
          <span className="block truncate text-sm font-bold text-ink">{customer.name}</span>
          <span className="mt-0.5 block truncate text-[11px] text-ink-muted">
            {customer.contactName}
            {customer.industry ? ` · ${customer.industry}` : ''}
          </span>
        </span>
        <TierBadge tier={customer.tier} showIcon={false} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge tone="neutral" size="xs">
          {customer.currency}
        </Badge>
        <span className="text-[11px] text-ink-muted">ceiling {percent(ceiling, 0)}</span>
        {unclaimed && (
          <Badge tone="warning" size="xs">
            No login yet
          </Badge>
        )}
      </div>
    </button>
  );
}
