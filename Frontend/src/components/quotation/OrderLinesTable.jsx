import { AlertTriangle, Repeat, Trash2 } from 'lucide-react';
import { lineMargin, lineTotal } from '@/lib/pricing';
import { cadenceLabel, categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { IconButton } from '@/components/ui/Button';
import { QtyStepper } from '@/components/ui/Misc';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Misc';
import { ShoppingCart } from 'lucide-react';

/**
 * Editable order lines. The discount input shows its binding ceiling inline and
 * turns red the instant the entered value exceeds it — the rep sees the problem
 * before submitting, not after.
 */
export function OrderLinesTable({
  quote,
  plans,
  ceilingFor,
  editable,
  onQtyChange,
  onDiscountChange,
  onPriceChange,
  onRemove,
}) {
  if (quote.lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No lines yet"
        description="Add products from the catalog on the left to start building this quotation."
      />
    );
  }

  const totals = quote.lines.reduce(
    (acc, line) => {
      acc.subtotal += line.qty * line.unitPrice;
      acc.net += lineTotal(line);
      acc.margin += lineMargin(line).amount;
      return acc;
    },
    { subtotal: 0, net: 0, margin: 0 },
  );

  return (
    <Table>
      <THead>
        <TR>
          <TH>Product</TH>
          <TH align="center">Qty</TH>
          <TH align="right">Unit price</TH>
          <TH align="center">Discount</TH>
          <TH align="right">Line total</TH>
          <TH align="right">Margin</TH>
          {editable && <TH align="center" className="w-10" />}
        </TR>
      </THead>

      <TBody>
        {quote.lines.map((line) => {
          const { ceiling, binding } = ceilingFor(line.category);
          const over = line.discountPct > ceiling;
          const margin = lineMargin(line);
          const plan = line.planId ? plans.find((p) => p.id === line.planId) : null;
          const cancelled = line.subscriptionStatus === 'cancelled';

          return (
            <TR
              key={line.id}
              className={cn(
                line.isSubscription && 'border-l-4 border-l-accent-indigo',
                cancelled && 'opacity-50',
              )}
            >
              <TD>
                <div className="min-w-0">
                  <p
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-bold text-ink',
                      cancelled && 'line-through',
                    )}
                  >
                    {line.isSubscription && (
                      <Repeat className="h-3 w-3 shrink-0 text-accent-indigo" aria-hidden="true" />
                    )}
                    {line.productName}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      tone={
                        line.category === 'hardware'
                          ? 'indigo'
                          : line.category === 'service'
                            ? 'pink'
                            : line.category === 'subscription'
                              ? 'teal'
                              : 'neutral'
                      }
                      size="xs"
                    >
                      {categoryLabel(line.category)}
                    </Badge>
                    {plan && (
                      <span className="text-[10px] font-medium text-accent-indigo">
                        {cadenceLabel(plan.cadence)}
                      </span>
                    )}
                    {cancelled && (
                      <Badge tone="danger" size="xs">
                        Cancelled
                      </Badge>
                    )}
                  </div>
                </div>
              </TD>

              <TD align="center">
                {editable ? (
                  <QtyStepper
                    value={line.qty}
                    onChange={(v) => onQtyChange(line.id, v)}
                    size="xs"
                  />
                ) : (
                  <span className="num font-semibold">{line.qty}</span>
                )}
              </TD>

              <TD align="right">
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={line.unitPrice}
                    aria-label={`Unit price for ${line.productName}`}
                    onChange={(e) => onPriceChange(line.id, Number(e.target.value))}
                    className="num h-8 w-24 rounded-lg border border-brand-500/20 bg-white/70 px-2 text-right text-xs font-semibold text-ink focus:border-brand-500/50 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                  />
                ) : (
                  <span className="num">{money(line.unitPrice, quote.currency)}</span>
                )}
              </TD>

              <TD align="center">
                <div className="flex flex-col items-center gap-0.5">
                  {editable ? (
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={line.discountPct}
                        aria-label={`Discount percent for ${line.productName}`}
                        onChange={(e) => onDiscountChange(line.id, Number(e.target.value))}
                        className={cn(
                          'num h-8 w-16 rounded-lg border bg-white/70 pl-2 pr-5 text-right text-xs font-bold focus:outline-none focus:ring-2',
                          over
                            ? 'border-state-danger/60 text-state-danger focus:ring-state-danger/25'
                            : 'border-brand-500/20 text-ink focus:border-brand-500/50 focus:ring-brand-500/25',
                        )}
                      />
                      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-muted">
                        %
                      </span>
                    </div>
                  ) : (
                    <span className={cn('num font-bold', over && 'text-state-danger')}>
                      {percent(line.discountPct, 0)}
                    </span>
                  )}

                  <span
                    className={cn(
                      'inline-flex items-center gap-0.5 whitespace-nowrap text-[10px] font-semibold',
                      over ? 'text-state-danger' : 'text-ink-muted',
                    )}
                  >
                    {over && <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />}
                    max {ceiling}%
                    {binding === 'tier' && !over && <span className="font-normal">(tier)</span>}
                  </span>
                </div>
              </TD>

              <TD align="right" num>
                {money(lineTotal(line), quote.currency)}
              </TD>

              <TD align="right">
                <span
                  className={cn(
                    'num text-xs font-semibold',
                    margin.pct >= 30
                      ? 'text-state-success'
                      : margin.pct >= 15
                        ? 'text-accent-amber'
                        : 'text-state-danger',
                  )}
                >
                  {percent(margin.pct, 0)}
                </span>
              </TD>

              {editable && (
                <TD align="center">
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${line.productName}`}
                    size="xs"
                    variant="ghost"
                    className="text-state-danger hover:bg-state-danger/10"
                    onClick={() => onRemove(line.id)}
                  />
                </TD>
              )}
            </TR>
          );
        })}
      </TBody>

      <TFoot>
        <TR>
          <TD className="text-xs font-bold">Line totals</TD>
          <TD />
          <TD align="right" num className="text-xs text-ink-muted">
            {money(totals.subtotal, quote.currency)}
          </TD>
          <TD align="center" className="text-[10px] text-ink-muted">
            before order disc.
          </TD>
          <TD align="right" num className="text-xs font-extrabold">
            {money(totals.net, quote.currency)}
          </TD>
          <TD align="right" num className="text-xs font-bold text-state-success">
            {money(totals.margin, quote.currency)}
          </TD>
          {editable && <TD />}
        </TR>
      </TFoot>
    </Table>
  );
}
