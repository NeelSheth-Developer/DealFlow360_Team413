import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '@/store/useAppStore';
import { money } from '@/lib/format';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

/**
 * Raises the "Consolidate Remaining Backorder" prompt.
 *
 * Lives in the workspace shell rather than the fulfillment screen because stock can
 * arrive while the user is anywhere in the app — for instance right after a restock in
 * the warehouse screen, which is what puts a quotation id in `consolidationCandidates`.
 *
 * THERE IS NO BEFORE/AFTER PREVIEW ANY MORE. It used to compare the saved plan against a
 * locally recomputed one and claim "2 fewer shipments, saves ₹1,200". Both halves of that
 * comparison are now the same server payload, and only the server can produce the second
 * one: it excludes units already promised to other quotations, which the browser cannot
 * see. So the dialog states what is true before the call — the backorder exists and can
 * now be filled — and reports the real numbers from the response afterwards.
 */
export function ConsolidationWatcher() {
  const navigate = useNavigate();
  const candidates = useAppStore((s) => s.consolidationCandidates);
  const quotations = useAppStore((s) => s.quotations);
  const plans = useAppStore((s) => s.fulfillmentPlans);
  const warehouses = useAppStore((s) => s.warehouses);
  const consolidateBackorder = useAppStore((s) => s.consolidateBackorder);
  const dismissConsolidationPrompt = useAppStore((s) => s.dismissConsolidationPrompt);

  const [busy, setBusy] = useState(false);

  const quoteId = candidates[0] ?? null;
  const quote = quoteId ? quotations.find((q) => q.id === quoteId) : null;
  const plan = quoteId ? plans[quoteId] : null;

  if (!quote || !plan) return null;

  const backorders = plan.backorders ?? [];
  const backorderQty = backorders.reduce((sum, b) => sum + (b.qty ?? 0), 0);
  const warehouseNames = (plan.warehousesUsed ?? [])
    .map((id) => warehouses.find((w) => w.id === id)?.name ?? id)
    .join(', ');

  const handleConsolidate = async () => {
    setBusy(true);
    const result = await consolidateBackorder(quoteId);
    setBusy(false);
    dismissConsolidationPrompt(quoteId);

    if (!result.ok) {
      toast.error(result.error ?? 'Could not consolidate.');
      return;
    }

    // `saving` is the server's own figure for what merging actually avoided, and it is
    // an OBJECT — { shipmentsSaved, costSaved } — not a number. Passing it straight to
    // `money()` rendered the amount from an object rather than the figure inside it.
    const shipments = result.plan?.shipmentCount;
    const costSaved = Number(result.saving?.costSaved) || 0;
    const shipmentsSaved = Number(result.saving?.shipmentsSaved) || 0;

    toast.success('Backorder consolidated', {
      description: [
        shipments ? `${quote.reference} now ships in ${shipments} shipment(s).` : null,
        shipmentsSaved > 0 ? `${shipmentsSaved} fewer shipment(s).` : null,
        costSaved > 0 ? `Saves ${money(costSaved, quote.currency)} in shipping.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    });
    navigate(`/app/quotations/${quoteId}/fulfillment`);
  };

  return (
    <Dialog
      open
      onOpenChange={() => dismissConsolidationPrompt(quoteId)}
      title="Consolidate remaining backorder?"
      description={`Stock just arrived that covers the open backorder on ${quote.reference}.`}
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => dismissConsolidationPrompt(quoteId)}
          >
            Keep as is
          </Button>
          <Button icon={PackageCheck} loading={busy} onClick={handleConsolidate}>
            Consolidate shipments
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          <span className="font-semibold text-ink">{quote.customerName}</span> has{' '}
          <span className="font-semibold text-ink">{backorderQty} unit(s)</span> on backorder. The
          network can now fulfil them, so the remaining shipment can be merged instead of going out
          separately.
        </p>

        <dl className="grid grid-cols-2 gap-2">
          <div className="glass-inset p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Shipments today
            </dt>
            <dd className="num mt-1 text-lg font-extrabold text-ink">{plan.shipmentCount}</dd>
            <p className="mt-0.5 text-[11px] text-ink-muted">plus the backorder</p>
          </div>
          <div className="glass-inset p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Shipping cost
            </dt>
            <dd className="num mt-1 text-lg font-extrabold text-ink">
              {money(plan.estimatedCost, quote.currency)}
            </dd>
            <p className="mt-0.5 text-[11px] text-ink-muted">re-priced on confirm</p>
          </div>
        </dl>

        <p className="text-[11px] leading-relaxed text-ink-muted">
          Currently shipping from: {warehouseNames || '—'}. The merged plan is worked out
          server-side, against stock that has not been promised to another order.
        </p>
      </div>
    </Dialog>
  );
}
