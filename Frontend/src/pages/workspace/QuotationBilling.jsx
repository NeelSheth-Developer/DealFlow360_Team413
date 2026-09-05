import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Ban, CalendarClock, Info, Receipt, Repeat, ScrollText, Wallet } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { selectBillingView } from '@/store/selectors';
import { groupOccurrencesByMonth } from '@/lib/billingEngine';
import {
  cadenceLabel,
  cancellationRuleLabel,
  dateShort,
  money,
  moneyPrecise,
  prorationRuleLabel,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { GlassCard, GlassPanel } from '@/components/glass/Glass';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState, QtyStepper } from '@/components/ui/Misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/Table';
import { StageBadge } from '@/components/shared/Indicators';
import { QuoteNav } from '@/components/quotation/QuoteNav';
import { QuoteLoading } from '@/components/quotation/QuoteLoading';
import { useQuotation } from '@/hooks/useQuotation';

const OCC_TONE = {
  scheduled: 'neutral',
  invoiced: 'info',
  paid: 'success',
  refunded: 'warning',
  cancelled: 'danger',
};

/** Subscription and billing screen (spec B7). */
export default function QuotationBilling() {
  const { id } = useParams();

  const { quote, resolving, missing } = useQuotation(id);
  const view = useAppStore((s) => (quote ? selectBillingView(s, id) : null));
  const loadBilling = useAppStore((s) => s.loadBilling);
  const previewSubscriptionChange = useAppStore((s) => s.previewSubscriptionChange);
  const applySubscriptionChange = useAppStore((s) => s.applySubscriptionChange);
  const previewCancellation = useAppStore((s) => s.previewCancellation);
  const cancelSubscription = useAppStore((s) => s.cancelSubscription);

  const [changeTarget, setChangeTarget] = useState(null);
  const [changeQty, setChangeQty] = useState(1);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [proration, setProration] = useState(null);
  const [cancellation, setCancellation] = useState(null);
  const [busy, setBusy] = useState(false);

  // The view is a server payload now, so fetch it on entry.
  useEffect(() => {
    loadBilling(id);
  }, [id, loadBilling]);

  /**
   * Proration is priced by the server, so the preview is a request rather than a
   * calculation — it cannot happen during render.
   *
   * Debounced because the quantity stepper fires on every click, and each change is a
   * round trip. `cancelled` guards against an older reply landing after a newer one.
   */
  useEffect(() => {
    if (!changeTarget) {
      setProration(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await previewSubscriptionChange(id, changeTarget.line.id, changeQty);
      if (!cancelled) setProration(result.ok ? result.preview : null);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, changeTarget, changeQty, previewSubscriptionChange]);

  /** Same reasoning: the refund or credit amount is the server's to compute. */
  useEffect(() => {
    if (!cancelTarget) {
      setCancellation(null);
      return undefined;
    }

    let cancelled = false;
    previewCancellation(id, cancelTarget.line.id).then((result) => {
      if (!cancelled) setCancellation(result.ok ? result.preview : null);
    });

    return () => {
      cancelled = true;
    };
  }, [id, cancelTarget, previewCancellation]);

  if (resolving && !quote) return <QuoteLoading />;
  if (missing || !quote) return <Navigate to="/404" replace />;
  if (!view) return <QuoteLoading />;

  const openChange = (row) => {
    setChangeTarget(row);
    setChangeQty(row.line.qty);
  };

  const handleApplyChange = async () => {
    setBusy(true);
    const result = await applySubscriptionChange(id, changeTarget.line.id, changeQty);
    setBusy(false);
    setChangeTarget(null);

    if (!result.ok) {
      toast.error('Could not apply the change', { description: result.error });
      return;
    }
    // `explanation` is written by the server in plain language — show it as-is.
    toast.success('Subscription updated', { description: result.proration?.explanation });
  };

  const handleCancel = async () => {
    setBusy(true);
    const result = await cancelSubscription(id, cancelTarget.line.id);
    setBusy(false);
    setCancelTarget(null);

    if (!result.ok) {
      toast.error('Could not cancel', { description: result.error });
      return;
    }
    toast.success('Subscription cancelled', { description: cancellation?.explanation });
  };

  return (
    <div>
      <PageHeader
        title={`Billing — ${quote.customerName}`}
        description="One-time charges and recurring charges are tracked separately, on this same order."
        breadcrumbs={[
          { label: 'Quotations', to: '/app/quotations' },
          { label: quote.reference ?? quote.id, to: `/app/quotations/${quote.id}` },
          { label: 'Billing' },
        ]}
        badge={<StageBadge stage={quote.stage} />}
      />

      <QuoteNav quote={quote} hasInvoice={Boolean(view.invoice)} />

      {/* ------------------------------------------------- split summary */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <GlassCard className="border-l-4 border-l-brand-500 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            One-time charges
          </p>
          <p className="num mt-1.5 text-xl font-extrabold text-ink">
            {money(view.oneTimeTotal, view.currency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {view.oneTimeRows.length} line(s) · billed once
          </p>
        </GlassCard>

        <GlassCard className="border-l-4 border-l-accent-indigo p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Recurring per cycle
          </p>
          <p className="num mt-1.5 text-xl font-extrabold text-ink">
            {money(view.recurringPerCycleTotal, view.currency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">
            {view.recurringRows.filter((r) => !r.cancelled).length} active subscription(s)
          </p>
        </GlassCard>

        <GlassCard className="border-l-4 border-l-accent-pink p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Annual recurring value
          </p>
          <p className="num mt-1.5 text-xl font-extrabold text-ink">
            {money(view.annualRecurringTotal, view.currency)}
          </p>
          <p className="mt-1 text-[11px] text-ink-muted">normalised to 12 months</p>
        </GlassCard>
      </div>

      {/* ---------------------------------------------------- one-time */}
      <GlassPanel
        title="One-Time Charges"
        description="Invoiced once, on the order invoice."
        icon={Receipt}
        accent="brand"
        className="mb-4 border-l-4 border-l-brand-500"
        actions={
          view.invoice ? (
            <Link to={`/app/quotations/${id}/invoice`}>
              <Button size="sm" variant="secondary" icon={Wallet}>
                Go to Invoice
              </Button>
            </Link>
          ) : null
        }
        bodyClassName="px-0 py-0 sm:px-0"
      >
        {view.oneTimeRows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="No one-time charges"
            description="This order is entirely subscription-based."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH align="center">Qty</TH>
                <TH align="right">Unit price</TH>
                <TH align="right">Discount</TH>
                <TH align="right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {view.oneTimeRows.map(({ line, total }) => (
                <TR key={line.id}>
                  <TD className="font-semibold">{line.productName}</TD>
                  <TD align="center" num>
                    {line.qty}
                  </TD>
                  <TD align="right" num>
                    {money(line.unitPrice, view.currency)}
                  </TD>
                  <TD align="right" num className="text-ink-soft">
                    {line.discountPct}%
                  </TD>
                  <TD align="right" num className="font-bold">
                    {money(total, view.currency)}
                  </TD>
                </TR>
              ))}
            </TBody>
            <TFoot>
              <TR>
                <TD colSpan={4} className="text-xs font-bold">
                  Total billed once
                </TD>
                <TD align="right" num className="text-sm font-extrabold">
                  {money(view.oneTimeTotal, view.currency)}
                </TD>
              </TR>
            </TFoot>
          </Table>
        )}
      </GlassPanel>

      {/* --------------------------------------------------- recurring */}
      <GlassPanel
        title="Recurring Charges"
        description="Each subscription bills on its own cadence, independent of the one-time invoice."
        icon={Repeat}
        accent="indigo"
        className="mb-4 border-l-4 border-l-accent-indigo"
      >
        {view.recurringRows.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No subscriptions on this order"
            description="Add a subscription product in the builder to generate a billing schedule."
          />
        ) : (
          <div className="space-y-4">
            {view.recurringRows.map((row) => {
              const months = groupOccurrencesByMonth(row.occurrences);

              return (
                <article
                  key={row.line.id}
                  className={cn(
                    'rounded-xl border border-brand-500/12 bg-white/55 p-4',
                    row.cancelled && 'opacity-60',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-bold text-ink">
                        {row.line.productName}
                        {row.cancelled && (
                          <Badge tone="danger" size="xs">
                            Cancelled
                          </Badge>
                        )}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
                        <Badge tone="teal" size="xs">
                          {cadenceLabel(row.plan?.cadence)}
                        </Badge>
                        <span>{row.plan?.name}</span>
                        <span>·</span>
                        <span>{row.line.qty} × {money(row.line.unitPrice, view.currency)}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="num text-lg font-extrabold text-ink">
                        {money(row.perCycle, view.currency)}
                      </p>
                      <p className="text-[11px] text-ink-muted">
                        per {row.plan?.cadence?.replace('ly', '') ?? 'cycle'} ·{' '}
                        {money(row.annual, view.currency)}/yr
                      </p>
                    </div>
                  </div>

                  {/* plan rules */}
                  <dl className="mt-3 grid gap-2 rounded-lg bg-brand-500/6 p-2.5 sm:grid-cols-3">
                    <RuleItem label="Proration" value={prorationRuleLabel(row.plan?.prorationRule)} />
                    <RuleItem
                      label="Cancellation"
                      value={cancellationRuleLabel(row.plan?.cancellationRule)}
                    />
                    <RuleItem
                      label="Next billing"
                      value={row.nextBillingDate ? dateShort(row.nextBillingDate) : '—'}
                    />
                  </dl>

                  {/* schedule */}
                  {months.length > 0 && (
                    <div className="mt-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                        <CalendarClock className="h-3 w-3" aria-hidden="true" />
                        Upcoming schedule
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {row.occurrences.slice(0, 12).map((occ) => (
                          <li
                            key={occ.id}
                            className="rounded-lg border border-brand-500/12 bg-white/70 px-2 py-1.5"
                          >
                            <p className="num text-[10px] font-semibold text-ink-soft">
                              {dateShort(occ.date)}
                            </p>
                            <p className="num text-xs font-bold text-ink">
                              {money(occ.amount, view.currency)}
                            </p>
                            <Badge tone={OCC_TONE[occ.status]} size="xs" className="mt-0.5">
                              {occ.status}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {!row.cancelled && (
                    <div className="mt-3.5 flex flex-wrap gap-2 border-t border-brand-500/12 pt-3">
                      <Button size="xs" variant="secondary" onClick={() => openChange(row)}>
                        Change quantity
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={Ban}
                        className="text-state-danger hover:bg-state-danger/10"
                        onClick={() => setCancelTarget(row)}
                      >
                        Cancel subscription
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* ------------------------------------------- credit notes ledger */}
      <GlassPanel
        title="Credit notes & refunds"
        description="Generated automatically by proration and cancellation rules."
        icon={ScrollText}
        accent="pink"
      >
        {view.creditNotes.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nothing issued yet"
            description="Reducing a subscription quantity mid-cycle or cancelling one will create an entry here."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Reference</TH>
                <TH>Type</TH>
                <TH align="right">Amount</TH>
                <TH>Reason</TH>
                <TH align="right">Issued</TH>
              </TR>
            </THead>
            <TBody>
              {view.creditNotes.map((note) => (
                <TR key={note.id}>
                  <TD className="num font-bold text-brand-700">{note.id}</TD>
                  <TD>
                    <Badge tone={note.type === 'refund' ? 'warning' : 'info'} size="xs">
                      {note.type === 'refund' ? 'Refund' : 'Credit note'}
                    </Badge>
                  </TD>
                  <TD align="right" num className="font-bold">
                    {moneyPrecise(note.amount, view.currency)}
                  </TD>
                  <TD className="max-w-xs text-xs text-ink-soft">{note.reason}</TD>
                  <TD align="right" className="text-xs text-ink-muted">
                    {dateShort(note.createdAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </GlassPanel>

      {/* ------------------------------------------- change qty dialog */}
      <Dialog
        open={Boolean(changeTarget)}
        onOpenChange={(open) => !open && setChangeTarget(null)}
        title="Change subscription quantity"
        description={changeTarget?.line.productName}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setChangeTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleApplyChange}
              loading={busy}
              disabled={changeQty === changeTarget?.line.qty}
            >
              Apply change
            </Button>
          </>
        }
      >
        {changeTarget && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-white/60 p-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  Quantity
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Currently {changeTarget.line.qty}
                </p>
              </div>
              <QtyStepper value={changeQty} onChange={setChangeQty} min={0} max={999} />
            </div>

            {proration && (
              <div
                className={cn(
                  'rounded-xl border p-3.5',
                  proration.type === 'charge'
                    ? 'border-accent-amber/35 bg-accent-amber/10'
                    : proration.type === 'credit'
                      ? 'border-state-info/30 bg-state-info/10'
                      : 'border-brand-500/20 bg-brand-500/8',
                )}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  <Info className="h-3 w-3" aria-hidden="true" />
                  {prorationRuleLabel(proration.plan?.prorationRule)}
                </p>

                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {proration.explanation}
                </p>

                {proration.amountNow !== 0 && (
                  <p className="num mt-2.5 text-xl font-extrabold text-ink">
                    {proration.amountNow > 0 ? 'Charge now: ' : 'Credit: '}
                    {moneyPrecise(Math.abs(proration.amountNow), view.currency)}
                  </p>
                )}

                {proration.deferredAmount ? (
                  <p className="num mt-2 text-sm font-bold text-ink">
                    Next cycle adjustment:{' '}
                    {moneyPrecise(Math.abs(proration.deferredAmount), view.currency)}
                  </p>
                ) : null}

                <p className="mt-2 text-[11px] text-ink-muted">
                  Day {proration.daysUsed} of {proration.daysInCycle} · {proration.daysRemaining} days
                  remaining in the current cycle.
                </p>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ---------------------------------------------- cancel dialog */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel this subscription?"
        description={cancelTarget?.line.productName}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={handleCancel} loading={busy}>
              Cancel subscription
            </Button>
          </>
        }
      >
        {cancellation && (
          <div className="space-y-3">
            <div className="rounded-xl bg-white/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                Cancellation rule
              </p>
              <p className="mt-0.5 text-sm font-bold text-ink">
                {cancellationRuleLabel(cancellation.plan?.cancellationRule)}
              </p>
            </div>

            <div
              className={cn(
                'rounded-xl border p-3.5',
                cancellation.type
                  ? 'border-state-info/30 bg-state-info/10'
                  : 'border-brand-500/20 bg-brand-500/8',
              )}
            >
              <p className="text-sm leading-relaxed text-ink-soft">{cancellation.explanation}</p>
              {cancellation.amount > 0 && (
                <p className="num mt-2 text-xl font-extrabold text-ink">
                  {moneyPrecise(cancellation.amount, view.currency)}{' '}
                  <span className="text-xs font-semibold text-ink-muted">
                    as {cancellation.type === 'refund' ? 'a refund' : 'a credit note'}
                  </span>
                </p>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-ink-muted">
              All future scheduled occurrences will be cancelled. This is recorded in the audit trail
              and, where applicable, in the credit notes ledger.
            </p>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function RuleItem({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[11px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
