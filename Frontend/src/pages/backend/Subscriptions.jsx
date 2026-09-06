import { useState } from 'react';
import { toast } from 'sonner';
import { Info, Pencil, Plus, Repeat } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { computeProration } from '@/lib/billingEngine';
import {
  cadenceLabel,
  cancellationRuleLabel,
  moneyPrecise,
  prorationRuleLabel,
} from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const CADENCES = ['monthly', 'quarterly', 'yearly'].map((c) => ({
  value: c,
  label: cadenceLabel(c),
}));

const PRORATION_RULES = ['daily_prorate', 'full_period', 'next_cycle_adjust'].map((r) => ({
  value: r,
  label: prorationRuleLabel(r),
}));

const CANCELLATION_RULES = ['refund_unused', 'no_refund', 'credit_note_only'].map((r) => ({
  value: r,
  label: cancellationRuleLabel(r),
}));

const EMPTY = {
  name: '',
  cadence: 'monthly',
  productIds: [],
  prorationRule: 'daily_prorate',
  cancellationRule: 'refund_unused',
  minCommitmentMonths: 0,
  trialDays: 0,
  billingDayOfCycle: 1,
  active: true,
};

// Fixed sample used by the worked-example card so the number is reproducible.
const SAMPLE_LINE = { unitPrice: 1200, discountPct: 0, qty: 10 };

/** Subscription plan setup (spec A5). */
export default function Subscriptions() {
  const plans = useAppStore((s) => s.subscriptionPlans);
  // `isBooted` flips once loadReferenceData has run, so an empty list before that is
  // 'not fetched yet' rather than 'no plans configured'.
  const isBooted = useAppStore((s) => s.isBooted);
  const products = useAppStore((s) => s.products);
  const upsertSubscriptionPlan = useAppStore((s) => s.upsertSubscriptionPlan);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const subscriptionProducts = products.filter((p) => p.category === 'subscription');

  const openEditor = (plan) => {
    setEditing(plan ?? 'new');
    setForm(plan ? { ...plan } : EMPTY);
  };

  const save = () => {
    if (!form.name?.trim()) {
      toast.error('Give the plan a name.');
      return;
    }
    const saved = upsertSubscriptionPlan(editing === 'new' ? { ...form, id: undefined } : form);
    setEditing(null);
    toast.success(editing === 'new' ? 'Plan created' : 'Plan updated', {
      description: `${saved.name} · ${prorationRuleLabel(saved.prorationRule)}`,
    });
  };

  // Worked example for whichever proration rule is currently selected.
  const example = computeProration({
    line: SAMPLE_LINE,
    oldQty: 10,
    newQty: 12,
    plan: { cadence: form.cadence, prorationRule: form.prorationRule },
    changeDate: new Date(Date.now() + 12 * 86400000),
    cycleStartDate: new Date(),
  });

  const toggleProduct = (productId) =>
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(productId)
        ? f.productIds.filter((p) => p !== productId)
        : [...f.productIds, productId],
    }));

  return (
    <div>
      <PageHeader
        title="Subscription plans"
        description="Cadence, proration and cancellation rules. These drive every recurring charge and credit note in the app."
        actions={
          <Button icon={Plus} onClick={() => openEditor(null)}>
            New Plan
          </Button>
        }
      />

      <GlassPanel
        title={plans.length === 0 && !isBooted ? 'Loading plans…' : `${plans.length} plan(s)`}
        icon={Repeat}
        accent="indigo"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <Table>
          <THead>
            <TR>
              <TH>Plan</TH>
              <TH>Cadence</TH>
              <TH align="center">Products</TH>
              <TH>Proration</TH>
              <TH>Cancellation</TH>
              <TH align="center">Commitment</TH>
              <TH align="center">Trial</TH>
              <TH align="right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {plans.map((plan) => (
              <TR key={plan.id}>
                <TD>
                  <p className="text-xs font-bold text-ink">{plan.name}</p>
                  {!plan.active && (
                    <Badge tone="neutral" size="xs" className="mt-1">
                      Inactive
                    </Badge>
                  )}
                </TD>
                <TD>
                  <Badge tone="teal" size="xs">
                    {cadenceLabel(plan.cadence)}
                  </Badge>
                </TD>
                <TD align="center" num className="text-ink-soft">
                  {plan.productIds.length}
                </TD>
                <TD className="text-[11px] text-ink-soft">{prorationRuleLabel(plan.prorationRule)}</TD>
                <TD className="text-[11px] text-ink-soft">
                  {cancellationRuleLabel(plan.cancellationRule)}
                </TD>
                <TD align="center" num className="text-ink-soft">
                  {plan.minCommitmentMonths ? `${plan.minCommitmentMonths}mo` : '—'}
                </TD>
                <TD align="center" num className="text-ink-soft">
                  {plan.trialDays ? `${plan.trialDays}d` : '—'}
                </TD>
                <TD align="right">
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${plan.name}`}
                    size="xs"
                    onClick={() => openEditor(plan)}
                  />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </GlassPanel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <RuleCard
          title="Daily prorate"
          body="Charges or credits the unused portion of the current cycle immediately, based on days remaining. The fairest option and the most common default."
        />
        <RuleCard
          title="Full period"
          body="Nothing changes mid-cycle. The new quantity applies from the next cycle. Simplest to reconcile, least flexible for the customer."
        />
        <RuleCard
          title="Adjust next cycle"
          body="Nothing charged today; the difference is folded into the next invoice. Avoids off-cycle transactions while still settling the delta."
        />
      </div>

      {/* ------------------------------------------------------- editor */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New subscription plan' : form.name}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing === 'new' ? 'Create plan' : 'Save changes'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label="Plan name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            wrapperClassName="sm:col-span-2"
          />
          <Select
            label="Billing cadence"
            options={CADENCES}
            value={form.cadence}
            onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value }))}
          />
          <Input
            label="Billing day of cycle"
            type="number"
            min={1}
            max={28}
            value={form.billingDayOfCycle}
            onChange={(e) => setForm((f) => ({ ...f, billingDayOfCycle: Number(e.target.value) }))}
          />
          <Select
            label="Proration rule"
            options={PRORATION_RULES}
            value={form.prorationRule}
            onChange={(e) => setForm((f) => ({ ...f, prorationRule: e.target.value }))}
          />
          <Select
            label="Cancellation rule"
            options={CANCELLATION_RULES}
            value={form.cancellationRule}
            onChange={(e) => setForm((f) => ({ ...f, cancellationRule: e.target.value }))}
          />
          <Input
            label="Minimum commitment"
            type="number"
            min={0}
            suffix="months"
            value={form.minCommitmentMonths}
            onChange={(e) => setForm((f) => ({ ...f, minCommitmentMonths: Number(e.target.value) }))}
          />
          <Input
            label="Trial period"
            type="number"
            min={0}
            suffix="days"
            value={form.trialDays}
            onChange={(e) => setForm((f) => ({ ...f, trialDays: Number(e.target.value) }))}
          />
        </div>

        {/* worked example */}
        <div className="mt-4 rounded-xl border border-brand-500/20 bg-brand-500/8 p-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-brand-700">
            <Info className="h-3 w-3" aria-hidden="true" />
            Worked example — {prorationRuleLabel(form.prorationRule)}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
            10 seats at {moneyPrecise(SAMPLE_LINE.unitPrice)} each, increased to 12 on day 12 of a{' '}
            {form.cadence} cycle:
          </p>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-ink">
            {example.explanation}
          </p>
        </div>

        {/* attached products */}
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-ink-soft">
            Attached products ({form.productIds.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {subscriptionProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => toggleProduct(product.id)}
                aria-pressed={form.productIds.includes(product.id)}
                className={
                  form.productIds.includes(product.id)
                    ? 'rounded-lg bg-gradient-to-r from-brand-500 to-accent-indigo px-2.5 py-1.5 text-[11px] font-semibold text-white'
                    : 'rounded-lg bg-white/60 px-2.5 py-1.5 text-[11px] font-semibold text-ink-soft transition-colors hover:text-brand-700'
                }
              >
                {product.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">
            A subscription product offers these plans in the builder&apos;s catalog panel.
          </p>
        </div>

        <div className="mt-4">
          <Switch
            id="plan-active"
            label="Active"
            hint="Inactive plans can't be selected on new quotations."
            checked={form.active}
            onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
          />
        </div>
      </Dialog>
    </div>
  );
}

function RuleCard({ title, body }) {
  return (
    <GlassCard className="p-4">
      <p className="text-xs font-bold text-ink">{title}</p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{body}</p>
    </GlassCard>
  );
}
