import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowUpRight,
  Bell,
  Clock,
  Gauge,
  Settings2,
  ShieldAlert,
  Siren,
  TrendingDown,
  Truck,
  UserCheck,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectAlerts, selectDealHealth, selectStageFunnel } from '@/store/selectors';
import { agingBuckets, alertTargetRoute, SEVERITY_META } from '@/lib/anomalyEngine';
import { moneyCompact, percent, relativeTime, stageLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Popover, Slider } from '@/components/ui/Misc';
import { StatTile } from '@/components/shared/Indicators';
import { SegmentedControl } from '@/components/ui/Tabs';

const ALERT_ICON = {
  stalled: Clock,
  discount_anomaly: TrendingDown,
  delivery_slippage: Truck,
  approval_bottleneck: UserCheck,
};

const ALERT_LABEL = {
  stalled: 'Stalled deal',
  discount_anomaly: 'Discount anomaly',
  delivery_slippage: 'Delivery slippage',
  approval_bottleneck: 'Approval bottleneck',
};

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'discount_anomaly', label: 'Anomalies' },
  { value: 'delivery_slippage', label: 'Delivery' },
  { value: 'approval_bottleneck', label: 'Approvals' },
];

/** Deal health and anomaly dashboard (spec B9). */
export default function Dashboard() {
  const navigate = useNavigate();
  const health = useAppStore(selectDealHealth);
  const quotations = useAppStore((s) => s.quotations);
  const funnel = useAppStore(selectStageFunnel);
  const config = useAppStore((s) => s.dashboardConfig);
  const setDashboardConfig = useAppStore((s) => s.setDashboardConfig);
  const nudgeRep = useAppStore((s) => s.nudgeRep);
  const escalateAlert = useAppStore((s) => s.escalateAlert);

  const [typeFilter, setTypeFilter] = useState('');
  const alerts = useAppStore((s) => selectAlerts(s, { type: typeFilter || null }));

  const buckets = agingBuckets(quotations);

  const handleNudge = (alertId) => {
    const result = nudgeRep(alertId);
    if (result.ok) {
      toast.success(`${result.repName} nudged`, {
        description: 'A notification was sent and the action logged to the audit trail.',
      });
    } else {
      toast.error(result.error);
    }
  };

  const handleEscalate = (alertId) => {
    const result = escalateAlert(alertId);
    if (result.ok) {
      toast.success('Escalated to Sales Manager', {
        description: 'Severity raised so it stays at the top of the feed.',
      });
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div>
      <PageHeader
        title="Deal health"
        description="Anomalies are computed against each rep's own rolling 90-day history, not a global threshold."
        actions={
          <Popover
            trigger={
              <Button variant="secondary" size="sm" icon={Settings2}>
                Thresholds
              </Button>
            }
          >
            <div className="space-y-4">
              <div>
                <p className="text-sm font-bold text-ink">Detection thresholds</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  Changes apply immediately and re-run detection.
                </p>
              </div>

              <Slider
                label="Stall threshold"
                value={config.stallThresholdDays}
                min={1}
                max={30}
                step={1}
                valueLabel={`${config.stallThresholdDays} days`}
                onValueChange={(v) => setDashboardConfig({ stallThresholdDays: v })}
              />

              <Slider
                label="Anomaly sensitivity"
                value={config.anomalySensitivity}
                min={1.1}
                max={4}
                step={0.1}
                valueLabel={`${config.anomalySensitivity.toFixed(1)}× rep average`}
                onValueChange={(v) => setDashboardConfig({ anomalySensitivity: v })}
              />

              <Input
                label="Approval SLA"
                type="number"
                min={1}
                max={240}
                suffix="hrs"
                value={config.approvalSlaHours}
                onChange={(e) => setDashboardConfig({ approvalSlaHours: Number(e.target.value) })}
              />
            </div>
          </Popover>
        }
      />

      {/* ------------------------------------------------------------ KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile
          label="Active deals"
          value={health.activeCount}
          format={(v) => Math.round(v)}
          hint={`${moneyCompact(health.activeValue)} in play`}
          icon={Gauge}
          tone="brand"
        />
        <StatTile
          label="Stalled"
          value={health.stalledCount}
          format={(v) => Math.round(v)}
          hint={`over ${config.stallThresholdDays} days idle`}
          icon={Clock}
          tone="amber"
        />
        <StatTile
          label="Anomalies"
          value={health.anomalyCount}
          format={(v) => Math.round(v)}
          hint={`${health.highSeverityCount} high severity`}
          icon={TrendingDown}
          tone="danger"
        />
        <StatTile
          label="Pending approvals"
          value={health.pendingApprovalCount}
          format={(v) => Math.round(v)}
          hint={
            health.oldestPendingHours
              ? `oldest waiting ${health.oldestPendingHours}h`
              : 'nothing waiting'
          }
          icon={UserCheck}
          tone="indigo"
        />
        <StatTile
          label="Win rate"
          value={health.winRate}
          format={(v) => percent(v, 0)}
          hint="of closed deals"
          icon={ArrowUpRight}
          tone="success"
        />
        <StatTile
          label="Avg cycle"
          value={health.avgCycleDays}
          format={(v) => `${Math.round(v)}d`}
          hint="create to confirm"
          icon={Clock}
          tone="teal"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        {/* ------------------------------------------------- alert feed */}
        <GlassPanel
          title="Alert feed"
          description={`${alerts.length} active alert(s), highest severity first.`}
          icon={Siren}
          accent="danger"
          actions={
            <SegmentedControl
              size="sm"
              value={typeFilter}
              onChange={setTypeFilter}
              options={FILTERS}
            />
          }
          bodyClassName="px-0 py-0 sm:px-0"
        >
          {alerts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Nothing needs attention"
              description="No stalled deals, discount outliers, delivery slips or approval bottlenecks right now."
            />
          ) : (
            <ul className="divide-y divide-brand-500/10">
              {alerts.map((alert) => {
                const Icon = ALERT_ICON[alert.type] ?? Bell;
                const severity = SEVERITY_META[alert.severity];

                return (
                  <li key={alert.id} className="px-4 py-3.5 transition-colors hover:bg-brand-500/4 sm:px-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                          severity.bg,
                          severity.tone,
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            tone={
                              alert.severity === 'high'
                                ? 'danger'
                                : alert.severity === 'medium'
                                  ? 'warning'
                                  : 'info'
                            }
                            size="xs"
                          >
                            {ALERT_LABEL[alert.type]}
                          </Badge>
                          <span className="num text-[11px] font-bold text-brand-700">
                            {alert.quotationId}
                          </span>
                          {alert.escalated && (
                            <Badge tone="danger" size="xs">
                              Escalated
                            </Badge>
                          )}
                          <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
                            {relativeTime(alert.detectedAt)}
                          </span>
                        </div>

                        <p className="mt-1 text-sm font-bold leading-snug text-ink">{alert.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{alert.detail}</p>

                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => navigate(alertTargetRoute(alert))}
                          >
                            Open
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => handleNudge(alert.id)}>
                            Nudge Rep
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => handleEscalate(alert.id)}>
                            Escalate
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassPanel>

        {/* ----------------------------------------------------- charts */}
        <div className="space-y-4">
          <GlassPanel title="Deals by stage" icon={Gauge}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnel} layout="vertical" margin={{ left: 4, right: 12 }}>
                <CartesianGrid horizontal={false} stroke="rgba(139,92,246,0.12)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#7c6f93' }} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  width={92}
                  tick={{ fontSize: 10, fill: '#7c6f93' }}
                  tickFormatter={stageLabel}
                />
                <ReTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid rgba(139,92,246,0.2)',
                    fontSize: 12,
                  }}
                  formatter={(v) => [`${v} deal(s)`, 'Count']}
                  labelFormatter={stageLabel}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-ink-muted">
              Stage counts across every open and closed quotation.
            </p>
          </GlassPanel>

          <GlassPanel title="Aging buckets" icon={Clock} accent="amber">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={buckets} margin={{ left: -18, right: 8 }}>
                <CartesianGrid vertical={false} stroke="rgba(139,92,246,0.12)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7c6f93' }} />
                <YAxis tick={{ fontSize: 10, fill: '#7c6f93' }} allowDecimals={false} />
                <ReTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid rgba(139,92,246,0.2)',
                    fontSize: 12,
                  }}
                  formatter={(v) => [`${v} deal(s)`, 'Open']}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {buckets.map((b, i) => (
                    <Cell
                      key={b.name}
                      fill={['#22c55e', '#14b8a6', '#f59e0b', '#ef4444'][i] ?? '#8b5cf6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[11px] text-ink-muted">
              Days since last activity on open deals only.
            </p>
          </GlassPanel>

          <GlassCard className="p-4">
            <p className="text-xs font-bold text-ink">How anomaly detection works</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
              Each rep&apos;s average effective discount over the last 90 days is computed, then any
              quotation more than{' '}
              <span className="font-bold text-brand-700">
                {config.anomalySensitivity.toFixed(1)}×
              </span>{' '}
              that average is flagged. Comparing a rep against themselves means a naturally
              aggressive discounter doesn&apos;t drown out the signal from a conservative one.
            </p>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
