import { AlertTriangle, Package } from 'lucide-react';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';

const BAR_COLORS = ['#8b5cf6', '#6366f1', '#14b8a6', '#ec4899', '#f59e0b'];

/** Read-only view of the suggested (or accepted) split. */
export function WarehouseSplitTable({ rows, warehouses, currency }) {
  const colorFor = (warehouseId) => {
    const i = warehouses.findIndex((w) => w.id === warehouseId);
    return BAR_COLORS[i % BAR_COLORS.length];
  };

  return (
    <div className="space-y-4">
      {rows.map(({ line, rows: allocations, allocated, shortfall, backorderEta }) => (
        <article key={line.id} className="rounded-xl border border-brand-500/12 bg-white/55 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-ink">{line.productName}</p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                {allocated} of {line.qty} allocated
                {shortfall > 0 && (
                  <span className="ml-1.5 font-bold text-state-danger">
                    · {shortfall} on backorder
                  </span>
                )}
              </p>
            </div>
            {shortfall > 0 ? (
              <Badge tone="danger" size="xs" icon={AlertTriangle}>
                Backorder{backorderEta ? ` · ETA ${backorderEta}` : ''}
              </Badge>
            ) : (
              <Badge tone="success" size="xs">
                Fully allocated
              </Badge>
            )}
          </div>

          {/* stacked distribution bar */}
          <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full bg-brand-500/10">
            {allocations.map((a) => (
              <span
                key={`${a.lineId}-${a.warehouseId}`}
                className="h-full transition-all"
                style={{
                  width: `${(a.qty / line.qty) * 100}%`,
                  background: colorFor(a.warehouseId),
                }}
                title={`${a.warehouseName}: ${a.qty}`}
              />
            ))}
            {shortfall > 0 && (
              <span
                className="h-full bg-[repeating-linear-gradient(45deg,#ef4444,#ef4444_4px,transparent_4px,transparent_8px)]"
                style={{ width: `${(shortfall / line.qty) * 100}%` }}
                title={`Backorder: ${shortfall}`}
              />
            )}
          </div>

          <Table dense className="mt-2.5">
            <THead>
              <TR>
                <TH>Warehouse</TH>
                <TH align="right">Qty from here</TH>
                <TH align="right">Ship cost weight</TH>
              </TR>
            </THead>
            <TBody>
              {allocations.length === 0 ? (
                <TR>
                  <TD colSpan={3} className="text-center text-[11px] text-ink-muted">
                    Nothing allocated — entire line is on backorder.
                  </TD>
                </TR>
              ) : (
                allocations.map((a) => {
                  const warehouse = warehouses.find((w) => w.id === a.warehouseId);
                  return (
                    <TR key={`${a.lineId}-${a.warehouseId}`}>
                      <TD>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: colorFor(a.warehouseId) }}
                          />
                          <span className="text-xs font-semibold text-ink">{a.warehouseName}</span>
                          <span className="text-[10px] text-ink-muted">{warehouse?.location}</span>
                        </span>
                      </TD>
                      <TD align="right" num className="font-bold">
                        {a.qty}
                      </TD>
                      <TD align="right" num className="text-ink-soft">
                        ×{warehouse?.shippingCostWeight} ·{' '}
                        {money((warehouse?.baseShipCost ?? 0) * (warehouse?.shippingCostWeight ?? 1), currency)}
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </article>
      ))}

      {rows.length === 0 && (
        <div className="flex items-center gap-2.5 rounded-xl bg-brand-500/8 p-4">
          <Package className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="text-xs text-ink-soft">
            No shippable lines on this quotation — services and subscriptions do not require
            warehouse allocation.
          </p>
        </div>
      )}
    </div>
  );
}

/** Editable override table. Validates every cell against live stock. */
export function SplitOverrideEditor({ lines, warehouses, draft, errors, onChange }) {
  const errorFor = (lineId, warehouseId) =>
    errors.find((e) => e.lineId === lineId && e.warehouseId === warehouseId);

  const lineError = (lineId) => errors.find((e) => e.lineId === lineId && !e.warehouseId);

  return (
    <div className="space-y-4">
      {lines.map((line) => {
        const allocated = warehouses.reduce(
          (sum, w) => sum + (Number(draft[`${line.id}:${w.id}`]) || 0),
          0,
        );
        const remaining = line.qty - allocated;
        const lErr = lineError(line.id);

        return (
          <article key={line.id} className="rounded-xl border border-brand-500/12 bg-white/55 p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs font-bold text-ink">{line.productName}</p>
              <span
                className={cn(
                  'num text-[11px] font-bold',
                  remaining === 0
                    ? 'text-state-success'
                    : remaining > 0
                      ? 'text-accent-amber'
                      : 'text-state-danger',
                )}
              >
                {allocated} / {line.qty} allocated
                {remaining > 0 && ` · ${remaining} short`}
                {remaining < 0 && ` · ${Math.abs(remaining)} over`}
              </span>
            </div>

            <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
              {warehouses.map((w) => {
                const key = `${line.id}:${w.id}`;
                const available = w.stock?.[line.productId] ?? 0;
                const err = errorFor(line.id, w.id);

                return (
                  <div key={w.id}>
                    <label
                      htmlFor={key}
                      className="mb-1 block text-[11px] font-semibold text-ink-soft"
                    >
                      {w.name}
                      <span className="ml-1 font-normal text-ink-muted">({available} avail.)</span>
                    </label>
                    <input
                      id={key}
                      type="number"
                      min={0}
                      max={available}
                      value={draft[key] ?? 0}
                      onChange={(e) => onChange(key, Number(e.target.value))}
                      className={cn(
                        'num h-9 w-full rounded-lg border bg-white/70 px-2 text-right text-sm font-semibold focus:outline-none focus:ring-2',
                        err || available === 0
                          ? 'border-state-danger/50 text-state-danger focus:ring-state-danger/25'
                          : 'border-brand-500/20 text-ink focus:border-brand-500/50 focus:ring-brand-500/25',
                      )}
                    />
                    {err && <p className="mt-0.5 text-[10px] font-medium text-state-danger">{err.message}</p>}
                  </div>
                );
              })}
            </div>

            {lErr && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-state-danger">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {lErr.message}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
