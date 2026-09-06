import * as dashboardApi from '@/services/dashboardService';

/**
 * Deal health and alerts — API-REFERENCE §17.1–17.4.
 *
 * THERE IS NO `recomputeAlerts()` ANY MORE. Alerts are computed by the server on every
 * read from live data and the stored thresholds, so re-fetching IS the recompute. A
 * client-side detector would need each rep's rolling 90-day discount baseline across
 * CLOSED business, plus units promised to other quotations for delivery slippage —
 * neither of which the browser holds. It would produce a different set of alerts to the
 * one the audit trail and the emails are based on.
 *
 * Alert ids are synthetic and stable (`stall-`, `disc-`, `slip-`, `appr-` + the
 * quotation id) rather than database rows, so an id is only meaningful until the next
 * fetch. `nudgeRep` and `escalateAlert` are the only persisted facts here, because they
 * are actions someone took rather than a derivation.
 *
 * `reloadData()` used to live here as well. It now lives in `useAppStore` — one copy,
 * defined after the slices are spread, so this file no longer shadows it.
 */
export function createDashboardSlice(set, get) {
  return {
    /** KPI tiles. Any staff role. */
    async loadDealHealth() {
      set({ dealHealthLoading: true, dashboardError: null });
      try {
        const dealHealth = await dashboardApi.fetchDealHealth();
        set({ dealHealth, dealHealthLoading: false });
        return { ok: true, dealHealth };
      } catch (error) {
        set({ dealHealthLoading: false, dashboardError: error.message });
        return { ok: false, error: error.message };
      }
    },

    /**
     * The alert feed. Filtering happens server-side so the counts on the tiles and the
     * rows in the feed come from the same pass over the data.
     */
    async loadAlerts({ type = null, severity = null } = {}) {
      set({ alertsLoading: true, dashboardError: null });
      try {
        const alerts = await dashboardApi.fetchAlerts({
          type: type || undefined,
          severity: severity || undefined,
        });
        set({ alerts, alertsLoading: false });
        return { ok: true, alerts };
      } catch (error) {
        set({ alertsLoading: false, dashboardError: error.message });
        return { ok: false, error: error.message, alerts: [] };
      }
    },

    /** Cache read. Null once the feed has been re-fetched and the alert has cleared. */
    getAlert(alertId) {
      return get().alerts.find((a) => a.id === alertId) ?? null;
    },

    /**
     * Notifies and emails the owning rep. Manager and admin only.
     *
     * The server resolves the rep from the alert, so no owner id is sent — the browser's
     * copy of the quotation may be several minutes stale after a reassignment.
     */
    async nudgeRep(alertId) {
      try {
        const result = await dashboardApi.nudgeRep(alertId);
        return { ok: true, repName: result?.repName ?? null };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },

    /**
     * Notifies and emails every sales_manager and raises the alert to high severity so
     * it stays at the top of the feed. Manager and admin only.
     */
    async escalateAlert(alertId) {
      try {
        const result = await dashboardApi.escalateAlert(alertId);
        // The server persists `escalated` and the raised severity, so reflect them
        // locally rather than waiting for the next poll.
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === alertId ? { ...a, severity: 'high', escalated: true } : a,
          ),
        }));
        return { ok: true, notified: result?.notified ?? 0 };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code };
      }
    },
  };
}
