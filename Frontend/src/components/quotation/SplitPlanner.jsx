import { useMemo, useState } from 'react';
import { PackageX, Plus, Split, Trash2, Truck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { splitOrder } from '@/services/warehousesService';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/components/glass/Glass';
import { Button, IconButton } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { QtyStepper, EmptyState } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Spinner } from '@/components/ui/Loading';

/**
 * Ad-hoc allocation planner — `POST /warehouses/split`.
 *
 * ANSWERS A QUESTION §13 CANNOT. `GET /quotations/:id/fulfillment` needs a saved,
 * approved quotation, so a warehouse admin had no way to ask "if an order for these
 * products arrived tomorrow, could we ship it, from where, and in how many parcels?"
 * This route is stateless and takes a bare basket, so that question is now answerable
 * without inventing a quotation to ask it with.
 *
 * ADVISORY ONLY. Nothing is reserved, nothing is persisted, and it does not know about
 * stock already promised to live orders — so a plan here can look shippable while the
 * real order backorders. The panel says so rather than implying a commitment.
 *
 * Only physical products are offered: subscriptions and services have no stock and the
 * server would return them as permanent backorder, which reads as a fault rather than a
 * category that was never stocked.
 */
export function SplitPlanner() {
  const products = useAppStore((s) => s.products);
  const warehouses = useAppStore((s) => s.warehouses);

  const [rows, setRows] = useState([]);
  const [picking, setPicking] = useState('');
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const shippable = useMemo(
    () =>
      products
        .filter((p) => p.active && p.category !== 'subscription' && p.category !== 'service')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products],
  );

  const nameOf = (id) => products.find((p) => p.id === id)?.name ?? id;
  const warehouseName = (id) => warehouses.find((w) => w.id === id)?.name ?? id;

  const addRow = (productId) => {
    if (!productId) return;
    setPicking('');
    setPlan(null);
    setRows((r) =>
      r.some((x) => x.productId === productId) ? r : [...r, { productId, qty: 1 }],
    );
  };

  const setQty = (productId, qty) => {
    setPlan(null);
    setRows((r) => r.map((x) => (x.productId === productId ? { ...x, qty } : x)));
  };

  const removeRow = (productId) => {
    setPlan(null);
    setRows((r) => r.filter((x) => x.productId !== productId));
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setPlan(await splitOrder(rows));
    } catch (err) {
      // A 404 means this deployment predates the route — worth saying plainly rather
      // than showing a generic failure on a panel that is otherwise self-explanatory.
      setError(
        err?.status === 404
          ? 'This backend does not have POST /warehouses/split yet.'
          : err.message,
      );
      setPlan(null);
    } finally {
      setBusy(false);
    }
  };

  // Grouped by warehouse, because "how many parcels and from where" is the question.
  const byWarehouse = useMemo(() => {
    if (!plan) return [];
    const map = new Map();
    for (const a of plan.allocations) {
      if (!map.has(a.warehouseId)) map.set(a.warehouseId, []);
      map.get(a.warehouseId).push(a);
    }
    return [...map.entries()];
  }, [plan]);

  return (
    <GlassPanel
      title="Split planner"
      description="Cost a hypothetical order across the network. Nothing is reserved — this is a what-if, not an allocation."
      icon={Split}
      accent="teal"
    >
      <div className="flex flex-wrap items-end gap-2">
        {/* `Select` forwards className to the <select> itself, so the flex sizing has to
            go on a wrapper or the field would not grow with the row. */}
        <div className="min-w-56 flex-1">
          <Select
            label="Add a product"
            value={picking}
            onChange={(e) => addRow(e.target.value)}
            placeholder="Choose a stocked product…"
            options={shippable
              .filter((p) => !rows.some((r) => r.productId === p.id))
              .map((p) => ({ value: p.id, label: `${p.name} · ${p.sku}` }))}
          />
        </div>
        <Button
          size="sm"
          icon={Truck}
          loading={busy}
          disabled={rows.length === 0}
          onClick={run}
        >
          Plan split
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No lines yet"
          description="Add a product above to see which depots would ship it."
          className="py-8"
        />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.productId}
              className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">
                {nameOf(r.productId)}
              </span>
              <QtyStepper
                value={r.qty}
                onChange={(v) => setQty(r.productId, v)}
                min={1}
                max={9999}
              />
              <IconButton
                icon={Trash2}
                label={`Remove ${nameOf(r.productId)}`}
                size="xs"
                variant="ghost"
                onClick={() => removeRow(r.productId)}
              />
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-state-danger/10 px-3 py-2 text-[11px] font-semibold text-state-danger">
          {error}
        </p>
      )}

      {busy && !plan && (
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-soft">
          <Spinner size="xs" className="text-brand-600" />
          Planning…
        </div>
      )}

      {plan && (
        <div className="mt-4 border-t border-brand-500/12 pt-3.5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={plan.shipmentCount > 1 ? 'warning' : 'success'} size="xs">
              {plan.shipmentCount} shipment{plan.shipmentCount === 1 ? '' : 's'}
            </Badge>
            <Badge tone="neutral" size="xs">
              {money(plan.estimatedCost)} estimated shipping
            </Badge>
            {plan.backorders.length > 0 && (
              <Badge tone="danger" size="xs">
                {plan.backorders.length} line(s) on backorder
              </Badge>
            )}
          </div>

          {byWarehouse.length > 0 && (
            <Table dense>
              <THead>
                <TR>
                  <TH>Ships from</TH>
                  <TH>Product</TH>
                  <TH align="right">Qty</TH>
                </TR>
              </THead>
              <TBody>
                {byWarehouse.map(([whId, items]) =>
                  items.map((a, i) => (
                    <TR key={`${whId}-${a.productId}`}>
                      <TD className={cn('font-semibold', i > 0 && 'text-transparent')}>
                        {warehouseName(whId)}
                      </TD>
                      <TD>{nameOf(a.productId)}</TD>
                      <TD align="right" num>
                        {a.qty}
                      </TD>
                    </TR>
                  )),
                )}
              </TBody>
            </Table>
          )}

          {plan.backorders.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {plan.backorders.map((b) => (
                <li
                  key={b.productId}
                  className="flex items-center gap-2 rounded-lg bg-state-danger/8 px-2.5 py-2"
                >
                  <PackageX className="h-3.5 w-3.5 shrink-0 text-state-danger" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-ink">
                    {nameOf(b.productId)}
                  </span>
                  <span className="num text-[11px] font-bold text-state-danger">
                    {b.qty} short
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Active depots only, cheapest shipping weight first, with a single-warehouse
            fast path when one can cover the whole basket. Stock already promised to open
            orders is not deducted, so treat this as a planning figure.
          </p>
        </div>
      )}
    </GlassPanel>
  );
}
