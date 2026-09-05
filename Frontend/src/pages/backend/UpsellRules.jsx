import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Eye, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { explainFilteredSuggestions, rankSuggestions } from '@/lib/upsellEngine';
import { categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, ProgressBar, Slider, Switch } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const EMPTY = {
  triggerProductId: '',
  suggestedProductId: '',
  coPurchaseScore: 60,
  promoted: false,
  minMarginPct: 20,
  active: true,
};

/** Upsell and cross-sell rule setup (spec A6). */
export default function UpsellRules() {
  const rules = useAppStore((s) => s.upsellRules);
  const products = useAppStore((s) => s.products);
  const priceLists = useAppStore((s) => s.priceLists);
  const upsertUpsellRule = useAppStore((s) => s.upsertUpsellRule);
  const deleteUpsellRule = useAppStore((s) => s.deleteUpsellRule);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  // ------------------------------------------------------------ previewer
  const [previewProducts, setPreviewProducts] = useState(['p-laptop14']);
  const [previewTier, setPreviewTier] = useState('gold');

  const cartLines = previewProducts.map((id) => ({ productId: id }));

  const previewSuggestions = rankSuggestions({
    cartLines,
    products,
    upsellRules: rules,
    priceLists,
    tier: previewTier,
    currency: 'INR',
  });

  const filteredOut = explainFilteredSuggestions({
    cartLines,
    products,
    upsellRules: rules,
    priceLists,
    tier: previewTier,
    currency: 'INR',
  });

  const productName = (id) => products.find((p) => p.id === id)?.name ?? '—';

  const openEditor = (rule) => {
    setEditing(rule ?? 'new');
    setForm(rule ? { ...rule } : EMPTY);
  };

  const save = () => {
    if (!form.triggerProductId || !form.suggestedProductId) {
      toast.error('Pick both a trigger and a suggested product.');
      return;
    }
    if (form.triggerProductId === form.suggestedProductId) {
      toast.error('A product cannot suggest itself.');
      return;
    }
    upsertUpsellRule(editing === 'new' ? { ...form, id: undefined } : form);
    setEditing(null);
    toast.success(editing === 'new' ? 'Rule added' : 'Rule updated');
  };

  const togglePreviewProduct = (id) =>
    setPreviewProducts((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div>
      <PageHeader
        title="Upsell & cross-sell rules"
        description="Pairings surface in the builder's suggestion panel. Margin floors stop the engine ever recommending something margin-destructive."
        actions={
          <Button icon={Plus} onClick={() => openEditor(null)}>
            New Rule
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <GlassPanel
          title={`${rules.length} rule(s)`}
          icon={Sparkles}
          accent="pink"
          bodyClassName="px-0 py-0 sm:px-0"
        >
          <Table>
            <THead>
              <TR>
                <TH>Trigger product</TH>
                <TH>Suggests</TH>
                <TH>Co-purchase strength</TH>
                <TH align="center">Promoted</TH>
                <TH align="right">Min margin</TH>
                <TH align="center">Active</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rules.map((rule) => (
                <TR key={rule.id} className={cn(!rule.active && 'opacity-50')}>
                  <TD className="text-xs font-semibold">{productName(rule.triggerProductId)}</TD>
                  <TD className="text-xs font-semibold text-brand-700">
                    {productName(rule.suggestedProductId)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={rule.coPurchaseScore} max={100} className="w-20" />
                      <span className="num text-[11px] font-bold text-ink-soft">
                        {rule.coPurchaseScore}
                      </span>
                    </div>
                  </TD>
                  <TD align="center">
                    {rule.promoted ? (
                      <Badge tone="pink" size="xs">
                        Promoted
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-ink-muted">—</span>
                    )}
                  </TD>
                  <TD align="right" num className="text-ink-soft">
                    {percent(rule.minMarginPct, 0)}
                  </TD>
                  <TD align="center">
                    <Switch
                      id={`rule-active-${rule.id}`}
                      checked={rule.active}
                      onCheckedChange={(v) => upsertUpsellRule({ ...rule, active: v })}
                    />
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        icon={Pencil}
                        label="Edit rule"
                        size="xs"
                        onClick={() => openEditor(rule)}
                      />
                      <IconButton
                        icon={Trash2}
                        label="Delete rule"
                        size="xs"
                        variant="ghost"
                        className="text-state-danger hover:bg-state-danger/10"
                        onClick={() => {
                          deleteUpsellRule(rule.id);
                          toast.success('Rule removed');
                        }}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </GlassPanel>

        {/* ----------------------------------------------------- previewer */}
        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <GlassPanel
            title="Suggestion previewer"
            description="Build a sample cart and see exactly what the builder would show."
            icon={Eye}
            accent="teal"
          >
            <Select
              label="Customer tier"
              value={previewTier}
              onChange={(e) => setPreviewTier(e.target.value)}
              options={[
                { value: 'bronze', label: 'Bronze' },
                { value: 'silver', label: 'Silver' },
                { value: 'gold', label: 'Gold' },
              ]}
            />

            <p className="mb-1.5 mt-3 text-xs font-semibold text-ink-soft">
              Sample cart ({previewProducts.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {products
                .filter((p) => p.active)
                .slice(0, 12)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePreviewProduct(p.id)}
                    aria-pressed={previewProducts.includes(p.id)}
                    className={
                      previewProducts.includes(p.id)
                        ? 'rounded-lg bg-gradient-to-r from-brand-500 to-accent-indigo px-2 py-1 text-[10px] font-semibold text-white'
                        : 'rounded-lg bg-white/60 px-2 py-1 text-[10px] font-semibold text-ink-soft hover:text-brand-700'
                    }
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            {/* ranked results */}
            <div className="mt-4 border-t border-brand-500/12 pt-3.5">
              <p className="mb-2 text-xs font-bold text-ink">
                Would surface ({previewSuggestions.length})
              </p>

              {previewSuggestions.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="Nothing would surface"
                  description="No active rule matches this cart, or every match is below its margin floor."
                />
              ) : (
                <ol className="space-y-2">
                  {previewSuggestions.map((s, i) => (
                    <li key={s.productId} className="rounded-xl bg-white/60 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="num text-[10px] font-bold text-ink-muted">#{i + 1}</span>
                            <span className="truncate text-xs font-bold text-ink">
                              {s.productName}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[10px] text-ink-muted">
                            {categoryLabel(s.category)} · {money(s.price)}
                          </span>
                        </span>
                        {s.promoted && (
                          <Badge tone="pink" size="xs">
                            Promoted
                          </Badge>
                        )}
                      </div>

                      {/* score breakdown — the ranking is never a black box */}
                      <dl className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-brand-500/6 px-2 py-1.5">
                        <ScorePart label="Co-purch" value={s.breakdown.coPurchase} />
                        <ScorePart label="Promo" value={s.breakdown.promotion} />
                        <ScorePart label="Margin" value={s.breakdown.margin} />
                        <ScorePart label="Total" value={s.rankScore} strong />
                      </dl>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* filtered out */}
            {filteredOut.length > 0 && (
              <div className="mt-4 border-t border-brand-500/12 pt-3.5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Ban className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  Filtered out ({filteredOut.length})
                </p>
                <ul className="space-y-1">
                  {filteredOut.slice(0, 8).map((f) => (
                    <li key={f.ruleId} className="rounded-lg bg-white/45 px-2 py-1.5">
                      <p className="text-[11px] font-semibold text-ink">{f.productName}</p>
                      <p className="text-[10px] text-ink-muted">{f.reason}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </GlassPanel>

          <GlassCard className="p-4">
            <p className="text-xs font-bold text-ink">How ranking works</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
              Score = co-purchase strength + 25 if promoted + 30% of the product&apos;s margin
              percentage at the customer&apos;s tier price. Anything below its configured margin floor
              is dropped entirely rather than ranked low, so the panel can&apos;t nudge a rep toward a
              thin-margin add-on.
            </p>
          </GlassCard>
        </div>
      </div>

      {/* ------------------------------------------------------- editor */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New upsell rule' : 'Edit upsell rule'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing === 'new' ? 'Add rule' : 'Save changes'}</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Select
            label="When the cart contains"
            required
            placeholder="Select a trigger product"
            value={form.triggerProductId}
            onChange={(e) => setForm((f) => ({ ...f, triggerProductId: e.target.value }))}
            options={products.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
          />

          <Select
            label="Suggest"
            required
            placeholder="Select a product to suggest"
            value={form.suggestedProductId}
            onChange={(e) => setForm((f) => ({ ...f, suggestedProductId: e.target.value }))}
            options={products.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))}
          />

          <div className="rounded-xl bg-brand-500/8 p-3">
            <Slider
              label="Co-purchase strength"
              value={form.coPurchaseScore}
              min={0}
              max={100}
              step={1}
              valueLabel={String(form.coPurchaseScore)}
              onValueChange={(v) => setForm((f) => ({ ...f, coPurchaseScore: v }))}
            />
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Stands in for historical co-purchase frequency. Drives the base ranking score.
            </p>
          </div>

          <Input
            label="Minimum margin"
            type="number"
            min={0}
            max={100}
            suffix="%"
            value={form.minMarginPct}
            onChange={(e) => setForm((f) => ({ ...f, minMarginPct: Number(e.target.value) }))}
            hint="Suppressed entirely if the product's margin at tier price falls below this."
          />

          <Switch
            id="rule-promoted"
            label="Promoted"
            hint="Adds a +25 ranking boost and shows a Promoted badge."
            checked={form.promoted}
            onCheckedChange={(v) => setForm((f) => ({ ...f, promoted: v }))}
          />

          <Switch
            id="rule-active-form"
            label="Active"
            checked={form.active}
            onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
          />
        </div>
      </Dialog>
    </div>
  );
}

function ScorePart({ label, value, strong = false }) {
  return (
    <div className="text-center">
      <dt className="text-[9px] font-bold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={
          strong
            ? 'num text-[11px] font-extrabold text-brand-700'
            : 'num text-[11px] font-semibold text-ink-soft'
        }
      >
        {value.toFixed(0)}
      </dd>
    </div>
  );
}
