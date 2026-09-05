import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { productMarginPct } from '@/lib/pricing';
import { categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button, IconButton } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Dialog';
import { EmptyState, Switch } from '@/components/ui/Misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const CATEGORIES = ['hardware', 'service', 'subscription', 'accessories'].map((c) => ({
  value: c,
  label: categoryLabel(c),
}));

const TIERS = ['bronze', 'silver', 'gold'];
const CURRENCIES = ['INR', 'USD'];

const EMPTY = {
  name: '',
  sku: '',
  category: 'hardware',
  basePrice: 0,
  costPrice: 0,
  unit: 'unit',
  taxPct: 18,
  description: '',
  variants: [],
  active: true,
};

/** Product and price list management (spec A2). */
export default function Products() {
  const products = useAppStore((s) => s.products);
  const priceLists = useAppStore((s) => s.priceLists);
  const upsertProduct = useAppStore((s) => s.upsertProduct);
  const setProductActive = useAppStore((s) => s.setProductActive);
  const duplicateProduct = useAppStore((s) => s.duplicateProduct);
  const upsertPriceListEntry = useAppStore((s) => s.upsertPriceListEntry);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category !== categoryFilter) return false;
      if (term && !`${p.name} ${p.sku}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [products, search, categoryFilter]);

  const openEditor = (product) => {
    setEditing(product ?? 'new');
    setForm(product ? { ...product } : EMPTY);
    setErrors({});
  };

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: null }));
  };

  const save = () => {
    const next = {};
    if (!form.name?.trim()) next.name = 'Name is required.';
    if (Number(form.basePrice) < 0) next.basePrice = 'Price cannot be negative.';
    if (Number(form.taxPct) < 0 || Number(form.taxPct) > 100) next.taxPct = 'Tax must be 0–100.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    const saved = upsertProduct(editing === 'new' ? { ...form, id: undefined } : form);
    setEditing(null);
    toast.success(editing === 'new' ? 'Product created' : 'Product updated', {
      description: `${saved.name} · ${percent(productMarginPct(saved), 0)} margin at list price.`,
    });
  };

  const marginNow = productMarginPct({ basePrice: form.basePrice, costPrice: form.costPrice });

  return (
    <div>
      <PageHeader
        title="Products & price lists"
        description="Cost price drives every margin figure in the app, including the upsell engine's margin floors."
        actions={
          <Button icon={Plus} onClick={() => openEditor(null)}>
            New Product
          </Button>
        }
      />

      <GlassCard className="mb-4 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:max-w-xl">
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
            className="pl-9"
            aria-label="Search products"
          />
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            placeholder="All categories"
            aria-label="Filter by category"
            options={CATEGORIES}
          />
        </div>
      </GlassCard>

      <GlassPanel
        title={`${filtered.length} product(s)`}
        icon={Package}
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {filtered.length === 0 ? (
          <EmptyState icon={Search} title="No products match" description="Try a different search." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Category</TH>
                <TH align="right">List price</TH>
                <TH align="right">Cost</TH>
                <TH align="right">Margin</TH>
                <TH align="center">Tax</TH>
                <TH align="center">Variants</TH>
                <TH align="center">Active</TH>
                <TH align="right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((product) => {
                const margin = productMarginPct(product);
                return (
                  <TR key={product.id} className={cn(!product.active && 'opacity-50')}>
                    <TD>
                      <p className="text-xs font-bold text-ink">{product.name}</p>
                      <p className="num text-[10px] text-ink-muted">{product.sku}</p>
                    </TD>
                    <TD>
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
                    </TD>
                    <TD align="right" num>
                      {money(product.basePrice)}
                    </TD>
                    <TD align="right" num className="text-ink-soft">
                      {money(product.costPrice)}
                    </TD>
                    <TD align="right">
                      <span
                        className={cn(
                          'num font-bold',
                          margin >= 40
                            ? 'text-state-success'
                            : margin >= 25
                              ? 'text-accent-amber'
                              : 'text-state-danger',
                        )}
                      >
                        {percent(margin, 0)}
                      </span>
                    </TD>
                    <TD align="center" num className="text-ink-soft">
                      {product.taxPct}%
                    </TD>
                    <TD align="center" num className="text-ink-soft">
                      {product.variants.length || '—'}
                    </TD>
                    <TD align="center">
                      <Switch
                        id={`active-${product.id}`}
                        checked={product.active}
                        onCheckedChange={(v) => setProductActive(product.id, v)}
                      />
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${product.name}`}
                          size="xs"
                          onClick={() => openEditor(product)}
                        />
                        <IconButton
                          icon={Copy}
                          label={`Duplicate ${product.name}`}
                          size="xs"
                          onClick={() => {
                            const copy = duplicateProduct(product.id);
                            if (copy) toast.success(`${copy.name} created`);
                          }}
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </GlassPanel>

      {/* ------------------------------------------------------- editor */}
      <Drawer
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New product' : form.name}
        description="General info, variants and tier pricing."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing === 'new' ? 'Create product' : 'Save changes'}</Button>
          </>
        }
      >
        <Tabs defaultValue="general">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="variants" count={form.variants.length}>
              Variants
            </TabsTrigger>
            <TabsTrigger value="pricing">Price lists</TabsTrigger>
          </TabsList>

          {/* ----------------------------------------------- general */}
          <TabsContent value="general">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Input
                label="Name"
                required
                value={form.name}
                error={errors.name}
                onChange={(e) => setField('name', e.target.value)}
                wrapperClassName="sm:col-span-2"
              />
              <Input label="SKU" value={form.sku} onChange={(e) => setField('sku', e.target.value)} />
              <Select
                label="Category"
                options={CATEGORIES}
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
              />
              <Input
                label="List price"
                type="number"
                min={0}
                value={form.basePrice}
                error={errors.basePrice}
                onChange={(e) => setField('basePrice', Number(e.target.value))}
              />
              <Input
                label="Cost price"
                type="number"
                min={0}
                value={form.costPrice}
                onChange={(e) => setField('costPrice', Number(e.target.value))}
                hint="Never shown to customers."
              />
              <Input
                label="Unit"
                value={form.unit}
                onChange={(e) => setField('unit', e.target.value)}
                hint="e.g. unit, seat / month, engagement"
              />
              <Input
                label="Tax"
                type="number"
                min={0}
                max={100}
                suffix="%"
                value={form.taxPct}
                error={errors.taxPct}
                onChange={(e) => setField('taxPct', Number(e.target.value))}
              />
              <Textarea
                label="Description"
                rows={3}
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                wrapperClassName="sm:col-span-2"
              />
            </div>

            <div
              className={cn(
                'mt-4 rounded-xl p-3',
                marginNow >= 30 ? 'bg-state-success/10' : 'bg-accent-amber/10',
              )}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Margin at list price
              </p>
              <p
                className={cn(
                  'num mt-1 text-2xl font-extrabold',
                  marginNow >= 30 ? 'text-state-success' : 'text-accent-amber',
                )}
              >
                {percent(marginNow)}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                {money(form.basePrice - form.costPrice)} per {form.unit}. Upsell rules with a margin
                floor above this figure will suppress this product.
              </p>
            </div>

            <div className="mt-4">
              <Switch
                id="product-active"
                label="Active"
                hint="Inactive products can't be added to new quotations."
                checked={form.active}
                onCheckedChange={(v) => setField('active', v)}
              />
            </div>
          </TabsContent>

          {/* ---------------------------------------------- variants */}
          <TabsContent value="variants">
            <p className="mb-3 text-xs leading-relaxed text-ink-soft">
              Variants add an uplift on top of the list price — for example a memory upgrade or a
              larger screen size.
            </p>

            <ul className="space-y-2">
              {form.variants.map((variant, i) => (
                <li key={i} className="grid gap-2 rounded-xl bg-white/55 p-2.5 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <Input
                    aria-label={`Attribute ${i + 1}`}
                    placeholder="Attribute (e.g. Memory)"
                    value={variant.attribute}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...variant, attribute: e.target.value };
                      setField('variants', next);
                    }}
                  />
                  <Input
                    aria-label={`Value ${i + 1}`}
                    placeholder="Value (e.g. 32GB)"
                    value={variant.value}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...variant, value: e.target.value };
                      setField('variants', next);
                    }}
                  />
                  <Input
                    aria-label={`Extra price ${i + 1}`}
                    type="number"
                    placeholder="Extra"
                    value={variant.extraPrice}
                    onChange={(e) => {
                      const next = [...form.variants];
                      next[i] = { ...variant, extraPrice: Number(e.target.value) };
                      setField('variants', next);
                    }}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Remove variant ${i + 1}`}
                    size="md"
                    variant="ghost"
                    className="self-center text-state-danger hover:bg-state-danger/10"
                    onClick={() =>
                      setField(
                        'variants',
                        form.variants.filter((_, idx) => idx !== i),
                      )
                    }
                  />
                </li>
              ))}
            </ul>

            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              className="mt-3"
              onClick={() =>
                setField('variants', [
                  ...form.variants,
                  { attribute: '', value: '', extraPrice: 0 },
                ])
              }
            >
              Add variant
            </Button>
          </TabsContent>

          {/* ----------------------------------------------- pricing */}
          <TabsContent value="pricing">
            {editing === 'new' ? (
              <p className="rounded-xl bg-brand-500/8 p-3 text-xs leading-relaxed text-ink-soft">
                Tier prices are generated automatically when the product is created — Bronze at list,
                Silver 4% off, Gold 8% off — and can be edited here afterwards.
              </p>
            ) : (
              <>
                <p className="mb-3 text-xs leading-relaxed text-ink-soft">
                  Tier pricing is what a customer starts from. Discounts a rep gives are applied on
                  top and measured against the ceilings in the governance screen.
                </p>

                <Table>
                  <THead>
                    <TR>
                      <TH>Tier</TH>
                      {CURRENCIES.map((c) => (
                        <TH key={c} align="right">
                          {c}
                        </TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {TIERS.map((tier) => (
                      <TR key={tier}>
                        <TD className="font-semibold capitalize">{tier}</TD>
                        {CURRENCIES.map((currency) => {
                          const entry = priceLists.find(
                            (p) =>
                              p.productId === form.id && p.tier === tier && p.currency === currency,
                          );
                          const offList =
                            form.basePrice > 0 && entry
                              ? ((form.basePrice - entry.price) / form.basePrice) * 100
                              : 0;

                          return (
                            <TD key={currency} align="right">
                              <div className="flex flex-col items-end gap-0.5">
                                <input
                                  type="number"
                                  min={0}
                                  aria-label={`${tier} price in ${currency}`}
                                  value={entry?.price ?? 0}
                                  onChange={(e) =>
                                    upsertPriceListEntry({
                                      productId: form.id,
                                      tier,
                                      currency,
                                      price: Number(e.target.value),
                                    })
                                  }
                                  className="num h-8 w-28 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold text-ink focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                                />
                                {currency === 'INR' && (
                                  <span className="num text-[10px] text-ink-muted">
                                    {offList > 0 ? `${offList.toFixed(1)}% off list` : 'at list'}
                                  </span>
                                )}
                              </div>
                            </TD>
                          );
                        })}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </>
            )}
          </TabsContent>
        </Tabs>
      </Drawer>
    </div>
  );
}
