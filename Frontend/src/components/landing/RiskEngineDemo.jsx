import { AlertTriangle, CheckCircle2, FileCheck2 } from 'lucide-react';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/glass/Glass';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { formatScore } from '@/lib/riskEngine';
import { Badge } from '@/components/ui/Badge';

/**
 * The worked example from the problem statement, on the marketing page.
 *
 * STATIC ON PURPOSE, AND ONLY HERE. This used to be a live widget: two sliders that
 * POSTed to `/risk/blended-score` on every move. That route is `requireAuth` +
 * `requireKind('staff')`, so the one audience this page has — a signed-out visitor —
 * could never call it. The panel fell back to its empty state and the landing page
 * advertised the risk engine with `0.00 PTS OVER`, an all-dashes table and "Not scored".
 *
 * Scoring it in the browser instead is not an option: that is a second implementation of
 * a rule the server owns, and the two could only agree by accident. So the numbers below
 * are neither computed nor fetched — they are the response the deployed engine actually
 * returned for exactly these inputs, frozen into the page:
 *
 *   POST /risk/blended-score  { customerTier: 'gold', lines: [hardware 12%, service 18%] }
 *   -> { blended_score: 1.26,
 *        flagged_lines: [{ line_id: 'demo-sv', effective_ceiling: 10, overage: 8 }],
 *        requires_approval: true }
 *
 * If the ceilings or the weighting ever change, this figure goes stale — which is the
 * honest trade for a page that has no session. It is a printed illustration, so it is
 * built like one: no fetch, no state, nothing to drag. THE LIVE ENGINE STILL DRIVES
 * EVERY IN-APP SURFACE; nothing outside this file changed.
 */

const TIER_CEILING = 15; // Gold

/** Verified against the deployed engine — see the block comment above. */
const BLENDED_SCORE = 1.26;

const LINES = [
  {
    id: 'demo-hw',
    name: 'Laptop Pro 14',
    categoryLabel: 'Hardware',
    listPrice: 100000,
    givenPct: 12,
    ceilingPct: 15,
    overBy: 0,
  },
  {
    id: 'demo-sv',
    name: 'Setup Service',
    categoryLabel: 'Service',
    listPrice: 20000,
    givenPct: 18,
    ceilingPct: 10,
    overBy: 8,
  },
];

const VIOLATIONS = LINES.filter((l) => l.overBy > 0).length;

export function RiskEngineDemo() {
  return (
    <GlassCard strong className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
        {/* ----------------------------------------------------- the example */}
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
            {LINES.map((line) => (
              <LineReadout key={line.id} line={line} />
            ))}
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
                {LINES.map((line) => {
                  const isViolation = line.overBy > 0;
                  return (
                    <tr
                      key={line.id}
                      className={cn(
                        'border-t border-brand-500/10',
                        isViolation && 'bg-state-danger/6',
                      )}
                    >
                      <td className="px-3 py-2 font-semibold text-ink">
                        <span className="flex items-center gap-1.5">
                          {isViolation ? (
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
                          {line.name}
                        </span>
                      </td>
                      <td className="num px-2 py-2 text-right font-semibold text-ink">
                        {percent(line.givenPct, 0)}
                      </td>
                      <td className="num px-2 py-2 text-right text-ink-muted">
                        {percent(line.ceilingPct, 0)}
                      </td>
                      <td
                        className={cn(
                          'num px-3 py-2 text-right font-bold',
                          isViolation ? 'text-state-danger' : 'text-state-success',
                        )}
                      >
                        {isViolation ? `+${line.overBy.toFixed(1)}` : '—'}
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
                    {formatScore(BLENDED_SCORE)}
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
          <RiskGauge score={BLENDED_SCORE} size="md" />

          {/*
            Says what this is. The old badge reported a live connection state and, for
            everyone who can actually see this page, that state was always the failure
            one — "Sign in to run the live engine" stamped across a marketing panel.
          */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-center text-[10px] font-semibold text-brand-700">
            <FileCheck2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            Worked example
          </span>

          <div className="w-full space-y-2">
            <p className="text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Routes to
            </p>
            <div className="rounded-xl border border-accent-amber/35 bg-accent-amber/12 px-3 py-2.5 text-center">
              <p className="text-sm font-extrabold text-accent-amber">Needs review</p>
              <p className="mt-0.5 text-[11px] text-ink-soft">
                {VIOLATIONS === 1
                  ? '1 line is over its category ceiling'
                  : `${VIOLATIONS} lines are over their category ceilings`}
              </p>
            </div>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-ink-muted">
            These are the figures the governance service returns for this order. Inside the
            app it re-scores on every keystroke, against your own tiers and ceilings.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

/**
 * One line of the example: the discount it was given, drawn on the same 0–30 track the
 * in-app slider uses so the picture is unchanged, minus the handle you could drag.
 */
function LineReadout({ line }) {
  const over = line.overBy > 0;
  const fill = Math.min(100, (line.givenPct / 30) * 100);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-ink">{line.name}</span>
          <Badge tone={line.categoryLabel === 'Hardware' ? 'indigo' : 'pink'} size="xs">
            {line.categoryLabel}
          </Badge>
        </div>
        <span className="num text-xs text-ink-muted">{money(line.listPrice, 'INR')} list</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-soft">{line.name} discount</span>
          <span className="num text-xs font-bold text-brand-700">{line.givenPct}%</span>
        </div>
        <div className="relative flex h-5 w-full items-center">
          <div className="relative h-1.5 w-full rounded-full bg-brand-500/15">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-indigo"
              style={{ width: `${fill}%` }}
            />
          </div>
          <div
            className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-brand-500 bg-white shadow"
            style={{ left: `${fill}%` }}
          />
        </div>
      </div>

      <p
        className={cn(
          'mt-1 text-[11px] font-semibold',
          over ? 'text-state-danger' : 'text-ink-muted',
        )}
      >
        {over
          ? `${line.overBy.toFixed(0)} pts over the ${line.ceilingPct}% ${line.categoryLabel.toLowerCase()} ceiling`
          : `Within the ${line.ceilingPct}% ${line.categoryLabel.toLowerCase()} ceiling`}
      </p>
    </div>
  );
}
