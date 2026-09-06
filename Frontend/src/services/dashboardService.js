/**
 * Deal health and alerts — API-REFERENCE §17.1–17.4.
 *
 *   GET  /dashboard/deal-health        any staff
 *   GET  /dashboard/alerts             any staff · ?type=&severity=
 *   POST /dashboard/alerts/:id/nudge   MANAGER, ADMIN
 *   POST /dashboard/alerts/:id/escalate MANAGER, ADMIN
 *
 * ALERTS ARE COMPUTED ON READ from live data and the thresholds in §5.9 — they are not a
 * queue to keep in sync. Only the operator actions taken against one (nudged, escalated)
 * are persisted, because only those are facts rather than derivations. So there is no
 * "recompute alerts" endpoint and none is needed: re-fetching IS the recompute.
 *
 * Alert ids are SYNTHETIC AND STABLE — `stall-`, `disc-`, `slip-`, `appr-` plus the
 * quotation id. They are not database rows, so do not treat one as a durable key.
 *
 * `title` and `detail` are rendered VERBATIM; they are written as sentences a manager can
 * act on. Both raw numbers also travel in `meta` so the UI can explain itself rather
 * than just assert a problem.
 *
 * The four types and their thresholds:
 *   stalled              now − lastActivityAt > stallThresholdDays, in an open stage
 *   discount_anomaly     effective discount > THAT REP's rolling 90-day average ×
 *                        anomalySensitivity, baseline from CLOSED business only
 *   delivery_slippage    latest backorder ETA > promisedDeliveryDate
 *   approval_bottleneck  a pending step older than approvalSlaHours
 *
 * The anomaly rule compares each rep against their own baseline rather than a global
 * threshold: a naturally aggressive discounter would otherwise drown out the signal from
 * a conservative one and the alert would degrade into noise. The baseline excludes open
 * quotations so today's aggressive draft cannot raise the very average it is measured
 * against.
 */

import { api, buildQuery } from './apiClient';

export const ALERT_TYPES = [
  'stalled',
  'discount_anomaly',
  'delivery_slippage',
  'approval_bottleneck',
];
export const SEVERITIES = ['high', 'medium', 'low'];

/**
 * KPI tiles.
 *
 * @returns {Promise<Object>} activeCount, activeValue, stalledCount, anomalyCount,
 *   slippageCount, bottleneckCount, pendingApprovalCount, oldestPendingHours, winRate,
 *   avgCycleDays, avgDiscountPct, highSeverityCount, thresholds{...}
 */
export function fetchDealHealth() {
  return api.get('/dashboard/deal-health');
}

/** Sorted high severity first. */
export async function fetchAlerts({ type, severity } = {}) {
  const data = await api.get(`/dashboard/alerts${buildQuery({ type, severity })}`);
  return Array.isArray(data) ? data : [];
}

/** Notifies and emails the owning rep. Audited. @returns {{ok, repName}} */
export function nudgeRep(alertId) {
  return api.post(`/dashboard/alerts/${encodeURIComponent(alertId)}/nudge`);
}

/**
 * Notifies and emails every sales_manager, raises the alert to high, sets
 * `escalated: true`. Audited. @returns {{ok, escalated, notified}}
 */
export function escalateAlert(alertId) {
  return api.post(`/dashboard/alerts/${encodeURIComponent(alertId)}/escalate`);
}

/* --------------------------------------------------------------- presentation */

export const ALERT_TYPE_LABEL = {
  stalled: 'Stalled deal',
  discount_anomaly: 'Discount anomaly',
  delivery_slippage: 'Delivery slippage',
  approval_bottleneck: 'Approval bottleneck',
};

export const SEVERITY_META = {
  high: { label: 'High', tone: 'text-state-danger', bg: 'bg-state-danger/12', dot: 'bg-state-danger' },
  medium: { label: 'Medium', tone: 'text-accent-amber', bg: 'bg-accent-amber/14', dot: 'bg-accent-amber' },
  low: { label: 'Low', tone: 'text-state-info', bg: 'bg-state-info/12', dot: 'bg-state-info' },
};

/**
 * Which screen an alert should open.
 *
 * Lives on this side for the same reason `notificationRoute` does: the server sends the
 * alert type and the quotation id, never a URL, so a routing change here must not need a
 * backend deploy.
 */
export function alertTargetRoute(alert) {
  switch (alert?.type) {
    case 'approval_bottleneck':
      return `/app/quotations/${alert.quotationId}/approval`;
    case 'delivery_slippage':
      return `/app/quotations/${alert.quotationId}/fulfillment`;
    default:
      return `/app/quotations/${alert?.quotationId}`;
  }
}
