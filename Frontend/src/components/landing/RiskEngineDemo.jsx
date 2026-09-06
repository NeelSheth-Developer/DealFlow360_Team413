import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ServerCog } from 'lucide-react';
import { scoreBlended } from '@/services/riskService';
import { hasSession } from '@/services/apiClient';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/glass/Glass';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { formatScore } from '@/lib/riskEngine';
import { Slider } from '@/components/ui/Misc';
import { Badge } from '@/components/ui/Badge';

/**
 * The interactive version of the worked example from the problem statement.
 *
 * SCORED ENTIRELY BY THE SERVER. `POST /risk/blended-score` is the only thing that
 * produces a number here — the ceilings, the overage per line and the approval routing
 * all come off that response.
 *
 * There used to be a local `computeBlendedRisk` pass behind this widget, running against
 * hardcoded ceilings and a hardcoded approval chain. That was a second implementation of
 * a rule the server owns, and the two could only ever agree by accident; both it and the
 * constants it needed are gone.
 *
 * WHEN THE SERVICE CANNOT BE REACHED, NOTHING IS SHOWN. The route requires a staff token
 * (`requireAuth` + `requireKind('staff')`), so a signed-out visitor cannot call it, and it
 * is newer than some deployments. In either case the panel says which of those it is
 * rather than falling back to a number it made up.
 */

const CATEGORY_CEILINGS = { hardware: 15, service: 10 };
const TIER_CEILING = 15; // Gold


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

  const [served, setServed] = useState(null);
  const [scoring, setScoring] = useState(false);
  // Latched: once the route has answered 401/404 there is no point re-asking on every
  // slider move for the rest of the visit.
  const unavailable = useRef(false);
  const [reason, setReason] = useState(null);

  useEffect(() => {
    if (unavailable.current) return undefined;
    if (!hasSession()) {
      setReason('signed-out');
      return undefined;
    }

    let cancelled = false;
    setScoring(true);
    const timer = setTimeout(async () => {
      try {
        const result = await scoreBlended({
          customerTier: 'gold',
          lines: lines.map((l) => ({
            lineId: l.id,
            category: l.category,
            discountPct: l.discountPct,
            lineTotal: l.qty * l.unitPrice * (1 - l.discountPct / 100),
          })),
        });
        if (!cancelled) {
          setServed(result);
          setReason(null);
        }
      } catch (error) {
        unavailable.current = true;
        if (!cancelled) {
          setServed(null);
          setReason(error?.status === 404 ? 'not-deployed' : 'unavailable');
        }
      } finally {
        if (!cancelled) setScoring(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [lines]);

  /*
   * NOTHING IS SCORED HERE.
   *
   * This widget used to run `computeBlendedRisk` in the browser against hardcoded
   * ceilings and a hardcoded chain. That is a second implementation of the rule the
   * server owns, and the two could only agree by accident — so it is gone, along with
   * the local engine itself.
   *
   * `flagged` is keyed by line id so each row can show the ceiling and overage the
   * SERVER decided for it. A line the server did not flag is inside its ceiling; there
   * is nothing to compute to know that.
   */
  const approvers = served?.approvers ?? [];

  const flaggedById = useMemo(() => {
    const map = new Map();
    for (const f of served?.flagged ?? []) map.set(f.lineId, f);
    return map;
  }, [served]);

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
                {lines.map((line) => {
                  const flag = flaggedById.get(line.id);
                  const row = {
                    lineId: line.id,
                    productName: line.productName,
                    givenPct: line.discountPct,
                    ceilingPct: flag?.ceilingPct ?? null,
                    overBy: flag?.overBy ?? 0,
                    isViolation: Boolean(flag),
                  };
                  return (
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
                      {row.ceilingPct === null ? '—' : percent(row.ceilingPct, 0)}
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
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-brand-500/20 bg-brand-50/70">
                <tr>
                  <td className="px-3 py-2 font-bold text-ink" colSpan={3}>
                    Value-weighted blended score
                  </td>
                  <td className="num px-3 py-2 text-right font-extrabold text-brand-700">
                    {served ? formatScore(served.score) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Each line is measured against the stricter of its category ceiling and the
            customer&apos;s tier ceiling. Overages are weighted by line value, so a small
            violation on a large line matters more than a large one on a trivial line —
            and a single badly-over line escalates the order on its own.
          </p>
        </div>

        {/* ------------------------------------------------------ verdict */}
        <div className="flex w-full flex-col items-center justify-center gap-4 bg-white/40 p-6 lg:w-72">
          <RiskGauge score={served?.score ?? 0} size="md" />

          {/*
            Reports the state honestly. The browser no longer scores anything, so when
            the service cannot be reached there is no number to show — and saying so is
            better than showing one this widget made up.
          */}
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-center text-[10px] font-semibold',
              served
                ? 'bg-state-success/12 text-state-success'
                : scoring
                  ? 'bg-brand-500/10 text-brand-700'
                  : 'bg-accent-amber/14 text-accent-amber',
            )}
          >
            <ServerCog className="h-3 w-3 shrink-0" aria-hidden="true" />
            {served
              ? 'Scored by the governance service'
              : scoring
                ? 'Scoring…'
                : reason === 'signed-out'
                  ? 'Sign in to run the live engine'
                  : reason === 'not-deployed'
                    ? 'Scoring service not available on this deployment'
                    : 'Scoring service unreachable'}
          </span>

          <div className="w-full space-y-2">
            <p className="text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Routes to
            </p>
            <div
              className={cn(
                'rounded-xl border px-3 py-2.5 text-center',
                approvers.length === 0
                  ? 'border-state-success/30 bg-state-success/10'
                  : approvers.length === 1
                    ? 'border-accent-amber/35 bg-accent-amber/12'
                    : 'border-state-danger/30 bg-state-danger/10',
              )}
            >
              <p
                className={cn(
                  'text-sm font-extrabold',
                  approvers.length === 0
                    ? 'text-state-success'
                    : approvers.length === 1
                      ? 'text-accent-amber'
                      : 'text-state-danger',
                )}
              >
                {served ? served.label : 'Not scored'}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {approvers.length === 0
                  ? 'No review needed'
                  : `${approvers.length} approver${approvers.length > 1 ? 's' : ''} required`}
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
