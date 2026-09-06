import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Kanban, List, Plus, RefreshCw, Search } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectQuotationRows } from '@/store/selectors';
import { useAllRisks } from '@/hooks/useRisk';
import { STAGES } from '@/lib/stageMachine';
import { money, percent, stageLabel } from '@/lib/format';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/Tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { EmptyState, Avatar } from '@/components/ui/Misc';
import { SkeletonTable } from '@/components/ui/Loading';
import { RiskBadge } from '@/components/shared/RiskGauge';
import { RelativeTime, StageBadge, StaleBadge, TierBadge } from '@/components/shared/Indicators';

/** Quotation list view (spec B2). */
export default function Quotations() {
  const navigate = useNavigate();
  const users = useAppStore((s) => s.users);
  const stallThreshold = useAppStore((s) => s.dashboardConfig.stallThresholdDays);
  const isLoading = useAppStore((s) => s.quotationsLoading);
  const loadError = useAppStore((s) => s.quotationsError);
  const loadQuotations = useAppStore((s) => s.loadQuotations);

  // One batched scoring request keeps every row's risk chip accurate.
  useAllRisks();

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [tier, setTier] = useState('');

  const filters = useMemo(
    () => ({ search, stage: stage || null, ownerId: ownerId || null, tier: tier || null }),
    [search, stage, ownerId, tier],
  );

  const rows = useAppStore((s) => selectQuotationRows(s, filters));

  const totalValue = rows.reduce((sum, r) => sum + r.totals.grandTotal, 0);

  return (
    <div>
      <PageHeader
        title="Quotations"
        // "0 quotation(s) · ₹0" is an answer, and the wrong one while the fetch is
        // still open. Say what is actually happening until there is something to count.
        description={
          isLoading && rows.length === 0
            ? 'Loading quotations…'
            : `${rows.length} quotation(s) · ${money(totalValue)} total pipeline value`
        }
        actions={
          <>
            <SegmentedControl
              value="list"
              onChange={(v) => v === 'kanban' && navigate('/app/pipeline')}
              options={[
                { value: 'list', label: 'List', icon: List },
                { value: 'kanban', label: 'Kanban', icon: Kanban },
              ]}
            />
            <Link to="/app/quotations/new">
              <Button icon={Plus}>New Quotation</Button>
            </Link>
          </>
        }
      />

      {/* ------------------------------------------------------- filters */}
      <GlassCard className="mb-4 p-3">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Search quote, customer or rep…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
            className="pl-9"
            aria-label="Search quotations"
          />
          <Select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder="All stages"
            aria-label="Filter by stage"
            options={STAGES.map((s) => ({ value: s, label: stageLabel(s) }))}
          />
          <Select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            placeholder="All reps"
            aria-label="Filter by rep"
            options={users
              .filter((u) => u.role === 'sales_rep')
              .map((u) => ({ value: u.id, label: u.name }))}
          />
          <Select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            placeholder="All tiers"
            aria-label="Filter by tier"
            options={[
              { value: 'bronze', label: 'Bronze' },
              { value: 'silver', label: 'Silver' },
              { value: 'gold', label: 'Gold' },
            ]}
          />
        </div>
      </GlassCard>

      {/* --------------------------------------------------------- table */}
      <GlassPanel title="All quotations" icon={FileText} bodyClassName="px-0 py-0 sm:px-0">
        {/*
          A pending fetch and a genuinely empty pipeline are different facts. Without
          this branch an in-flight GET /quotations rendered "No quotations match these
          filters", which reads as an answer rather than a request still running.
        */}
        {/* Shaped like the table it is replacing, so the panel keeps its height. */}
        {isLoading && rows.length === 0 ? (
          <SkeletonTable rows={8} columns={6} />
        ) : loadError && rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Couldn't load quotations"
            description={loadError}
            action={
              <Button icon={RefreshCw} size="sm" onClick={() => loadQuotations()}>
                Try again
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No quotations match these filters"
            description="Try clearing a filter, or start a new quotation."
            action={
              <Link to="/app/quotations/new">
                <Button icon={Plus} size="sm">
                  New Quotation
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
                <TH align="center">Lines</TH>
                <TH align="right">Total</TH>
                <TH align="right">Discount</TH>
                <TH align="center">Risk</TH>
                <TH>Stage</TH>
                <TH>Owner</TH>
                <TH align="right">Activity</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/app/quotations/${row.id}`)}
                >
                  <TD>
                    <span className="num font-bold text-brand-700">{row.reference}</span>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{row.customerName}</span>
                      <TierBadge tier={row.tier} showIcon={false} />
                    </div>
                  </TD>
                  <TD align="center" num>
                    {row.lines.length}
                  </TD>
                  <TD align="right" num>
                    {money(row.totals.grandTotal, row.currency)}
                  </TD>
                  <TD align="right" num className="text-ink-soft">
                    {percent(row.totals.effectiveDiscountPct)}
                  </TD>
                  <TD align="center">
                    <RiskBadge score={row.risk.score} />
                  </TD>
                  <TD>
                    <StageBadge stage={row.stage} />
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <Avatar name={row.ownerName} size="xs" />
                      <span className="text-xs text-ink-soft">{row.ownerName}</span>
                    </div>
                  </TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1.5">
                      <StaleBadge days={row.idleDays} threshold={stallThreshold} />
                      <RelativeTime value={row.lastActivityAt} className="text-ink-muted" />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </GlassPanel>
    </div>
  );
}
