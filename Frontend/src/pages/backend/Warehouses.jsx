import { useState } from 'react';
import { toast } from 'sonner';
import { Boxes, Package, Pencil, Plus, Truck, Warehouse as WarehouseIcon, Zap } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectWarehouseStockRows, selectWarehouseSummary } from '@/store/selectors';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Slider } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

const EMPTY = {
  name: '',
  location: '',
  stock: {},
  shippingCostWeight: 1,
  baseShipCost: 400,
  replenishThreshold: 5,
  replenishQty: 20,
  replenishLeadDays: 7,
};

/** Warehouse and fulfillment setup (spec A4). */
export default function Warehouses() {
  const summary = useAppStore(selectWarehouseSummary);
  const upsertWarehouse = useAppStore((s) => s.upsertWarehouse);
  const setWarehouseStockBulk = useAppStore((s) => s.setWarehouseStockBulk);
  const simulateRestock = useAppStore((s) => s.simulateRestock);

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [stockTarget, setStockTarget] = useState(null);
  const [stockDraft, setStockDraft] = useState({});

  const stockRows = useAppStore((s) =>
    stockTarget ? selectWarehouseStockRows(s, stockTarget.id) : [],
  );

  const openEditor = (warehouse) => {
    setEditing(warehouse ?? 'new');
    setForm(warehouse ? { ...warehouse } : EMPTY);
  };

  const openStock = (warehouse) => {
    setStockTarget(warehouse);
    setStockDraft({});
  };

  const save = () => {
    if (!form.name?.trim()) {
      toast.error('Give the warehouse a name.');
      return;
    }
    const saved = upsertWarehouse(editing === 'new' ? { ...form, id: undefined } : form);
    setEditing(null);
    toast.success(editing === 'new' ? 'Warehouse created' : 'Warehouse updated', {
      description: `${saved.name} · shipping weight ×${saved.shippingCostWeight}`,
    });
  };

  const saveStock = () => {
    setWarehouseStockBulk(stockTarget.id, stockDraft);
    const changed = Object.keys(stockDraft).length;
    setStockTarget(null);
    toast.success('Stock updated', {
      description: `${changed} product(s) changed. Fulfillment plans recomputed.`,
    });
  };

  return (
    <div>
      <PageHeader
        title="Warehouses & fulfillment"
        description="Stock levels and shipping weights drive the auto-split algorithm. Higher weight means the system prefers shipping from somewhere cheaper."
        actions={
          <Button icon={Plus} onClick={() => openEditor(null)}>
            New Warehouse
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summary.map((w) => (
          <GlassCard key={w.id} hover className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{w.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">{w.location}</p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-600">
                <WarehouseIcon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="SKUs" value={w.skuCount} />
              <Stat label="Units on hand" value={w.totalUnits} />
              <Stat label="Ship weight" value={`×${w.shippingCostWeight}`} />
              <Stat label="Per shipment" value={money(w.baseShipCost * w.shippingCostWeight)} />
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {w.lowCount > 0 ? (
                <Badge tone="warning" size="xs">
                  {w.lowCount} at/below threshold
                </Badge>
              ) : (
                <Badge tone="success" size="xs">
                  Stock healthy
                </Badge>
              )}
              <Badge tone="neutral" size="xs">
                {w.replenishLeadDays}d lead time
              </Badge>
            </div>

            <div className="mt-3.5 flex flex-wrap gap-2 border-t border-brand-500/12 pt-3">
              <Button size="xs" variant="secondary" icon={Pencil} onClick={() => openEditor(w)}>
                Edit
              </Button>
              <Button size="xs" variant="secondary" icon={Boxes} onClick={() => openStock(w)}>
                Manage stock
              </Button>
              <Button
                size="xs"
                variant="ghost"
                icon={Zap}
                onClick={() => {
                  const result = simulateRestock(w.id);
                  if (result.restocked === 0) {
                    toast.info(`Nothing below threshold at ${w.name}.`);
                  } else {
                    toast.success(`Restocked ${result.restocked} product(s) at ${w.name}`, {
                      description: 'Open backorders that can now be filled will prompt to consolidate.',
                    });
                  }
                }}
              >
                Simulate Restock
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassPanel
        title="How the split algorithm uses these numbers"
        icon={Truck}
        accent="indigo"
      >
        <ol className="space-y-2 text-xs leading-relaxed text-ink-soft">
          <li>
            <span className="font-bold text-ink">1. Whole-line first.</span> A warehouse that can
            fulfil an entire line is preferred, because that means fewer shipments.
          </li>
          <li>
            <span className="font-bold text-ink">2. Consolidate.</span> Warehouses already shipping
            something else on the same order come next.
          </li>
          <li>
            <span className="font-bold text-ink">3. Cheapest.</span> Then by shipping cost weight
            ascending — this is where the weight above matters.
          </li>
          <li>
            <span className="font-bold text-ink">4. Deepest stock.</span> Finally by available
            quantity, so the split doesn&apos;t fragment more than necessary.
          </li>
          <li>
            <span className="font-bold text-ink">5. Backorder.</span> Anything left becomes a
            backorder with an ETA derived from the shortest replenishment lead time.
          </li>
        </ol>
      </GlassPanel>

      {/* ------------------------------------------------------- editor */}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New warehouse' : form.name}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing === 'new' ? 'Create' : 'Save changes'}</Button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Input
            label="Name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Location"
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          />
          <Input
            label="Base shipment cost"
            type="number"
            min={0}
            prefix="₹"
            className="pl-8"
            value={form.baseShipCost}
            onChange={(e) => setForm((f) => ({ ...f, baseShipCost: Number(e.target.value) }))}
          />
          <Input
            label="Replenishment lead time"
            type="number"
            min={0}
            suffix="days"
            value={form.replenishLeadDays}
            onChange={(e) => setForm((f) => ({ ...f, replenishLeadDays: Number(e.target.value) }))}
            hint="Used for backorder ETAs."
          />
          <Input
            label="Low-stock threshold"
            type="number"
            min={0}
            value={form.replenishThreshold}
            onChange={(e) => setForm((f) => ({ ...f, replenishThreshold: Number(e.target.value) }))}
          />
          <Input
            label="Replenishment quantity"
            type="number"
            min={0}
            value={form.replenishQty}
            onChange={(e) => setForm((f) => ({ ...f, replenishQty: Number(e.target.value) }))}
            hint="Added per product by Simulate Restock."
          />
        </div>

        <div className="mt-4 rounded-xl bg-brand-500/8 p-3.5">
          <Slider
            label="Shipping cost weight"
            value={form.shippingCostWeight}
            min={0.5}
            max={3}
            step={0.1}
            valueLabel={`×${form.shippingCostWeight.toFixed(1)}`}
            onValueChange={(v) => setForm((f) => ({ ...f, shippingCostWeight: v }))}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
            Higher weight = the system prefers shipping from a cheaper warehouse. Effective cost per
            shipment:{' '}
            <span className="num font-bold text-ink">
              {money(form.baseShipCost * form.shippingCostWeight)}
            </span>
          </p>
        </div>
      </Dialog>

      {/* -------------------------------------------------- stock dialog */}
      <Dialog
        open={Boolean(stockTarget)}
        onOpenChange={(open) => !open && setStockTarget(null)}
        title={`Manage stock — ${stockTarget?.name ?? ''}`}
        description="Rows at or below the low-stock threshold are highlighted."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStockTarget(null)}>
              Cancel
            </Button>
            <Button onClick={saveStock} disabled={Object.keys(stockDraft).length === 0}>
              Save stock levels
            </Button>
          </>
        }
      >
        <Table>
          <THead>
            <TR>
              <TH>Product</TH>
              <TH align="right">On hand</TH>
              <TH align="center">Status</TH>
            </TR>
          </THead>
          <TBody>
            {stockRows.map((row) => {
              const value = stockDraft[row.productId] ?? row.qty;
              const low = value <= (stockTarget?.replenishThreshold ?? 0);

              return (
                <TR key={row.productId} className={cn(low && 'bg-accent-amber/8')}>
                  <TD>
                    <p className="text-xs font-semibold text-ink">{row.productName}</p>
                    <p className="num text-[10px] text-ink-muted">{row.sku}</p>
                  </TD>
                  <TD align="right">
                    <input
                      type="number"
                      min={0}
                      aria-label={`Stock for ${row.productName}`}
                      value={value}
                      onChange={(e) =>
                        setStockDraft((d) => ({ ...d, [row.productId]: Number(e.target.value) }))
                      }
                      className={cn(
                        'num h-8 w-20 rounded-lg border bg-white/70 px-2 text-right text-xs font-semibold focus:outline-none focus:ring-2',
                        low
                          ? 'border-accent-amber/50 text-accent-amber focus:ring-accent-amber/25'
                          : 'border-brand-500/20 text-ink focus:border-brand-500/50 focus:ring-brand-500/25',
                      )}
                    />
                  </TD>
                  <TD align="center">
                    {value === 0 ? (
                      <Badge tone="danger" size="xs">
                        Out
                      </Badge>
                    ) : low ? (
                      <Badge tone="warning" size="xs">
                        Low
                      </Badge>
                    ) : (
                      <Badge tone="success" size="xs">
                        OK
                      </Badge>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>

        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-ink-muted">
          <Package className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          Saving recomputes every open fulfillment plan. If a plan had a backorder that can now be
          filled, a consolidation prompt appears.
        </p>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="num mt-0.5 text-sm font-extrabold text-ink">{value}</dd>
    </div>
  );
}
