import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Filter,
  Package,
  Percent,
  TrendingUp,
  Users2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { fetchProductReport, fetchReportSummary } from '@/services/reportsService';
import { exportTableToPdf, exportToXlsx } from '@/lib/exporters';
import { FUNNEL_ORDER } from '@/lib/stageMachine';
import { categoryLabel, dateShort, money, moneyCompact, percent, stageLabel } from '@/lib/format';
import { addDaysISO, cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, Skeleton } from '@/components/ui/Misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { StatTile } from '@/components/shared/Indicators';

const PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: 'week', label: 'This week', days: 7 },
  { key: 'month', label: 'This month', days: 30 },
  { key: 'quarter', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

const STATUS_CHIPS = FUNNEL_ORDER.concat('lost');

const CHART_COLORS = ['#8b5cf6', '#6366f1', '#14b8a6', '#ec4899', '#f59e0b', '#ef4444'];

const EMPTY_KPIS = {
  totalQuotations: 0,
  totalValue: 0,
  winRate: 0,
  avgDiscountPct: 0,
  avgMarginPct: 0,
  avgCycleDays: 0,
};

/**
 * Reporting dashboard.
 *
 * EVERY NUMBER ON THIS PAGE COMES FROM GET /reports/summary AND GET /reports/products.
 * It used to be computed from `state.quotations` by a local aggregator. That cannot work
 * against the API for a simple reason: the store holds one page of quotations, so
 * "total value" would silently mean "total across the hundred rows this browser happens
 * to have", and win rate would be measured against a sample rather than the business.
 * Margin makes it worse — `costPrice` is not on a quotation line the client can read.
 *
 * `valueByTeam` is the rollup the brief asks for. Reps with no team appear under
 * "Unassigned" so the team rows always reconcile to `kpis.totalValue`; a report whose
 * parts do not sum to its header is worse than no report.
 *
 * `category` filters the LINES rather than the quotations, so a mixed order still
 * contributes its hardware lines to a hardware report.
 *
 * Both exports are built from the same payloads the charts render, so a filtered export
 * and the screen it was taken from cannot disagree.
 */
export default function Reports() {
  const users = useAppStore((s) => s.users);
  const teams = useAppStore((s) => s.teams);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);
  const loadUsers = useAppStore((s) => s.loadUsers);
  const loadTeams = useAppStore((s) => s.loadTeams);

  const [preset, setPreset] = useState('quarter');
  const [from, setFrom] = useState(addDaysISO(new Date(), -90));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [repIds, setRepIds] = useState([]);
  const [teamIds, setTeamIds] = useState([]);
  const [stages, setStages] = useState([]);
  const [category, setCategory] = useState('');

  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (users.length === 0) loadUsers();
    if (teams.length === 0) loadTeams();
  }, [users.length, teams.length, loadUsers, loadTeams]);

  const filters = useMemo(
    () => ({
      from: preset === 'all' ? undefined : from,
      to: preset === 'all' ? undefined : to,
      repIds,
      teamIds,
      stages,
      category: category || undefined,
    }),
    [preset, from, to, repIds, teamIds, stages, category],
  );

  /**
   * Debounced because a filter change is a request now, not a re-render — clicking three
   * rep chips in a row should not fire three pairs of aggregate queries over the whole
   * quotation table. `cancelled` guards against an older reply landing after a newer one
   * and repainting the page with the wrong filter's numbers.
   */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const [nextSummary, nextProducts] = await Promise.all([
          fetchReportSummary(filters),
          fetchProductReport(filters),
        ]);
        if (cancelled) return;
        setSummary(nextSummary);
        setProducts(nextProducts);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setSummary(null);
        setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters]);

  const kpis = summary?.kpis ?? EMPTY_KPIS;
  const valueByRep = summary?.valueByRep ?? [];
  const valueByTeam = summary?.valueByTeam ?? [];
  const discountBuckets = summary?.discountBuckets ?? [];
  const funnel = summary?.funnel ?? [];
  const revenueMix = summary?.revenueMix ?? [];

  const applyPreset = (key) => {
    setPreset(key);
    const found = PRESETS.find((p) => p.key === key);
    if (!found || found.days === null) return;
    setFrom(addDaysISO(new Date(), -found.days));
    setTo(new Date().toISOString().slice(0, 10));
  };

  const toggleIn = (setter) => (value) =>
    setter((list) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]));

  const toggleStage = toggleIn(setStages);
  const toggleRep = toggleIn(setRepIds);
  const toggleTeam = toggleIn(setTeamIds);

  const clearFilters = () => {
    setPreset('all');
    setRepIds([]);
    setTeamIds([]);
    setStages([]);
    setCategory('');
  };

  const activeFilterCount =
    (preset === 'all' ? 0 : 1) +
    (repIds.length ? 1 : 0) +
    (teamIds.length ? 1 : 0) +
    (stages.length ? 1 : 0) +
    (category ? 1 : 0);

  const filterSummary = [
    {
      label: 'Period',
      value: preset === 'all' ? 'All time' : `${dateShort(from)} – ${dateShort(to)}`,
    },
    { label: 'Reps', value: repIds.length ? `${repIds.length} selected` : 'All' },
    { label: 'Teams', value: teamIds.length ? `${teamIds.length} selected` : 'All' },
    { label: 'Status', value: stages.length ? stages.map(stageLabel).join(', ') : 'All' },
    { label: 'Category', value: category ? categoryLabel(category) : 'All' },
  ];

  /**
   * The PDF is the product table rather than a quotation-by-quotation list.
   *
   * /reports/products is the row-level detail the API exposes; there is no endpoint that
   * returns every matching quotation with its margin, and exporting the quotations this
   * tab happens to have cached would produce a document that does not match the summary
   * printed above it.
   */
  const handleExportPdf = async () => {
    await exportTableToPdf({
      title: 'Sales performance report',
      subtitle: `${kpis.totalQuotations} quotation(s) · ${money(kpis.totalValue)} total value`,
      summary: filterSummary,
      columns: [
        { header: 'Product', value: (r) => r.productName },
        { header: 'Category', value: (r) => categoryLabel(r.category) },
        { header: 'Units', value: (r) => r.qty },
        { header: 'Value', value: (r) => money(r.value) },
        { header: 'Avg discount', value: (r) => percent(r.avgDiscountPct) },
        { header: 'Est. cost', value: (r) => money(r.estimatedCost) },
      ],
      rows: products,
      fileName: `dealflow360-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
    toast.success('PDF exported', { description: 'Includes the active filter summary.' });
  };

  const handleExportXlsx = async () => {
    await exportToXlsx({
      fileName: `dealflow360-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: 'Summary',
          rows: [
            { Metric: 'Quotations', Value: kpis.totalQuotations },
            { Metric: 'Total value', Value: kpis.totalValue },
            { Metric: 'Win rate %', Value: kpis.winRate },
            { Metric: 'Avg discount %', Value: kpis.avgDiscountPct },
            { Metric: 'Avg margin %', Value: kpis.avgMarginPct },
            { Metric: 'Avg cycle days', Value: kpis.avgCycleDays },
            ...filterSummary.map((f) => ({ Metric: `Filter · ${f.label}`, Value: f.value })),
          ],
        },
        {
          name: 'By rep',
          rows: valueByRep.map((r) => ({
            Rep: r.name,
            Quotations: r.count,
            Total_Value: r.value,
            Avg_Discount_Pct: r.avgDiscountPct,
          })),
        },
        {
          name: 'By team',
          rows: valueByTeam.map((t) => ({
            Team: t.team,
            Reps: t.repCount,
            Quotations: t.count,
            Total_Value: t.value,
            Avg_Discount_Pct: t.avgDiscountPct,
          })),
        },
        {
          name: 'Products',
          rows: products.map((p) => ({
            Product: p.productName,
            Category: categoryLabel(p.category),
            Units: p.qty,
            Value: p.value,
            Avg_Discount_Pct: p.avgDiscountPct,
            Estimated_Cost: p.estimatedCost,
          })),
        },
        {
          name: 'Revenue mix',
          rows: revenueMix.map((m) => ({
            Month: m.month,
            One_Time: m.oneTime,
            Recurring: m.recurring,
          })),
        },
      ],
    });
    toast.success('Excel exported', {
      description: '5 sheets: summary, reps, teams, products and revenue mix.',
    });
  };

  const hasData = kpis.totalQuotations > 0;

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Aggregated server-side across every matching quotation, not just the ones on screen. Both exports reflect the active filters."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleExportPdf}
              disabled={!hasData}
            >
              Export PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={FileSpreadsheet}
              onClick={handleExportXlsx}
              disabled={!hasData}
            >
              Export XLS
            </Button>
          </>
        }
      />

      {/* ------------------------------------------------------- filters */}
      <GlassCard strong className="sticky top-20 z-20 mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink">
            <Filter className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
            Filters
          </span>
          {activeFilterCount > 0 && (
            <Badge tone="brand" size="xs">
              {activeFilterCount} active
            </Badge>
          )}
          {loading && <span className="text-[11px] text-ink-muted">updating…</span>}
          <Button
            variant="ghost"
            size="xs"
            icon={X}
            className="ml-auto"
            onClick={clearFilters}
            disabled={activeFilterCount === 0}
          >
            Clear filters
          </Button>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-5">
          {/* period */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Period</p>
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                    preset === p.key
                      ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white'
                      : 'bg-white/60 text-ink-soft hover:text-brand-700',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset !== 'all' && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Input
                  type="date"
                  value={from}
                  aria-label="From date"
                  className="h-8 text-[11px]"
                  onChange={(e) => {
                    setFrom(e.target.value);
                    setPreset('custom');
                  }}
                />
                <Input
                  type="date"
                  value={to}
                  aria-label="To date"
                  className="h-8 text-[11px]"
                  onChange={(e) => {
                    setTo(e.target.value);
                    setPreset('custom');
                  }}
                />
              </div>
            )}
          </div>

          {/* reps */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Sales rep</p>
            <div className="flex flex-wrap gap-1">
              {users
                .filter((u) => ['sales_rep', 'sales_manager'].includes(u.role))
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleRep(u.id)}
                    className={cn(
                      'rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                      repIds.includes(u.id)
                        ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white'
                        : 'bg-white/60 text-ink-soft hover:text-brand-700',
                    )}
                  >
                    {u.name.split(' ')[0]}
                  </button>
                ))}
            </div>
          </div>

          {/* teams */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Sales team</p>
            <div className="flex flex-wrap gap-1">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTeam(t.id)}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                    teamIds.includes(t.id)
                      ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white'
                      : 'bg-white/60 text-ink-soft hover:text-brand-700',
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          {/* approval status */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Approval status</p>
            <div className="flex flex-wrap gap-1">
              {STATUS_CHIPS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStage(s)}
                  className={cn(
                    'rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors',
                    stages.includes(s)
                      ? 'bg-gradient-to-r from-brand-500 to-accent-indigo text-white'
                      : 'bg-white/60 text-ink-soft hover:text-brand-700',
                  )}
                >
                  {stageLabel(s)}
                </button>
              ))}
            </div>
          </div>

          {/* category */}
          <div>
            <Select
              label="Product / category"
              placeholder="All categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              options={Object.keys(categoryCeilings).map((c) => ({
                value: c,
                label: categoryLabel(c),
              }))}
            />
          </div>
        </div>
      </GlassCard>

      {error ? (
        <GlassPanel title="Report unavailable" icon={BarChart3}>
          <EmptyState
            icon={Filter}
            title="The report could not be built"
            description={error}
          />
        </GlassPanel>
      ) : loading && !summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : !hasData ? (
        <GlassPanel title="No data" icon={BarChart3}>
          <EmptyState
            icon={Filter}
            title="Nothing matches these filters"
            description="Widen the period or clear a filter to see results."
            action={
              <Button size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </GlassPanel>
      ) : (
        <>
          {/* ----------------------------------------------------- KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatTile
              label="Quotations"
              value={kpis.totalQuotations}
              format={(v) => Math.round(v)}
              icon={BarChart3}
            />
            <StatTile
              label="Total value"
              value={kpis.totalValue}
              format={(v) => moneyCompact(v)}
              icon={TrendingUp}
              tone="teal"
            />
            <StatTile
              label="Win rate"
              value={kpis.winRate}
              format={(v) => percent(v, 0)}
              icon={TrendingUp}
              tone="success"
            />
            <StatTile
              label="Avg discount"
              value={kpis.avgDiscountPct}
              format={(v) => percent(v)}
              icon={Percent}
              tone="amber"
            />
            <StatTile
              label="Avg margin"
              value={kpis.avgMarginPct}
              format={(v) => percent(v)}
              icon={Percent}
              tone="indigo"
            />
            <StatTile
              label="Avg cycle"
              value={kpis.avgCycleDays}
              format={(v) => `${Math.round(v)}d`}
              icon={BarChart3}
              tone="pink"
            />
          </div>

          {/* --------------------------------------------------- charts */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <GlassPanel title="Quotation value by rep" icon={BarChart3}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={valueByRep} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#7c6f93' }}
                    tickFormatter={(v) => moneyCompact(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={92}
                    tick={{ fontSize: 10, fill: '#7c6f93' }}
                  />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v) => [money(v), 'Value']}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {valueByRep.map((row, i) => (
                      <Cell key={row.repId ?? i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Total quotation value attributed to each rep in the selected period.
              </p>
            </GlassPanel>

            <GlassPanel title="Value by sales team" icon={Users2} accent="pink">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={valueByTeam} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#7c6f93' }}
                    tickFormatter={(v) => moneyCompact(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="team"
                    width={110}
                    tick={{ fontSize: 10, fill: '#7c6f93' }}
                  />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v) => [money(v), 'Value']}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {valueByTeam.map((row, i) => (
                      <Cell key={row.teamId ?? row.team} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Reps with no team roll up under &ldquo;Unassigned&rdquo;, so these rows always add
                up to the total value above.
              </p>
            </GlassPanel>

            <GlassPanel title="Discount distribution" icon={Percent} accent="amber">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={discountBuckets} margin={{ left: -18, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7c6f93' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#7c6f93' }} allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v) => [`${v} quotation(s)`, 'Count']}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {discountBuckets.map((row, i) => (
                      <Cell key={row.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Effective order-level discount across the matching quotations.
              </p>
            </GlassPanel>

            <GlassPanel title="Approval funnel" icon={BarChart3} accent="indigo">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={funnel} margin={{ left: -18, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis
                    dataKey="stage"
                    tick={{ fontSize: 9, fill: '#7c6f93' }}
                    tickFormatter={(s) => stageLabel(s).split(' ')[0]}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#7c6f93' }} allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v) => [`${v} deal(s)`, 'Count']}
                    labelFormatter={stageLabel}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                How far deals progress through the governed workflow.
              </p>
            </GlassPanel>

            <GlassPanel title="Revenue mix over time" icon={TrendingUp} accent="teal">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={revenueMix} margin={{ left: -12, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#7c6f93' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#7c6f93' }}
                    tickFormatter={(v) => moneyCompact(v)}
                  />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v, name) => [money(v), name === 'oneTime' ? 'One-time' : 'Recurring']}
                  />
                  <Legend
                    formatter={(v) => (v === 'oneTime' ? 'One-time' : 'Recurring')}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="oneTime"
                    stackId="1"
                    stroke="#8b5cf6"
                    fill="rgba(139,92,246,0.35)"
                  />
                  <Area
                    type="monotone"
                    dataKey="recurring"
                    stackId="1"
                    stroke="#14b8a6"
                    fill="rgba(20,184,166,0.35)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Hybrid billing split by month — one-time hardware and services against recurring
                subscription value.
              </p>
            </GlassPanel>
          </div>

          {/* -------------------------------------------- product table */}
          <GlassPanel
            title="Top products"
            description="Best selling by value, with the average discount given on each."
            icon={Package}
            bodyClassName="px-0 py-0 sm:px-0"
          >
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>Category</TH>
                  <TH align="right">Units</TH>
                  <TH align="right">Value</TH>
                  <TH align="right">Avg discount</TH>
                  <TH>Share of value</TH>
                </TR>
              </THead>
              <TBody>
                {products.slice(0, 12).map((p) => {
                  const share = kpis.totalValue > 0 ? (p.value / kpis.totalValue) * 100 : 0;
                  // The ceiling map is only readable by manager, finance and admin, so a
                  // missing entry must not paint every row red.
                  const ceiling = categoryCeilings[p.category];
                  const overCeiling = ceiling != null && p.avgDiscountPct > ceiling;

                  return (
                    <TR key={p.productId}>
                      <TD className="font-semibold">{p.productName}</TD>
                      <TD>
                        <Badge
                          tone={
                            p.category === 'hardware'
                              ? 'indigo'
                              : p.category === 'service'
                                ? 'pink'
                                : p.category === 'subscription'
                                  ? 'teal'
                                  : 'neutral'
                          }
                          size="xs"
                        >
                          {categoryLabel(p.category)}
                        </Badge>
                      </TD>
                      <TD align="right" num>
                        {p.qty}
                      </TD>
                      <TD align="right" num className="font-bold">
                        {money(p.value)}
                      </TD>
                      <TD align="right">
                        <span
                          className={cn('num font-semibold', overCeiling && 'text-state-danger')}
                        >
                          {percent(p.avgDiscountPct)}
                        </span>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-brand-500/12">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-indigo"
                              style={{ width: `${Math.min(100, share)}%` }}
                            />
                          </div>
                          <span className="num text-[11px] text-ink-muted">
                            {percent(share, 0)}
                          </span>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </GlassPanel>
        </>
      )}
    </div>
  );
}
