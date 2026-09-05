import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CheckCircle2,
  PackageCheck,
  PackageX,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Truck,
  Zap,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { splitByLine, validateOverride } from '@/lib/warehouseSplit';
import { dateShort, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StageBadge } from '@/components/shared/Indicators';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import {
  SplitOverrideEditor,
  WarehouseSplitTable,
} from '@/components/quotation/WarehouseSplitTable';

/** Fulfillment and warehouse split (spec B6). */
export default function QuotationFulfillment() {
  const { id } = useParams();
  const navigate = useNavigate();

  const quote = useAppStore((s) => s.quotations.find((q) => q.id === id));
  const warehouses = useAppStore((s) => s.warehouses);
  const plan = useAppStore((s) => s.fulfillmentPlans[id]);
  const invoice = useAppStore((s) => s.invoices.find((i) => i.quotationId === id));

  const computeFulfillment = useAppStore((s) => s.computeFulfillment);
  const acceptSplit = useAppStore((s) => s.acceptSplit);
  const saveOverride = useAppStore((s) => s.saveOverride);
  const suggestionFor = useAppStore((s) => s.suggestionFor);
  const simulateRestock = useAppStore((s) => s.simulateRestock);
  const buildBilling = useAppStore((s) => s.buildBilling);
  const moveStage = useAppStore((s) => s.moveStage);

  const [overrideMode, setOverrideMode] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const shippableLines = useMemo(
    () => (quote?.lines ?? []).filter((l) => !l.isSubscription && l.category !== 'service'),
    [quote],
  );

  if (!quote) return <Navigate to="/404" replace />;

  const activePlan = plan ?? computeFulfillment(id);
  const suggestion = suggestionFor(id);
  const rows = splitByLine(activePlan, quote.lines, warehouses);

  const backorderQty = (activePlan?.backorders ?? []).reduce((s, b) => s + b.qty, 0);
  const costDelta = (activePlan?.estimatedCost ?? 0) - (suggestion?.estimatedCost ?? 0);

  const draftAllocations = Object.entries(draft)
    .map(([key, qty]) => {
      const [lineId, warehouseId] = key.split(':');
      return { lineId, warehouseId, qty: Number(qty) || 0 };
    })
    .filter((a) => a.qty > 0);

  const overrideErrors = overrideMode
    ? validateOverride(draftAllocations, quote.lines, warehouses)
    : [];

  const enterOverride = () => {
    const seeded = {};
    for (const a of activePlan?.allocations ?? []) {
      seeded[`${a.lineId}:${a.warehouseId}`] = a.qty;
    }
    setDraft(seeded);
    setOverrideMode(true);
  };

  const resetToSuggestion = () => {
    const seeded = {};
    for (const a of suggestion?.allocations ?? []) {
      seeded[`${a.lineId}:${a.warehouseId}`] = a.qty;
    }
    setDraft(seeded);
    toast.info('Reset to the suggested split');
  };

  const handleAccept = async () => {
    setBusy(true);
    const result = acceptSplit(id);
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success('Split accepted', {
      description: `${result.plan.shipmentCount} shipment(s) · ${money(result.plan.estimatedCost, quote.currency)} shipping.`,
    });
  };

  const handleSaveOverride = () => {
    setBusy(true);
    const result = saveOverride(id, draftAllocations);
    setBusy(false);

    if (!result.ok) {
      toast.error('Fix the highlighted allocations first');
      return;
    }
    setOverrideMode(false);
    toast.success('Manual override saved', {
      description:
        result.costDelta === 0
          ? 'Same shipping cost as the suggestion.'
          : `${result.costDelta > 0 ? '+' : ''}${money(result.costDelta, quote.currency)} vs the suggested split.`,
    });
  };

  const handleRestock = () => {
    // Restocking the warehouse with the deepest shortfall is the most useful
    // demo action — it is what makes the consolidation prompt appear.
    const target = warehouses.find((w) =>
      Object.entries(w.stock).some(([, qty]) => qty <= w.replenishThreshold),
    );
    if (!target) {
      toast.info('Nothing is below its replenishment threshold right now.');
      return;
    }
    const result = simulateRestock(target.id);
    toast.success(`Stock arrived at ${result.warehouseName}`, {
      description: `${result.restocked} product(s) replenished. Any open backorder can now be consolidated.`,
    });
  };

  const handleProceedToBilling = () => {
    buildBilling(id);
    if (quote.stage === 'fulfillment') moveStage(id, 'billed');
    navigate(`/app/quotations/${id}/invoice`);
  };

  return (
    <div>
      <PageHeader
        title={`Fulfillment — ${quote.customerName}`}
        description="Allocation minimises shipment count first, then shipping cost. Override any line if you know better."
        breadcrumbs={[
          { label: 'Quotations', to: '/app/quotations' },
          { label: quote.id, to: `/app/quotations/${quote.id}` },
          { label: 'Fulfillment' },
        ]}
        badge={<StageBadge stage={quote.stage} />}
        actions={
          <Button variant="ghost" size="sm" icon={Zap} onClick={handleRestock}>
            Simulate Restock
          </Button>
        }
      />

      <QuoteNav quote={quote} hasInvoice={Boolean(invoice)} />

      {/* ------------------------------------------------------ summary */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile
          label="Shipments"
          value={activePlan?.shipmentCount ?? 0}
          hint={`${(activePlan?.warehousesUsed ?? []).length} warehouse(s) involved`}
          icon={Truck}
        />
        <SummaryTile
          label="Shipping cost"
          value={money(activePlan?.estimatedCost ?? 0, quote.currency)}
          hint={
            costDelta === 0
              ? 'matches the suggestion'
              : `${costDelta > 0 ? '+' : ''}${money(costDelta, quote.currency)} vs suggested`
          }
          tone={costDelta > 0 ? 'text-accent-amber' : undefined}
          icon={PackageCheck}
        />
        <SummaryTile
          label="Units on backorder"
          value={backorderQty}
          hint={backorderQty > 0 ? 'ETA shown per line below' : 'everything in stock'}
          tone={backorderQty > 0 ? 'text-state-danger' : 'text-state-success'}
          icon={PackageX}
        />
        <SummaryTile
          label="Plan type"
          value={activePlan?.isOverride ? 'Manual' : 'Suggested'}
          hint={activePlan?.acceptedAt ? `accepted ${dateShort(activePlan.acceptedAt)}` : 'not yet accepted'}
          icon={SlidersHorizontal}
        />
      </div>

      {/* ----------------------------------------------------- the split */}
      <GlassPanel
        title={overrideMode ? 'Manual override' : 'Suggested split'}
        description={
          overrideMode
            ? 'Every cell is validated against live stock. Shipment count and cost recalculate as you type.'
            : 'Generated from current stock levels, shipping weights and shipment-count minimisation.'
        }
        icon={Truck}
        accent={overrideMode ? 'amber' : 'brand'}
        className="mb-4"
        actions={
          activePlan?.isOverride && !overrideMode ? (
            <Badge tone="warning" size="xs">
              Manually overridden
            </Badge>
          ) : null
        }
      >
        {overrideMode ? (
          <>
            <SplitOverrideEditor
              lines={shippableLines}
              warehouses={warehouses}
              draft={draft}
              errors={overrideErrors}
              onChange={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            />

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-500/12 pt-4">
              <Button
                icon={Save}
                loading={busy}
                disabled={overrideErrors.length > 0}
                onClick={handleSaveOverride}
              >
                Save Override
              </Button>
              <Button variant="secondary" icon={RotateCcw} onClick={resetToSuggestion}>
                Reset to suggestion
              </Button>
              <Button variant="ghost" onClick={() => setOverrideMode(false)}>
                Cancel
              </Button>

              {overrideErrors.length > 0 && (
                <span className="text-[11px] font-semibold text-state-danger">
                  {overrideErrors.length} problem(s) to fix before saving
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <WarehouseSplitTable rows={rows} warehouses={warehouses} currency={quote.currency} />

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-500/12 pt-4">
              <Button icon={CheckCircle2} loading={busy} onClick={handleAccept}>
                Accept Suggested Split
              </Button>
              <Button variant="outline" icon={SlidersHorizontal} onClick={enterOverride}>
                Manual Override
              </Button>

              {['fulfillment', 'billed'].includes(quote.stage) && (
                <Button variant="ghost" className="ml-auto" onClick={handleProceedToBilling}>
                  Continue to invoice →
                </Button>
              )}
            </div>
          </>
        )}
      </GlassPanel>

      {/* --------------------------------------------------- backorders */}
      {backorderQty > 0 && (
        <GlassPanel
          title="Backorder decisions"
          description="Stock is short. Choose how to handle the remainder."
          icon={PackageX}
          accent="danger"
        >
          <ul className="space-y-2">
            {activePlan.backorders.map((b) => (
              <li
                key={b.lineId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-state-danger/6 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-ink">{b.productName}</p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {b.qty} unit(s) short
                    {b.etaDate && ` · expected ${dateShort(b.etaDate)}`}
                  </p>
                </div>
                <Badge tone="danger" size="xs">
                  Backordered
                </Badge>
              </li>
            ))}
          </ul>

          <div className="mt-3.5 grid gap-2 sm:grid-cols-2">
            <Button
              variant="secondary"
              onClick={() =>
                toast.success('Partial dispatch selected', {
                  description: 'Available stock ships now, the remainder follows when it arrives.',
                })
              }
            >
              Ship available now, backorder rest
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                toast.success('Order held', {
                  description: 'Nothing dispatches until the full quantity is available.',
                })
              }
            >
              Hold entire order until complete
            </Button>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
            Use <span className="font-semibold">Simulate Restock</span> above to bring stock in — a
            consolidation prompt appears automatically once the backorder can be filled.
          </p>
        </GlassPanel>
      )}
    </div>
  );
}

function SummaryTile({ label, value, hint, icon: Icon, tone }) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
        {Icon && (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-600">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className={cn('num mt-2 text-xl font-extrabold tracking-tight text-ink', tone)}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>}
    </GlassCard>
  );
}
