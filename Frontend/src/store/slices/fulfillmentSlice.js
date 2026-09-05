import { nowISO } from '@/lib/utils';
import {
  backordersFor,
  canConsolidate,
  consolidationSaving,
  shipmentMetrics,
  suggestWarehouseSplit,
  validateOverride,
} from '@/lib/warehouseSplit';

/**
 * Multi-warehouse fulfillment (spec B6). Plans are cached per quotation but
 * always recomputed from live stock when the fulfillment screen is opened or
 * when stock changes, so a plan can never quietly go stale.
 */
export function createFulfillmentSlice(set, get) {
  return {
    /** Recompute the suggested split from current stock. */
    computeFulfillment(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return null;

      const existing = get().fulfillmentPlans[quoteId];
      // A manually overridden, already-accepted plan is preserved — the rep's
      // decision shouldn't be silently thrown away by a recompute.
      if (existing?.isOverride && existing?.acceptedAt) return existing;

      const plan = { ...suggestWarehouseSplit(quote.lines, get().warehouses), quotationId: quoteId };
      set((state) => ({ fulfillmentPlans: { ...state.fulfillmentPlans, [quoteId]: plan } }));
      return plan;
    },

    /** Rebuild plans for every quotation that has one, plus active stages. */
    refreshFulfillmentPlans() {
      const state = get();
      const targets = state.quotations.filter(
        (q) =>
          ['approved', 'fulfillment', 'billed', 'confirmed'].includes(q.stage) ||
          state.fulfillmentPlans[q.id],
      );

      const plans = { ...state.fulfillmentPlans };
      for (const q of targets) {
        const existing = plans[q.id];
        if (existing?.isOverride && existing?.acceptedAt) continue;
        plans[q.id] = { ...suggestWarehouseSplit(q.lines, state.warehouses), quotationId: q.id };
      }
      set({ fulfillmentPlans: plans });
    },

    getFulfillmentPlan(quoteId) {
      return get().fulfillmentPlans[quoteId] ?? null;
    },

    acceptSplit(quoteId) {
      const quote = get().getQuotation(quoteId);
      const plan = get().fulfillmentPlans[quoteId] ?? get().computeFulfillment(quoteId);
      if (!quote || !plan) return { ok: false, error: 'No fulfillment plan available.' };

      const accepted = { ...plan, acceptedAt: nowISO(), isOverride: false };
      set((state) => ({ fulfillmentPlans: { ...state.fulfillmentPlans, [quoteId]: accepted } }));

      if (quote.stage === 'approved') get().moveStage(quoteId, 'fulfillment');

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Fulfillment split accepted — ${accepted.shipmentCount} shipment(s)${
          accepted.backorders.length ? `, ${accepted.backorders.reduce((s, b) => s + b.qty, 0)} unit(s) on backorder` : ''
        }`,
        meta: {
          shipments: accepted.shipmentCount,
          cost: accepted.estimatedCost,
          backorderQty: accepted.backorders.reduce((s, b) => s + b.qty, 0),
        },
      });

      get().recomputeAlerts();
      return { ok: true, plan: accepted };
    },

    /** Validate then persist a manual override. */
    saveOverride(quoteId, allocations) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };

      const cleaned = allocations.filter((a) => Number(a.qty) > 0);
      const errors = validateOverride(cleaned, quote.lines, get().warehouses);
      if (errors.length) return { ok: false, errors };

      const suggested = suggestWarehouseSplit(quote.lines, get().warehouses);
      const plan = {
        quotationId: quoteId,
        allocations: cleaned,
        backorders: backordersFor(cleaned, quote.lines, get().warehouses),
        ...shipmentMetrics(cleaned, get().warehouses),
        isOverride: true,
        acceptedAt: nowISO(),
      };

      set((state) => ({ fulfillmentPlans: { ...state.fulfillmentPlans, [quoteId]: plan } }));

      if (quote.stage === 'approved') get().moveStage(quoteId, 'fulfillment');

      const delta = plan.estimatedCost - suggested.estimatedCost;
      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Fulfillment split manually overridden — ${plan.shipmentCount} shipment(s)`,
        meta: {
          shipments: plan.shipmentCount,
          cost: plan.estimatedCost,
          costDeltaVsSuggestion: Math.round(delta * 100) / 100,
        },
      });

      get().recomputeAlerts();
      return { ok: true, plan, costDelta: delta };
    },

    /** Suggested allocation set used to seed / reset the override editor. */
    suggestionFor(quoteId) {
      const quote = get().getQuotation(quoteId);
      if (!quote) return null;
      return suggestWarehouseSplit(quote.lines, get().warehouses);
    },

    /** Can an open backorder now be filled from current stock? */
    canConsolidateBackorder(quoteId) {
      const quote = get().getQuotation(quoteId);
      const plan = get().fulfillmentPlans[quoteId];
      if (!quote || !plan) return false;
      return canConsolidate(plan, quote.lines, get().warehouses);
    },

    /** Merge the remaining backorder into the plan, reporting the saving. */
    consolidateBackorder(quoteId) {
      const quote = get().getQuotation(quoteId);
      const current = get().fulfillmentPlans[quoteId];
      if (!quote || !current) return { ok: false, error: 'No plan to consolidate.' };

      const fresh = { ...suggestWarehouseSplit(quote.lines, get().warehouses), quotationId: quoteId };
      const saving = consolidationSaving(current, fresh);

      const consolidated = { ...fresh, acceptedAt: nowISO(), isOverride: false };
      set((state) => ({ fulfillmentPlans: { ...state.fulfillmentPlans, [quoteId]: consolidated } }));

      get().logAudit({
        entityType: 'quotation',
        entityId: quoteId,
        action: `Remaining backorder consolidated — ${consolidated.shipmentCount} shipment(s)`,
        meta: saving,
      });

      get().recomputeAlerts();
      return { ok: true, plan: consolidated, saving };
    },

    /**
     * Called after any stock change. Refreshes plans and surfaces which
     * quotations just became consolidatable so the UI can raise the prompt.
     */
    afterStockChange() {
      const before = get().quotations
        .filter((q) => ['approved', 'fulfillment'].includes(q.stage))
        .filter((q) => (get().fulfillmentPlans[q.id]?.backorders ?? []).length > 0)
        .map((q) => q.id);

      get().refreshFulfillmentPlans();

      const consolidatable = before.filter((id) => get().canConsolidateBackorder(id));
      set({ consolidationCandidates: consolidatable });
      get().recomputeAlerts();
      return consolidatable;
    },

    dismissConsolidationPrompt(quoteId) {
      set((state) => ({
        consolidationCandidates: state.consolidationCandidates.filter((id) => id !== quoteId),
      }));
    },
  };
}
