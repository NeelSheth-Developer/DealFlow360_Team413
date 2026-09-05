import { detectAnomalies } from '@/lib/anomalyEngine';
import { sleep } from '@/lib/utils';

/** Deal health alerts, nudges and escalations (spec B9). */
export function createDashboardSlice(set, get) {
  return {
    recomputeAlerts() {
      const state = get();
      const alerts = detectAnomalies({
        quotations: state.quotations,
        users: state.users,
        fulfillmentPlans: state.fulfillmentPlans,
        config: state.dashboardConfig,
      });
      set({ alerts });
      return alerts;
    },

    getAlert(alertId) {
      return get().alerts.find((a) => a.id === alertId) ?? null;
    },

    nudgeRep(alertId) {
      const alert = get().getAlert(alertId);
      if (!alert) return { ok: false, error: 'Alert no longer active.' };

      const quote = get().getQuotation(alert.quotationId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };

      get().notify({
        userId: quote.ownerId,
        type: 'nudge',
        title: `Nudge on ${quote.id} — ${quote.customerName}`,
        body: alert.title,
        link: `/app/quotations/${quote.id}`,
      });

      get().logAudit({
        entityType: 'quotation',
        entityId: quote.id,
        action: `Rep nudged about: ${alert.title}`,
        meta: { alertType: alert.type, severity: alert.severity },
      });

      return { ok: true, repName: quote.ownerName };
    },

    escalateAlert(alertId) {
      const alert = get().getAlert(alertId);
      if (!alert) return { ok: false, error: 'Alert no longer active.' };

      const quote = get().getQuotation(alert.quotationId);
      if (!quote) return { ok: false, error: 'Quotation not found.' };

      get().notifyRole({
        role: 'sales_manager',
        type: 'escalation',
        title: `Escalated: ${quote.id} — ${quote.customerName}`,
        body: `${alert.title}. ${alert.detail}`,
        link: `/app/quotations/${quote.id}`,
      });

      get().logAudit({
        entityType: 'quotation',
        entityId: quote.id,
        action: `Escalated to Sales Manager: ${alert.title}`,
        meta: { alertType: alert.type, severity: alert.severity },
      });

      // Raising severity keeps it at the top of the feed until someone acts.
      set((state) => ({
        alerts: state.alerts.map((a) => (a.id === alertId ? { ...a, severity: 'high', escalated: true } : a)),
      }));

      return { ok: true };
    },

    /**
     * "Reload Data" in the workspace nav. With no backend there is nothing to
     * fetch, but there is genuine work to do: every derived value is recomputed
     * against current configuration, which matters after editing ceilings,
     * stock levels or upsell rules in the backend area.
     */
    async reloadData() {
      set({ isReloading: true });
      await sleep(600);
      get().refreshFulfillmentPlans();
      for (const quote of get().quotations) {
        if (['fulfillment', 'billed', 'confirmed'].includes(quote.stage)) {
          get().buildBilling(quote.id);
        }
      }
      const alerts = get().recomputeAlerts();
      set({ isReloading: false, lastReloadedAt: new Date().toISOString() });
      return { alerts: alerts.length };
    },
  };
}
