import {
  AlertTriangle,
  CheckCircle2,
  Save,
  Send,
  ServerCog,
  Share2,
  ShieldAlert,
} from 'lucide-react';
import { explainRisk } from '@/lib/riskEngine';
import { money, percent } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/Loading';
import { GlassCard } from '@/components/glass/Glass';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Misc';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { PulseOnChange } from '@/components/shared/Indicators';

const MARGIN_TARGET = 30;

/**
 * Sticky live summary. The primary action relabels itself from the computed risk
 * score — the rep never chooses whether to request approval, the numbers do.
 */
export function QuoteSummaryRail({
  quote,
  totals,
  risk,
  approvalPath,
  editable,
  busy,
  riskLoading = false,
  riskIsFallback = false,
  onSubmit,
  onSaveDraft,
  onSendToCustomer,
}) {
  const approverCount = approvalPath.approvers.length;

  const actionLabel =
    approverCount === 0
      ? 'Confirm & Continue to Fulfillment'
      : approverCount === 1
        ? 'Send for Manager Approval'
        : 'Send for Manager + Finance Approval';

  const actionIcon = approverCount === 0 ? CheckCircle2 : approverCount === 1 ? Send : ShieldAlert;

  const actionClass =
    approverCount === 0
      ? ''
      : approverCount === 1
        ? 'bg-gradient-to-r from-accent-amber to-accent-pink hover:from-accent-amber hover:to-state-danger'
        : 'bg-gradient-to-r from-state-danger to-brand-700 hover:from-state-danger hover:to-brand-800';

  const violations = risk.lineBreakdown.filter((r) => r.isViolation);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- totals */}
      <GlassCard strong className="p-4">
        <dl className="space-y-1.5">
          <Row label="Subtotal" value={money(totals.subtotal, quote.currency)} />
          {totals.lineDiscountAmount > 0 && (
            <Row
              label="Line discounts"
              value={`− ${money(totals.lineDiscountAmount, quote.currency)}`}
              tone="text-accent-amber"
            />
          )}
          {totals.orderDiscountAmount > 0 && (
            <Row
              label={`Order discount (${percent(quote.orderDiscountPct, 0)})`}
              value={`− ${money(totals.orderDiscountAmount, quote.currency)}`}
              tone="text-accent-amber"
            />
          )}
          <Row label="Tax" value={money(totals.tax, quote.currency)} />

          <div className="flex items-baseline justify-between border-t border-brand-500/15 pt-2.5">
            <dt className="text-sm font-bold text-ink">Grand total</dt>
            <dd className="num text-2xl font-extrabold tracking-tight text-ink">
              <PulseOnChange value={totals.grandTotal} tone="none">
                {money(totals.grandTotal, quote.currency)}
              </PulseOnChange>
            </dd>
          </div>
        </dl>

        {/* --------------------------------------------------- margin */}
        <div className="mt-4 border-t border-brand-500/12 pt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Margin
            </span>
            <span
              className={cn(
                'num text-sm font-extrabold',
                totals.marginPct >= MARGIN_TARGET ? 'text-state-success' : 'text-accent-amber',
              )}
            >
              <PulseOnChange value={totals.marginPct}>
                {percent(totals.marginPct)}
              </PulseOnChange>
            </span>
          </div>
          <ProgressBar
            value={Math.max(0, totals.marginPct)}
            max={60}
            tone={totals.marginPct >= MARGIN_TARGET ? 'success' : 'warning'}
          />
          <p className="mt-1.5 text-[11px] text-ink-muted">
            {money(totals.marginAmount, quote.currency)} on{' '}
            {money(totals.netBeforeTax, quote.currency)} net · target {MARGIN_TARGET}%
          </p>
        </div>

        {totals.recurringCount > 0 && (
          <div className="mt-3 rounded-xl bg-accent-indigo/8 p-2.5">
            <p className="text-[11px] font-bold text-accent-indigo">Hybrid order</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">
              {money(totals.oneTimeTotal, quote.currency)} one-time ·{' '}
              {money(totals.recurringTotal, quote.currency)} recurring across{' '}
              {totals.recurringCount} line(s)
            </p>
          </div>
        )}
      </GlassCard>

      {/* --------------------------------------------------------- risk */}
      <GlassCard strong className="p-4">
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-muted">
            Blended risk
          </span>
          {riskLoading ? (
            <Spinner size="xs" className="text-brand-500" />
          ) : (
            <ServerCog className="h-3 w-3 text-ink-muted" aria-hidden="true" />
          )}
        </div>

        <RiskGauge
          score={risk.score}
          label={riskLoading ? 'Scoring…' : approvalPath.label}
          className="mx-auto"
        />

        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-soft">
          {riskLoading ? 'Fetching the score from the governance service…' : explainRisk(risk)}
        </p>

        {riskIsFallback && (
          <p className="mt-2 rounded-lg bg-accent-amber/12 px-2.5 py-1.5 text-center text-[10px] font-semibold leading-relaxed text-accent-amber">
            Scoring service unreachable — showing a provisional local estimate.
          </p>
        )}

        {violations.length > 0 && (
          <ul className="mt-3 space-y-1.5 border-t border-brand-500/12 pt-3">
            {violations
              .slice()
              .sort((a, b) => b.overBy - a.overBy)
              .map((row) => (
                <li
                  key={row.lineId}
                  className="flex items-start gap-2 rounded-lg bg-state-danger/8 px-2.5 py-2"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0 text-state-danger"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold text-ink">{row.productName}</p>
                    <p className="text-[10px] text-ink-soft">
                      {percent(row.givenPct, 0)} given vs {percent(row.ceilingPct, 0)} allowed ·{' '}
                      <span className="font-bold text-state-danger">
                        {row.overBy.toFixed(1)} pts over
                      </span>
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </GlassCard>

      {/* ------------------------------------------------------ actions */}
      <GlassCard strong className="p-4">
        <Button
          fullWidth
          size="lg"
          icon={actionIcon}
          className={actionClass}
          disabled={!editable || quote.lines.length === 0 || riskLoading}
          loading={busy || riskLoading}
          onClick={onSubmit}
        >
          {riskLoading ? 'Waiting for score…' : actionLabel}
        </Button>

        <p className="mt-2 text-center text-[11px] font-semibold text-ink-muted">
          {riskLoading
            ? 'The route is decided by the server, not this screen'
            : approverCount === 0
              ? 'No approval required — every line is inside its ceiling'
              : `${approverCount} approver${approverCount > 1 ? 's' : ''} required`}
        </p>

        <div className="mt-3 space-y-2 border-t border-brand-500/12 pt-3">
          <Button
            fullWidth
            variant="secondary"
            size="sm"
            icon={Save}
            disabled={!editable}
            onClick={onSaveDraft}
          >
            Save Draft
          </Button>
          <Button
            fullWidth
            variant="ghost"
            size="sm"
            icon={Share2}
            disabled={quote.lines.length === 0}
            onClick={onSendToCustomer}
          >
            Share with customer
          </Button>
          <p className="text-center text-[10px] leading-relaxed text-ink-muted">
            Appears in their own signed-in account. No link to send.
          </p>
        </div>
      </GlassCard>
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={cn('num text-xs font-semibold text-ink', tone)}>{value}</dd>
    </div>
  );
}
