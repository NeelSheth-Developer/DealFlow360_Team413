import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, EyeOff, Percent, Search, UserCircle2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { percent, tierLabel } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { CustomerEmailLookup } from '@/components/quotation/CustomerEmailLookup';

/**
 * Customer selection step before opening the builder.
 *
 * The customer is found by email rather than picked from a list of everyone. The
 * old grid could only ever be populated from local seed data — the server
 * refuses to enumerate customers — and a rep starting a quotation already knows
 * the address. Everything else on this page is unchanged.
 */
export default function NewQuotation() {
  const navigate = useNavigate();
  const tierCeilings = useAppStore((s) => s.tierCeilings);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);
  const createQuotation = useAppStore((s) => s.createQuotation);
  const currentUser = useAppStore((s) => s.currentUser);
  const canAssign = useAppStore((s) => s.canAssignQuotations());
  const reps = useAppStore((s) =>
    s.users.filter((u) => ['sales_rep', 'sales_manager'].includes(u.role)),
  );

  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // Governance config is manager/finance/admin only, so for a rep these maps stay empty.
  // Treat "empty" as "not permitted to read" rather than as a ceiling of zero.
  const tierCeiling = selectedCustomer ? tierCeilings?.[selectedCustomer.tier] : undefined;
  const canReadCeilings =
    typeof tierCeiling === 'number' && Object.keys(categoryCeilings ?? {}).length > 0;
  const [ownerId, setOwnerId] = useState(currentUser?.id ?? '');
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    if (!selectedCustomer) return;
    setBusy(true);
    const result = await createQuotation(selectedCustomer.id, canAssign ? ownerId : null);
    setBusy(false);

    if (!result.ok) {
      toast.error('Could not create the quotation', { description: result.error });
      return;
    }

    const quote = result.quotation;
    const ceiling = tierCeilings[quote.tier];

    toast.success(`${quote.reference} created for ${quote.customerName}`, {
      description: ceiling
        ? `Assigned to ${quote.ownerName} · ${tierLabel(quote.tier)} tier, up to ${ceiling}% before ceilings apply.`
        : `Assigned to ${quote.ownerName} · ${tierLabel(quote.tier)} tier.`,
    });
    // Routes take the uuid; `reference` is display-only.
    navigate(`/app/quotations/${quote.id}`);
  };

  return (
    <div>
      <PageHeader
        title="New quotation"
        description="Look up the customer by email. Their tier decides the price list applied and the discount ceiling every line is measured against."
        breadcrumbs={[{ label: 'Quotations', to: '/app/quotations' }, { label: 'New' }]}
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <GlassPanel
          title="Find the customer"
          description="Search by the email the customer registered with."
          icon={Search}
        >
          <CustomerEmailLookup onResolved={setSelectedCustomer} />
        </GlassPanel>

        <div className="space-y-4">
          <GlassPanel title="Discount ceilings in force" icon={Percent} accent="amber">
            {!selectedCustomer && (
              <p className="text-xs text-ink-muted">
                Find a customer to see the ceilings that will apply to this quotation.
              </p>
            )}

            {/*
              A sales_rep gets 403 on GET /config/discount, so both maps are legitimately
              empty rather than zero. Rendering them anyway produced "allows up to 0%" and
              an empty category list, which reads as a rule rather than a permission gap.
            */}
            {selectedCustomer && !canReadCeilings && (
              <div className="flex items-start gap-2.5 rounded-xl bg-white/60 p-3">
                <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">Ceilings aren&apos;t visible to you</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                    Discount governance is configured by a Sales Manager, Finance or Admin. You
                    don&apos;t need it here — the builder shows the binding ceiling next to every
                    discount field as you type, and flags any line that goes over.
                  </p>
                </div>
              </div>
            )}

            {selectedCustomer && canReadCeilings && (
              <div className="space-y-3">
                <div className="rounded-xl bg-brand-500/8 p-3">
                  <p className="text-xs font-bold text-ink">{selectedCustomer.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                    {tierLabel(selectedCustomer.tier)} tier allows up to{' '}
                    <span className="font-bold text-ink">{percent(tierCeiling, 0)}</span>. Each line
                    is also capped by its own category, whichever is stricter.
                  </p>
                </div>

                <ul className="space-y-1.5">
                  {Object.entries(categoryCeilings).map(([category, pct]) => {
                    // The binding ceiling is the stricter of the two (API-REFERENCE §10.0).
                    const binding = Math.min(pct, tierCeiling);
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
            )}
          </GlassPanel>

          <GlassPanel title="Assign an owner" icon={UserCircle2} accent="indigo">
            {canAssign ? (
              <Select
                label="Owning sales rep"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                // `team` is null for an unassigned rep (API-REFERENCE §3.1).
                options={reps.map((u) => ({
                  value: u.id,
                  label: u.team ? `${u.name} · ${u.team}` : u.name,
                }))}
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
              disabled={!selectedCustomer}
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

