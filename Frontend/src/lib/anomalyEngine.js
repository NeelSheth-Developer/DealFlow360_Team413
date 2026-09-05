import { differenceInDays, differenceInHours } from 'date-fns';
import { quoteTotals } from './pricing';
import { currentPendingStep } from './riskEngine';
import { OPEN_STAGES } from './stageMachine';
import { roleLabel } from './format';
import { mean, round2 } from './utils';

/**
 * Deal health and anomaly detection. Runs on boot, after any quotation
 * mutation, and on "Reload Data". Every alert carries the numbers behind it so
 * the dashboard can explain itself rather than just asserting a problem.
 */

export const DEFAULT_DASHBOARD_CONFIG = {
  stallThresholdDays: 5,
  anomalySensitivity: 1.8,
  approvalSlaHours: 24,
};

/** Rolling 90-day average effective discount per rep. */
export function repDiscountAverages(quotations = [], users = []) {
  const now = new Date();
  const averages = {};
  for (const u of users) {
    const theirs = quotations.filter(
      (q) => q.ownerId === u.id && differenceInDays(now, new Date(q.createdAt)) <= 90,
    );
    averages[u.id] = round2(mean(theirs, (q) => quoteTotals(q).effectiveDiscountPct));
  }
  return averages;
}

export function detectAnomalies({
  quotations = [],
  users = [],
  fulfillmentPlans = {},
  config = DEFAULT_DASHBOARD_CONFIG,
}) {
  const alerts = [];
  const now = new Date();
  const repAvg = repDiscountAverages(quotations, users);

  for (const q of quotations) {
    const idle = differenceInDays(now, new Date(q.lastActivityAt));

    // --- Stalled deals
    if (OPEN_STAGES.includes(q.stage) && idle > config.stallThresholdDays) {
      const ratio = idle / config.stallThresholdDays;
      alerts.push({
        id: `stall-${q.id}`,
        type: 'stalled',
        quotationId: q.id,
        severity: ratio >= 3 ? 'high' : ratio >= 2 ? 'medium' : 'low',
        title: `${q.customerName} — no activity for ${idle} days`,
        detail: `Sitting in "${q.stage.replace(/_/g, ' ')}" · threshold is ${config.stallThresholdDays} days`,
        meta: { idle, threshold: config.stallThresholdDays, ownerName: q.ownerName },
        detectedAt: now.toISOString(),
      });
    }

    // --- Discount anomaly vs the rep's own history
    const given = quoteTotals(q).effectiveDiscountPct;
    const avg = repAvg[q.ownerId] || 0;
    if (avg > 0 && given > avg * config.anomalySensitivity) {
      const multiple = given / avg;
      alerts.push({
        id: `disc-${q.id}`,
        type: 'discount_anomaly',
        quotationId: q.id,
        severity: multiple >= config.anomalySensitivity + 1 ? 'high' : 'medium',
        title: `${given.toFixed(1)}% discount vs ${q.ownerName}'s ${avg.toFixed(1)}% average`,
        detail: `${multiple.toFixed(1)}× this rep's 90-day average on ${q.customerName}`,
        meta: { given: round2(given), avg, multiple: round2(multiple), ownerName: q.ownerName },
        detectedAt: now.toISOString(),
      });
    }

    // --- Approval bottleneck
    const pending = currentPendingStep(q);
    if (q.stage === 'pending_approval' && pending) {
      const hrs = differenceInHours(now, new Date(q.lastActivityAt));
      if (hrs > config.approvalSlaHours) {
        alerts.push({
          id: `appr-${q.id}`,
          type: 'approval_bottleneck',
          quotationId: q.id,
          severity: hrs > config.approvalSlaHours * 3 ? 'high' : 'medium',
          title: `Waiting on ${roleLabel(pending.role)} for ${Math.max(1, Math.round(hrs / 24))} day(s)`,
          detail: `${q.customerName} · SLA is ${config.approvalSlaHours}h, currently ${Math.round(hrs)}h`,
          meta: { hrs: Math.round(hrs), sla: config.approvalSlaHours, role: pending.role },
          detectedAt: now.toISOString(),
        });
      }
    }

    // --- Delivery promise slippage
    const plan = fulfillmentPlans[q.id];
    if (plan?.backorders?.length && q.promisedDeliveryDate) {
      const promised = new Date(q.promisedDeliveryDate);
      const latest = plan.backorders
        .map((b) => (b.etaDate ? new Date(b.etaDate) : null))
        .filter(Boolean)
        .sort((a, b) => b - a)[0];

      if (latest && latest > promised) {
        const daysLate = differenceInDays(latest, promised);
        alerts.push({
          id: `ship-${q.id}`,
          type: 'delivery_slippage',
          quotationId: q.id,
          severity: daysLate > 10 ? 'high' : daysLate > 3 ? 'medium' : 'low',
          title: `Delivery slipping ${daysLate} day(s) on ${q.customerName}`,
          detail: `Promised ${q.promisedDeliveryDate}, current backorder ETA ${latest.toISOString().slice(0, 10)}`,
          meta: { daysLate, promised: q.promisedDeliveryDate },
          detectedAt: now.toISOString(),
        });
      }
    }
  }

  const order = { high: 0, medium: 1, low: 2 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

export const ALERT_TYPE_META = {
  stalled: { label: 'Stalled deal', icon: 'Clock' },
  discount_anomaly: { label: 'Discount anomaly', icon: 'TrendingDown' },
  delivery_slippage: { label: 'Delivery slippage', icon: 'Truck' },
  approval_bottleneck: { label: 'Approval bottleneck', icon: 'UserCheck' },
};

export const SEVERITY_META = {
  high: { label: 'High', tone: 'text-state-danger', bg: 'bg-state-danger/12', dot: 'bg-state-danger' },
  medium: { label: 'Medium', tone: 'text-accent-amber', bg: 'bg-accent-amber/14', dot: 'bg-accent-amber' },
  low: { label: 'Low', tone: 'text-state-info', bg: 'bg-state-info/12', dot: 'bg-state-info' },
};

/** Which screen an alert should open. */
export function alertTargetRoute(alert) {
  switch (alert.type) {
    case 'approval_bottleneck':
      return `/app/quotations/${alert.quotationId}/approval`;
    case 'delivery_slippage':
      return `/app/quotations/${alert.quotationId}/fulfillment`;
    default:
      return `/app/quotations/${alert.quotationId}`;
  }
}

/** Aging buckets for the dashboard chart. */
export function agingBuckets(quotations = []) {
  const now = new Date();
  const buckets = [
    { name: '0–3 days', min: 0, max: 3, count: 0 },
    { name: '4–7 days', min: 4, max: 7, count: 0 },
    { name: '8–14 days', min: 8, max: 14, count: 0 },
    { name: '15+ days', min: 15, max: Infinity, count: 0 },
  ];
  for (const q of quotations.filter((x) => OPEN_STAGES.includes(x.stage))) {
    const idle = differenceInDays(now, new Date(q.lastActivityAt));
    const b = buckets.find((x) => idle >= x.min && idle <= x.max);
    if (b) b.count += 1;
  }
  return buckets;
}
