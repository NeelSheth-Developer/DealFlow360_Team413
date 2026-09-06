import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ClipboardList,
  Clock,
  Gauge,
  RotateCcw,
  ShieldAlert,
  StickyNote,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { resolveTotals, selectAuditForEntity } from '@/store/selectors';
import { canUserActOnApproval, currentPendingStep } from '@/lib/riskEngine';
import { dateMedium, money, percent, relativeTime, roleLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Misc';
import { RiskGauge } from '@/components/shared/RiskGauge';
import { StepProgress } from '@/components/shared/StepProgress';
import { StageBadge, TierBadge } from '@/components/shared/Indicators';
import { AuditTrailList } from '@/components/shared/AuditTrailList';
import { ReasonDialog } from '@/components/shared/Dialogs';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import { QuoteLoading } from '@/components/quotation/QuoteLoading';
import { RiskBreakdownTable } from '@/components/quotation/RiskBreakdownTable';
import { useRisk } from '@/hooks/useRisk';
import { useQuotation } from '@/hooks/useQuotation';

/** Discount approval screen (spec B4). */
export default function QuotationApproval() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { quote, resolving, missing } = useQuotation(id);
  const currentUser = useAppStore((s) => s.currentUser);
  const audit = useAppStore((s) => selectAuditForEntity(s, id));
  const invoice = useAppStore((s) => s.invoices.find((i) => i.quotationId === id));

  const approveStep = useAppStore((s) => s.approveStep);
  const rejectQuote = useAppStore((s) => s.rejectQuote);
  const returnForRevision = useAppStore((s) => s.returnForRevision);
  const loadEntityAudit = useAppStore((s) => s.loadEntityAudit);

  const [comment, setComment] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Server-scored. The approver sees the same number the router used.
  const { risk, approvalPath, isLoading: riskLoading, isFallback } = useRisk(id);

  /**
   * The trail is fetched here rather than assumed to be in the store: an approver
   * usually arrives from a notification link, which is a cold load, and nothing else has
   * put this quotation's audit entries in the cache.
   */
  useEffect(() => {
    if (id) loadEntityAudit('quotation', id);
  }, [id, loadEntityAudit]);

  if (resolving && !quote) return <QuoteLoading />;
  if (missing || !quote) return <Navigate to="/404" replace />;

  // Server-authoritative. An approver has to be looking at the same total, margin and
  // effective discount the record holds — a locally recomputed figure is exactly the
  // kind of disagreement an approval must not be given against.
  const totals = resolveTotals(quote);
  const pending = currentPendingStep(quote);
  const canAct = canUserActOnApproval(quote, currentUser);

  // ---------------------------------------------------------- stepper model
  const steps = [
    {
      key: 'submitted',
      label: 'Submitted',
      sublabel: relativeTime(quote.createdAt),
      state: 'done',
    },
    ...quote.approvalSteps.map((step, i) => ({
      key: `${step.role}-${i}`,
      label: roleLabel(step.role),
      sublabel:
        step.status === 'pending'
          ? 'Awaiting review'
          : step.reviewerName
            ? `${step.reviewerName} · ${relativeTime(step.at)}`
            : step.status,
      state:
        step.status === 'approved'
          ? 'done'
          : step.status === 'pending'
            ? 'current'
            : step.status === 'rejected'
              ? 'failed'
              : 'skipped',
    })),
    {
      key: 'final',
      label: quote.stage === 'lost' ? 'Rejected' : 'Approved',
      sublabel:
        quote.stage === 'lost'
          ? 'Chain terminated'
          : ['approved', 'fulfillment', 'billed', 'confirmed'].includes(quote.stage)
            ? 'Complete'
            : 'Pending',
      state:
        quote.stage === 'lost'
          ? 'failed'
          : ['approved', 'fulfillment', 'billed', 'confirmed'].includes(quote.stage)
            ? 'done'
            : 'todo',
    },
  ];

  const handleApprove = async () => {
    setBusy(true);
    const result = await approveStep(id, comment.trim() || null);
    // The server writes the audit entry, so the trail is only current after a re-read.
    await loadEntityAudit('quotation', id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setComment('');

    if (result.complete) {
      toast.success('Approval chain complete', {
        description: 'Fulfillment split is ready to review.',
      });
      navigate(`/app/quotations/${id}/fulfillment`);
    } else {
      toast.success('Approved', {
        description: `Now waiting on ${roleLabel(result.nextRole)}.`,
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={`Approval — ${quote.customerName}`}
        description={`Requested by ${quote.ownerName} · ${dateMedium(quote.createdAt)}`}
        breadcrumbs={[
          { label: 'Quotations', to: '/app/quotations' },
          { label: quote.reference ?? quote.id, to: `/app/quotations/${quote.id}` },
          { label: 'Approval' },
        ]}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <StageBadge stage={quote.stage} />
            <TierBadge tier={quote.tier} />
          </div>
        }
      />

      <QuoteNav quote={quote} hasInvoice={Boolean(invoice)} />

      {/* ----------------------------------------------------- summary row */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <GlassCard strong className="p-5">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Order total" value={money(totals.grandTotal, quote.currency)} />
            <Metric
              label="Effective discount"
              value={percent(totals.effectiveDiscountPct)}
              tone={totals.effectiveDiscountPct > 15 ? 'text-state-danger' : undefined}
            />
            <Metric
              label="Margin"
              value={percent(totals.marginPct)}
              tone={totals.marginPct >= 30 ? 'text-state-success' : 'text-accent-amber'}
            />
            <Metric
              label="Lines over ceiling"
              value={`${risk.violationCount} of ${quote.lines.length}`}
              tone={risk.violationCount > 0 ? 'text-state-danger' : 'text-state-success'}
            />
          </dl>

          {quote.internalNotes && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-brand-500/8 p-3">
              <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <div>
                <p className="text-[11px] font-bold text-brand-700">Rep&apos;s note</p>
                <p className="mt-0.5 text-xs italic leading-relaxed text-ink-soft">
                  {quote.internalNotes}
                </p>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard strong className="flex flex-col items-center justify-center p-5 lg:w-64">
          <RiskGauge
            score={risk.score}
            label={riskLoading ? 'Scoring…' : approvalPath.label}
          />
          <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-muted">
            Worst single line is {risk.worstSingleOverage.toFixed(1)} pts over its ceiling.
          </p>
          <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
            {isFallback ? 'Provisional local estimate' : 'Scored by the governance service'}
          </p>
        </GlassCard>
      </div>

      {/* ----------------------------------------------------- stepper */}
      <GlassPanel title="Approval chain" icon={Clock} className="mb-4">
        <StepProgress steps={steps} />

        {quote.approvalSteps.length === 0 && quote.stage !== 'pending_approval' && (
          <p className="mt-4 rounded-xl bg-state-success/10 p-3 text-xs leading-relaxed text-ink-soft">
            <span className="font-bold text-state-success">No approval was required.</span> Every
            line was inside its ceiling, so the quotation was auto-approved without a reviewer.
          </p>
        )}

        {approvalPath.approvers.length === 2 && (
          <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
            Finance cannot act until the Sales Manager has signed off — steps are strictly ordered.
          </p>
        )}
      </GlassPanel>

      {/* --------------------------------------------------- breakdown */}
      <GlassPanel
        title="Why this needs review"
        description="Every line checked against its own binding ceiling."
        icon={Gauge}
        accent="amber"
        className="mb-4"
        bodyClassName="px-0 py-0 sm:px-0"
      >
        <RiskBreakdownTable risk={risk} currency={quote.currency} />
      </GlassPanel>

      {/* ----------------------------------------------------- actions */}
      {quote.stage === 'pending_approval' && (
        <GlassPanel
          title={canAct ? `Your decision as ${roleLabel(currentUser.role)}` : 'Awaiting review'}
          icon={canAct ? CheckCircle2 : Clock}
          accent={canAct ? 'teal' : 'brand'}
          className="mb-4"
        >
          {canAct ? (
            <div className="space-y-3.5">
              <Textarea
                label="Comment (optional)"
                rows={2}
                placeholder="Context for the audit trail — why you're approving, or any conditions."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="success"
                  icon={CheckCircle2}
                  loading={busy}
                  onClick={handleApprove}
                >
                  Approve
                </Button>
                <Button variant="warning" icon={Undo2} onClick={() => setReturnOpen(true)}>
                  Return for Revision
                </Button>
                <Button variant="danger" icon={XCircle} onClick={() => setRejectOpen(true)}>
                  Reject
                </Button>
              </div>

              <p className="text-[11px] leading-relaxed text-ink-muted">
                Rejecting closes the deal as lost. Returning sends it back to draft so the rep can
                adjust and resubmit — the risk score is recalculated from scratch on resubmission.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-brand-500/8 p-4">
              <Avatar name={roleLabel(pending?.role ?? 'Reviewer')} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">
                  Waiting on {roleLabel(pending?.role ?? 'reviewer')}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                  You&apos;re signed in as {roleLabel(currentUser?.role)}. Switch role from the user
                  menu to act on this step during a demo.
                </p>
              </div>
            </div>
          )}
        </GlassPanel>
      )}

      {quote.stage === 'lost' && (
        <GlassCard className="mb-4 border-state-danger/30 bg-state-danger/8 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-state-danger" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-state-danger">This quotation was rejected</p>
              {quote.approvalSteps.find((s) => s.status === 'rejected')?.reason && (
                <p className="mt-1 text-xs italic leading-relaxed text-ink-soft">
                  “{quote.approvalSteps.find((s) => s.status === 'rejected').reason}”
                </p>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={RotateCcw}
                className="mt-3"
                onClick={() => navigate(`/app/quotations/${id}`)}
              >
                Open the builder
              </Button>
            </div>
          </div>
        </GlassCard>
      )}

      {/* --------------------------------------------------- audit trail */}
      <GlassPanel
        title="Audit trail"
        description="Immutable record of every approval, rejection and edit."
        icon={ClipboardList}
      >
        <AuditTrailList entries={audit} />
      </GlassPanel>

      {/* -------------------------------------------------------- dialogs */}
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this quotation"
        description={`${quote.reference ?? quote.id} will be marked as lost.`}
        label="Why are you rejecting it?"
        placeholder="e.g. Bronze tier caps at 5% and the service ceiling is 10% — resubmit at 5% or upgrade the account first."
        confirmLabel="Reject quotation"
        variant="danger"
        onConfirm={async (reason) => {
          const result = await rejectQuote(id, reason);
          if (result.ok) {
            await loadEntityAudit('quotation', id);
            toast.success('Quotation rejected', { description: 'The rep has been notified.' });
          }
          return result;
        }}
      />

      <ReasonDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="Return for revision"
        description={`${quote.reference ?? quote.id} goes back to draft so the rep can adjust it.`}
        label="What needs to change?"
        placeholder="e.g. Bring the Setup Service line down to 10% and I'll approve it straight away."
        confirmLabel="Return to rep"
        variant="warning"
        onConfirm={async (reason) => {
          const result = await returnForRevision(id, reason);
          if (result.ok) {
            await loadEntityAudit('quotation', id);
            toast.success('Returned for revision', { description: 'The rep has been notified.' });
          }
          return result;
        }}
      />
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className={cn('num mt-1 text-lg font-extrabold tracking-tight text-ink', tone)}>
        {value}
      </dd>
    </div>
  );
}
