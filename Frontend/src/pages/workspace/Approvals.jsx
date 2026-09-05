import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, Inbox, RefreshCw, UserCheck } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { money, percent, relativeTime, roleLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { Avatar, EmptyState } from '@/components/ui/Misc';
import { RiskBadge } from '@/components/shared/RiskGauge';
import { TierBadge } from '@/components/shared/Indicators';

/**
 * My approval queue — GET /approvals/queue (§12.5).
 *
 * The endpoint and its service call already existed; nothing rendered them, so a Sales
 * Manager or a Finance user had no list of what was waiting on them. They could only
 * reach a pending step through a notification, and a notification that has scrolled
 * out of the panel is a step nobody is looking at.
 *
 * WHAT THE SERVER DECIDES, AND THIS DOES NOT SECOND-GUESS:
 *
 *  · WHICH ROWS APPEAR. Only quotations whose CURRENT step matches the caller's role.
 *    Steps are strictly ordered, so Finance never sees one still sitting with the
 *    Sales Manager — they cannot act on it, and showing it would read as a backlog
 *    they are failing to clear. There is no client-side filter here for that reason.
 *  · THE RISK FIGURES. `risk.score`, `violationCount` and `label` come down with each
 *    row, scored against stored config by the same code path that routed the
 *    quotation. Re-scoring here could only produce a second, disagreeing number.
 *
 * The SLA breach is computed on this side because it is presentation: `waitingSince`
 * and `approvalSlaHours` both come from the server, and colouring a row amber is not a
 * decision the API needs to make.
 */
export default function Approvals() {
  const navigate = useNavigate();

  const queue = useAppStore((s) => s.approvalQueue);
  const loading = useAppStore((s) => s.approvalQueueLoading);
  const error = useAppStore((s) => s.approvalQueueError);
  const loadApprovalQueue = useAppStore((s) => s.loadApprovalQueue);
  const currentUser = useAppStore((s) => s.currentUser);

  // `approvalSlaHours` is the same threshold the approval_bottleneck alert is measured
  // against (§5.9), so a row flagged here and an alert on the dashboard agree.
  const slaHours = useAppStore((s) => s.dashboardConfig.approvalSlaHours);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadApprovalQueue();
  }, [loadApprovalQueue]);

  const rows = useMemo(
    () =>
      (queue ?? []).map((entry) => {
        const waitingSince = entry.step?.waitingSince;
        const hoursWaiting = waitingSince
          ? (Date.now() - new Date(waitingSince).getTime()) / 3_600_000
          : 0;
        return { ...entry, hoursWaiting, breached: hoursWaiting > slaHours };
      }),
    [queue, slaHours],
  );

  const breachedCount = rows.filter((r) => r.breached).length;
  const totalValue = rows.reduce((sum, r) => sum + (r.quotation?.totals?.grandTotal ?? 0), 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadApprovalQueue();
    setRefreshing(false);
  };

  return (
    <div>
      <PageHeader
        title="Approval queue"
        description={
          rows.length === 0
            ? 'Quotations waiting on a decision from you.'
            : `${rows.length} waiting on you · ${money(totalValue)} of pipeline held up${
                breachedCount > 0 ? ` · ${breachedCount} past the ${slaHours}h SLA` : ''
              }`
        }
        badge={
          currentUser ? (
            <Badge tone="indigo" size="xs">
              Acting as {roleLabel(currentUser.role)}
            </Badge>
          ) : null
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        }
      />

      <GlassPanel
        title="Waiting on you"
        description="Steps are strictly ordered — a quotation appears here only once every earlier approver has signed off."
        icon={UserCheck}
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center gap-3 px-4 py-14">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-600"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-ink-soft" role="status">
              Loading your queue…
            </p>
          </div>
        ) : error && rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Couldn't load your queue"
            description={error}
            action={
              <Button icon={RefreshCw} size="sm" onClick={handleRefresh}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Nothing waiting on you"
            description="Every step assigned to your role has been actioned. New submissions land here as soon as the chain reaches you."
            action={
              <Link to="/app/quotations">
                <Button variant="secondary" size="sm">
                  Browse all quotations
                </Button>
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Quote</TH>
                <TH>Customer</TH>
                <TH>Owner</TH>
                <TH align="right">Total</TH>
                <TH align="right">Discount</TH>
                <TH align="center">Risk</TH>
                <TH>Routing</TH>
                <TH align="right">Waiting</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ quotation, step, risk, breached }) => (
                <TR
                  key={quotation.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/quotations/${quotation.id}/approval`)}
                >
                  <TD>
                    <span className="num font-bold text-brand-700">
                      {quotation.reference ?? quotation.id}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{quotation.customerName}</span>
                      <TierBadge tier={quotation.tier} showIcon={false} />
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Avatar name={quotation.ownerName} size="xs" />
                      <span className="text-xs text-ink-soft">{quotation.ownerName}</span>
                    </div>
                  </TD>
                  <TD align="right" num>
                    {money(quotation.totals?.grandTotal ?? 0, quotation.currency)}
                  </TD>
                  <TD align="right" num className="text-ink-soft">
                    {percent(quotation.totals?.effectiveDiscountPct ?? 0)}
                  </TD>
                  <TD align="center">
                    <RiskBadge score={risk?.score ?? 0} />
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold text-ink">
                        {risk?.label ?? roleLabel(step?.role)}
                      </span>
                      {/*
                        `stepOrder` is zero-based server-side; a reviewer reads "step 2",
                        not "step 1 of the array".
                      */}
                      <span className="text-[10px] text-ink-muted">
                        Your step is #{(step?.stepOrder ?? 0) + 1} · {roleLabel(step?.role)}
                      </span>
                    </div>
                  </TD>
                  <TD align="right">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 text-xs',
                        breached ? 'font-bold text-accent-amber' : 'text-ink-muted',
                      )}
                    >
                      {breached && <Clock className="h-3 w-3" aria-hidden="true" />}
                      {step?.waitingSince ? relativeTime(step.waitingSince) : '—'}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </GlassPanel>

      {breachedCount > 0 && (
        <GlassCard className="mt-4 border-accent-amber/30 bg-accent-amber/8 p-3.5">
          <p className="text-xs font-bold text-accent-amber">
            {breachedCount} step{breachedCount === 1 ? '' : 's'} past the {slaHours}-hour SLA
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            These are the same steps the deal-health screen raises as approval bottlenecks. Open one
            to approve, return it for revision, or reject it with a reason.
          </p>
        </GlassCard>
      )}
    </div>
  );
}
