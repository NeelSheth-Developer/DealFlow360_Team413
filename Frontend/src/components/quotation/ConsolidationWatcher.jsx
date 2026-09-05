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
 * Lives in the workspace shell rather than the fulfillment screen because stock
 * can arrive while the user is anywhere in the app — for example right after
 * hitting "Simulate Restock" in the warehouse config screen.
 */
export function ConsolidationWatcher() {
  const navigate = useNavigate();
  const candidates = useAppStore((s) => s.consolidationCandidates);
  const quotations = useAppStore((s) => s.quotations);
  const plans = useAppStore((s) => s.fulfillmentPlans);
  const warehouses = useAppStore((s) => s.warehouses);
  const consolidateBackorder = useAppStore((s) => s.consolidateBackorder);
  const dismissConsolidationPrompt = useAppStore((s) => s.dismissConsolidationPrompt);
  const suggestionFor = useAppStore((s) => s.suggestionFor);

  const quoteId = candidates[0] ?? null;
  const quote = quoteId ? quotations.find((q) => q.id === quoteId) : null;
  const current = quoteId ? plans[quoteId] : null;

  if (!quote || !current) return null;

  const fresh = suggestionFor(quoteId);
  const shipmentsSaved = current.shipmentCount - (fresh?.shipmentCount ?? current.shipmentCount);
  const costSaved = current.estimatedCost - (fresh?.estimatedCost ?? current.estimatedCost);
  const backorderQty = current.backorders.reduce((s, b) => s + b.qty, 0);

  const handleConsolidate = () => {
    const result = consolidateBackorder(quoteId);
    dismissConsolidationPrompt(quoteId);
    if (result.ok) {
      toast.success('Backorder consolidated', {
        description: `${quote.id} now ships in ${result.plan.shipmentCount} shipment(s).`,
      });
      navigate(`/app/quotations/${quoteId}/fulfillment`);
    } else {
      toast.error(result.error ?? 'Could not consolidate.');
    }
  };

  return (
    <Dialog
      open
      onOpenChange={() => dismissConsolidationPrompt(quoteId)}
      title="Consolidate remaining backorder?"
      description={`Stock just arrived that covers the open backorder on ${quote.id}.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => dismissConsolidationPrompt(quoteId)}>
            Keep as is
          </Button>
          <Button icon={PackageCheck} onClick={handleConsolidate}>
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
              Shipments
            </dt>
            <dd className="num mt-1 text-lg font-extrabold text-ink">
              {current.shipmentCount} → {fresh?.shipmentCount ?? current.shipmentCount}
            </dd>
            {shipmentsSaved > 0 && (
              <p className="mt-0.5 text-[11px] font-semibold text-state-success">
                {shipmentsSaved} fewer
              </p>
            )}
          </div>
          <div className="glass-inset p-3">
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              Shipping cost
            </dt>
            <dd className="num mt-1 text-lg font-extrabold text-ink">
              {money(fresh?.estimatedCost ?? current.estimatedCost, quote.currency)}
            </dd>
            {costSaved > 0 && (
              <p className="mt-0.5 text-[11px] font-semibold text-state-success">
                saves {money(costSaved, quote.currency)}
              </p>
            )}
          </div>
        </dl>

        <p className="text-[11px] leading-relaxed text-ink-muted">
          Warehouses in the new plan:{' '}
          {(fresh?.warehousesUsed ?? [])
            .map((id) => warehouses.find((w) => w.id === id)?.name ?? id)
            .join(', ') || '—'}
        </p>
      </div>
    </Dialog>
  );
}
