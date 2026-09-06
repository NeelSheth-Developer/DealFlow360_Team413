import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { computeBlendedRisk, resolveApprovalPath } from '@/lib/riskEngine';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/glass/Glass';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { Slider } from '@/components/ui/Misc';
import { Badge } from '@/components/ui/Badge';

/**
 * The interactive version of the worked example from the problem statement.
 *
 * Uses the exact same `computeBlendedRisk` and `resolveApprovalPath` functions
 * the real application uses, so what a visitor plays with here is genuinely the
 * production engine rather than a mock-up.
 */

const CATEGORY_CEILINGS = { hardware: 15, service: 10 };
const TIER_CEILING = 15; // Gold

const APPROVAL_CHAIN = [
  { id: 'auto', minScore: -1, maxScore: 0, approvers: [], singleLineTrip: null },
  { id: 'mgr', minScore: 0, maxScore: 5, approvers: ['sales_manager'], singleLineTrip: 5 },
  { id: 'fin', minScore: 5, maxScore: null, approvers: ['sales_manager', 'finance'], singleLineTrip: 12 },
];

export function RiskEngineDemo() {
  const [hardwareDiscount, setHardwareDiscount] = useState(12);
  const [serviceDiscount, setServiceDiscount] = useState(18);

  const lines = useMemo(
    () => [
      {
        id: 'demo-hw',
        productName: 'Laptop Pro 14',
        category: 'hardware',
        qty: 1,
        unitPrice: 100000,
        discountPct: hardwareDiscount,
      },
      {
        id: 'demo-sv',
        productName: 'Setup Service',
        category: 'service',
        qty: 1,
        unitPrice: 20000,
        discountPct: serviceDiscount,
      },
    ],
    [hardwareDiscount, serviceDiscount],
  );

  const risk = useMemo(
    () => computeBlendedRisk(lines, CATEGORY_CEILINGS, TIER_CEILING, 0),
    [lines],
  );

  const path = useMemo(() => resolveApprovalPath(risk, APPROVAL_CHAIN), [risk]);

  return (
    <GlassCard strong className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
        {/* ----------------------------------------------------- controls */}
        <div className="border-b border-brand-500/12 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge tone="warning">Gold customer</Badge>
            <span className="text-xs text-ink-muted">
              Tier allows up to {TIER_CEILING}% — but each category has its own stricter limit.
            </span>
          </div>

          <div className="mb-4 rounded-xl bg-brand-500/8 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-700">
              How the score is computed
            </p>
            <p className="num mt-1 text-xs font-semibold text-ink">
              Σ (line value × points over ceiling) ÷ Σ line value
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
              A ₹1,000 line inside its ceiling and a ₹2,000 line 8 points over gives
              (1000×0 + 2000×8) ÷ 3000 = <span className="font-bold text-ink">5.33 points</span>.
            </p>
          </div>

          <div className="space-y-5">
            <LineControl
              name="Laptop Pro 14"
              categoryLabel="Hardware"
              value={hardwareDiscount}
              onChange={setHardwareDiscount}
              ceiling={CATEGORY_CEILINGS.hardware}
              lineValue={100000}
            />
            <LineControl
              name="Setup Service"
              categoryLabel="Service"
              value={serviceDiscount}
              onChange={setServiceDiscount}
              ceiling={CATEGORY_CEILINGS.service}
              lineValue={20000}
            />
          </div>

          {/* ---------------------------------------------- breakdown */}
          <div className="mt-5 overflow-hidden rounded-xl border border-brand-500/15">
            <table className="w-full text-xs">
              <thead className="bg-brand-500/8">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-bold text-ink-soft">
                    Line
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold text-ink-soft">
                    Given
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-bold text-ink-soft">
                    Allowed
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-bold text-ink-soft">
                    Over by
                  </th>
                </tr>
              </thead>
              <tbody>
                {risk.lineBreakdown.map((row) => (
                  <tr
                    key={row.lineId}
                    className={cn(
                      'border-t border-brand-500/10',
                      row.isViolation && 'bg-state-danger/6',
                    )}
                  >
                    <td className="px-3 py-2 font-semibold text-ink">
                      <span className="flex items-center gap-1.5">
                        {row.isViolation ? (
                          <AlertTriangle
                            className="h-3 w-3 shrink-0 text-state-danger"
                            aria-hidden="true"
                          />
                        ) : (
                          <CheckCircle2
                            className="h-3 w-3 shrink-0 text-state-success"
                            aria-hidden="true"
                          />
                        )}
                        {row.productName}
                      </span>
                    </td>
                    <td className="num px-2 py-2 text-right font-semibold text-ink">
                      {percent(row.givenPct, 0)}
                    </td>
                    <td className="num px-2 py-2 text-right text-ink-muted">
                      {percent(row.ceilingPct, 0)}
                    </td>
                    <td
                      className={cn(
                        'num px-3 py-2 text-right font-bold',
                        row.isViolation ? 'text-state-danger' : 'text-state-success',
                      )}
                    >
                      {row.overBy > 0 ? `+${row.overBy.toFixed(1)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-brand-500/20 bg-brand-50/70">
                <tr>
                  <td className="px-3 py-2 font-bold text-ink" colSpan={3}>
                    Value-weighted blended score
                  </td>
                  <td className="num px-3 py-2 text-right font-extrabold text-brand-700">
                    {risk.score.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Weighted overage {money(risk.weightedOverage, 'INR')} ÷ order value{' '}
            {money(risk.totalValue, 'INR')} = {risk.score.toFixed(2)} points. Worst single line is{' '}
            {risk.worstSingleOverage.toFixed(1)} points over, which is what triggers escalation even
            when the blend looks mild.
          </p>
        </div>

        {/* ------------------------------------------------------ verdict */}
        <div className="flex w-full flex-col items-center justify-center gap-4 bg-white/40 p-6 lg:w-72">
          <RiskGauge score={risk.score} size="md" />

          <div className="w-full space-y-2">
            <p className="text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Routes to
            </p>
            <div
              className={cn(
                'rounded-xl border px-3 py-2.5 text-center',
                path.approvers.length === 0
                  ? 'border-state-success/30 bg-state-success/10'
                  : path.approvers.length === 1
                    ? 'border-accent-amber/35 bg-accent-amber/12'
                    : 'border-state-danger/30 bg-state-danger/10',
              )}
            >
              <p
                className={cn(
                  'text-sm font-extrabold',
                  path.approvers.length === 0
                    ? 'text-state-success'
                    : path.approvers.length === 1
                      ? 'text-accent-amber'
                      : 'text-state-danger',
                )}
              >
                {path.label}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {path.approvers.length === 0
                  ? 'No review needed'
                  : `${path.approvers.length} approver${path.approvers.length > 1 ? 's' : ''} required`}
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            Drag either slider. This is the same scoring function the live app runs on every
            keystroke.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function LineControl({ name, categoryLabel, value, onChange, ceiling, lineValue }) {
  const over = value > ceiling;
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{name}</span>
          <Badge tone={categoryLabel === 'Hardware' ? 'indigo' : 'pink'} size="xs">
            {categoryLabel}
          </Badge>
        </div>
        <span className="num text-xs text-ink-muted">{money(lineValue, 'INR')} list</span>
      </div>

      <Slider
        value={value}
        onValueChange={onChange}
        min={0}
        max={30}
        step={1}
        label={`${name} discount`}
        valueLabel={`${value}%`}
      />

      <p
        className={cn(
          'mt-1 text-[11px] font-semibold',
          over ? 'text-state-danger' : 'text-ink-muted',
        )}
      >
        {over
          ? `${(value - ceiling).toFixed(0)} pts over the ${ceiling}% ${categoryLabel.toLowerCase()} ceiling`
          : `Within the ${ceiling}% ${categoryLabel.toLowerCase()} ceiling`}
      </p>
    </div>
  );
}
