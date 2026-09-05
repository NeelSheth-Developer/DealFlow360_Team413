import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
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
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectReportData } from '@/store/selectors';
import { useAllRisks } from '@/hooks/useRisk';
import { exportTableToPdf, exportToXlsx } from '@/lib/exporters';
import { FUNNEL_ORDER } from '@/lib/stageMachine';
import {
  categoryLabel,
  dateShort,
  money,
  moneyCompact,
  percent,
  stageLabel,
} from '@/lib/format';
import { addDaysISO, cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/Misc';
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

/** Reporting dashboard (spec A7). */
export default function Reports() {
  useAllRisks();

  const users = useAppStore((s) => s.users);
  const categoryCeilings = useAppStore((s) => s.categoryCeilings);

  const [preset, setPreset] = useState('quarter');
  const [from, setFrom] = useState(addDaysISO(new Date(), -90));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [repIds, setRepIds] = useState([]);
  const [stages, setStages] = useState([]);
  const [category, setCategory] = useState('');

  const filters = useMemo(
    () => ({
      from: preset === 'all' ? null : from,
      to: preset === 'all' ? null : to,
      repIds,
      stages,
      category: category || null,
    }),
    [preset, from, to, repIds, stages, category],
  );

  const data = useAppStore((s) => selectReportData(s, filters));

  const applyPreset = (key) => {
    setPreset(key);
    const found = PRESETS.find((p) => p.key === key);
    if (!found || found.days === null) return;
    setFrom(addDaysISO(new Date(), -found.days));
    setTo(new Date().toISOString().slice(0, 10));
  };

  const toggleStage = (stage) =>
    setStages((s) => (s.includes(stage) ? s.filter((x) => x !== stage) : [...s, stage]));

  const toggleRep = (repId) =>
    setRepIds((s) => (s.includes(repId) ? s.filter((x) => x !== repId) : [...s, repId]));

  const clearFilters = () => {
    setPreset('all');
    setRepIds([]);
    setStages([]);
    setCategory('');
  };

  const activeFilterCount =
    (preset === 'all' ? 0 : 1) + (repIds.length ? 1 : 0) + (stages.length ? 1 : 0) + (category ? 1 : 0);

  const filterSummary = [
    {
      label: 'Period',
      value: preset === 'all' ? 'All time' : `${dateShort(from)} – ${dateShort(to)}`,
    },
    { label: 'Reps', value: repIds.length ? `${repIds.length} selected` : 'All' },
    { label: 'Status', value: stages.length ? stages.map(stageLabel).join(', ') : 'All' },
    { label: 'Category', value: category ? categoryLabel(category) : 'All' },
  ];

  const handleExportPdf = async () => {
    await exportTableToPdf({
      title: 'Sales performance report',
      subtitle: `${data.rows.length} quotation(s) · ${money(data.kpis.totalValue)} total value`,
      summary: filterSummary,
      columns: [
        { header: 'Quote', value: (r) => r.id },
        { header: 'Customer', value: (r) => r.customerName },
        { header: 'Tier', value: (r) => r.tier },
        { header: 'Owner', value: (r) => r.ownerName },
        { header: 'Stage', value: (r) => stageLabel(r.stage) },
        { header: 'Total', value: (r) => money(r.totals.grandTotal, r.currency) },
        { header: 'Discount', value: (r) => percent(r.totals.effectiveDiscountPct) },
        { header: 'Margin', value: (r) => percent(r.totals.marginPct) },
        { header: 'Risk', value: (r) => r.risk.score.toFixed(2) },
      ],
      rows: data.rows,
      fileName: `dealflow360-report-${new Date().toISOString().slice(0, 10)}.pdf`,
    });
    toast.success('PDF exported', { description: 'Includes the active filter summary.' });
  };

  const handleExportXlsx = async () => {
    await exportToXlsx({
      fileName: `dealflow360-report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets: [
        {
          name: 'Quotations',
          rows: data.rows.map((r) => ({
            Quote: r.id,
            Customer: r.customerName,
            Tier: r.tier,
            Owner: r.ownerName,
            Stage: stageLabel(r.stage),
            Currency: r.currency,
            Subtotal: r.totals.subtotal,
            Discount_Amount: r.totals.lineDiscountAmount + r.totals.orderDiscountAmount,
            Tax: r.totals.tax,
            Grand_Total: r.totals.grandTotal,
            Effective_Discount_Pct: r.totals.effectiveDiscountPct,
            Margin_Pct: r.totals.marginPct,
            Risk_Score: r.risk.score,
            Lines_Over_Ceiling: r.risk.violationCount,
            Created: r.createdAt.slice(0, 10),
            Last_Activity: r.lastActivityAt.slice(0, 10),
          })),
        },
        {
          name: 'By rep',
          rows: data.valueByRep.map((r) => ({
            Rep: r.name,
            Quotations: r.count,
            Total_Value: Math.round(r.value),
          })),
        },
        {
          name: 'Products',
          rows: data.products.map((p) => ({
            Product: p.productName,
            Category: categoryLabel(p.category),
            Units: p.qty,
            Value: Math.round(p.value),
            Avg_Discount_Pct: p.avgDiscountPct,
          })),
        },
      ],
    });
    toast.success('Excel exported', { description: '3 sheets: quotations, reps and products.' });
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Everything here reflects the active filters, including both exports."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={Download} onClick={handleExportPdf}>
              Export PDF
            </Button>
            <Button variant="secondary" size="sm" icon={FileSpreadsheet} onClick={handleExportXlsx}>
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

        <div className="mt-3 grid gap-3 lg:grid-cols-4">
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
            <p className="mb-1.5 text-[11px] font-semibold text-ink-soft">Sales team / rep</p>
            <div className="flex flex-wrap gap-1">
              {users
                .filter((u) => u.role === 'sales_rep')
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

      {data.rows.length === 0 ? (
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
              value={data.kpis.totalQuotations}
              format={(v) => Math.round(v)}
              icon={BarChart3}
            />
            <StatTile
              label="Total value"
              value={data.kpis.totalValue}
              format={(v) => moneyCompact(v)}
              icon={TrendingUp}
              tone="teal"
            />
            <StatTile
              label="Win rate"
              value={data.kpis.winRate}
              format={(v) => percent(v, 0)}
              icon={TrendingUp}
              tone="success"
            />
            <StatTile
              label="Avg discount"
              value={data.kpis.avgDiscountPct}
              format={(v) => percent(v)}
              icon={Percent}
              tone="amber"
            />
            <StatTile
              label="Avg margin"
              value={data.kpis.avgMarginPct}
              format={(v) => percent(v)}
              icon={Percent}
              tone="indigo"
            />
            <StatTile
              label="Avg cycle"
              value={data.kpis.avgCycleDays}
              format={(v) => `${Math.round(v)}d`}
              icon={BarChart3}
              tone="pink"
            />
          </div>

          {/* --------------------------------------------------- charts */}
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <GlassPanel title="Quotation value by rep" icon={BarChart3}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.valueByRep} layout="vertical" margin={{ left: 8, right: 16 }}>
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
                    {data.valueByRep.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Total quotation value attributed to each rep in the selected period.
              </p>
            </GlassPanel>

            <GlassPanel title="Discount distribution" icon={Percent} accent="amber">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.discountBuckets} margin={{ left: -18, right: 12 }}>
                  <CartesianGrid vertical={false} stroke="rgba(139,92,246,0.12)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#7c6f93' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#7c6f93' }} allowDecimals={false} />
                  <ReTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(139,92,246,0.2)', fontSize: 12 }}
                    formatter={(v) => [`${v} quotation(s)`, 'Count']}
                  />
                  <ReferenceLine
                    x="10–15%"
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{ value: 'Gold ceiling', fontSize: 9, fill: '#ef4444', position: 'top' }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {data.discountBuckets.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="mt-1 text-[11px] text-ink-muted">
                Effective order-level discount, with the Gold tier ceiling marked for reference.
              </p>
            </GlassPanel>

            <GlassPanel title="Approval funnel" icon={BarChart3} accent="indigo">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.funnel} margin={{ left: -18, right: 12 }}>
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
                <AreaChart data={data.revenueMix} margin={{ left: -12, right: 12 }}>
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
                {data.products.slice(0, 12).map((p) => {
                  const share = data.kpis.totalValue > 0 ? (p.value / data.kpis.totalValue) * 100 : 0;
                  const ceiling = categoryCeilings[p.category] ?? 100;
                  const overCeiling = p.avgDiscountPct > ceiling;

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
