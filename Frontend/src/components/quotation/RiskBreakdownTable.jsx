import { AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';
import { categoryLabel, money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Misc';
import { SkeletonTable } from '@/components/ui/Loading';

/**
 * Line-by-line audit of the blended score. The footer shows the arithmetic so an
 * approver can verify the number by eye rather than trusting it.
 *
 * THE ZERO STATE IS NOT A RESULT. `PENDING_RISK` carries `score: 0`, `totalValue: 0` and
 * an empty `lineBreakdown`, so rendering it unconditionally printed a header, no rows,
 * and a footer reading "₹0 weighted overage ÷ ₹0 order value · 0.0 worst · 0.00". An
 * approver cannot tell that from a genuinely clean quotation, and it is the number they
 * are being asked to sign off against — so the three states are now distinct and the
 * numbers appear only once the server has actually answered.
 */
export function RiskBreakdownTable({ risk, currency, loading = false, error = null }) {
  if (loading) {
    return <SkeletonTable rows={3} columns={7} />;
  }

  if (error) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Risk score unavailable"
        description={`${error} — the breakdown is not shown rather than showing a zero, which would read as "no violations".`}
      />
    );
  }

  if (!risk?.lineBreakdown?.length) {
    return (
      <EmptyState
        icon={Gauge}
        title="Nothing to score"
        description="This quotation has no lines yet, so there is no discount to measure against a ceiling."
      />
    );
  }

  return (
    <div>
      <Table>
        <THead>
          <TR>
            <TH>Line</TH>
            <TH>Category</TH>
            <TH align="right">Line value</TH>
            <TH align="right">Discount given</TH>
            <TH align="right">Ceiling allowed</TH>
            <TH align="right">Over by</TH>
            <TH align="right">Weighted contribution</TH>
          </TR>
        </THead>

        <TBody>
          {risk.lineBreakdown.map((row) => (
            <TR key={row.lineId} className={cn(row.isViolation && 'bg-state-danger/6')}>
              <TD>
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  {row.isViolation ? (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 text-state-danger"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle2
                      className="h-3.5 w-3.5 shrink-0 text-state-success"
                      aria-hidden="true"
                    />
                  )}
                  {row.productName}
                </span>
              </TD>

              <TD>
                <Badge
                  tone={
                    row.category === 'hardware'
                      ? 'indigo'
                      : row.category === 'service'
                        ? 'pink'
                        : row.category === 'subscription'
                          ? 'teal'
                          : 'neutral'
                  }
                  size="xs"
                >
                  {categoryLabel(row.category)}
                </Badge>
              </TD>

              <TD align="right" num>
                {money(row.value, currency)}
              </TD>

              <TD align="right">
                <span className={cn('num font-bold', row.isViolation && 'text-state-danger')}>
                  {percent(row.givenPct)}
                </span>
              </TD>

              <TD align="right" num className="text-ink-soft">
                {percent(row.ceilingPct, 0)}
                <span className="ml-1 text-[10px] text-ink-muted">
                  {row.categoryCeilingPct <= row.tierCeilingPct ? '(category)' : '(tier)'}
                </span>
              </TD>

              <TD align="right">
                <span
                  className={cn(
                    'num font-extrabold',
                    row.isViolation ? 'text-state-danger' : 'text-state-success',
                  )}
                >
                  {row.overBy > 0 ? `+${row.overBy.toFixed(1)}` : '—'}
                </span>
              </TD>

              <TD align="right" num className="text-ink-soft">
                {row.contribution > 0 ? row.contribution.toFixed(2) : '—'}
              </TD>
            </TR>
          ))}
        </TBody>

        <TFoot>
          <TR>
            <TD colSpan={2} className="text-xs font-bold">
              Value-weighted blended score
            </TD>
            <TD align="right" num className="text-xs">
              {money(risk.totalValue, currency)}
            </TD>
            <TD colSpan={2} align="right" className="text-[11px] font-normal text-ink-muted">
              {money(risk.weightedOverage, currency)} weighted overage ÷{' '}
              {money(risk.totalValue, currency)} order value
            </TD>
            <TD align="right" num className="text-xs font-extrabold text-brand-700">
              {risk.worstSingleOverage.toFixed(1)} worst
            </TD>
            <TD align="right" num className="text-base font-extrabold text-brand-700">
              {risk.score.toFixed(2)}
            </TD>
          </TR>
        </TFoot>
      </Table>

      <p className="mt-2.5 px-4 pb-1 text-[11px] leading-relaxed text-ink-muted sm:px-5">
        Each line is measured against the stricter of its category ceiling and the customer&apos;s
        tier ceiling. Overages are weighted by line value, so a small violation on a large line
        matters more than a large violation on a trivial one. The worst single overage is tracked
        separately — one badly-over line escalates the whole quotation even when the blend looks mild.
      </p>
    </div>
  );
}
