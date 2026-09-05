import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  alertStates,
  approvalSteps,
  backorders,
  customers,
  quotationLines,
  quotations,
  users,
  type AlertType,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { emailEscalation, emailNudge } from '../../lib/emails.js';
import { num, round2 } from '../../lib/money.js';
import { notify, usersWithRole } from '../../lib/notify.js';
import { orderTotals } from '../../lib/totals.js';
import { ApiError } from '../../utils/api-error.js';
import { getDashboardConfig } from '../config/config.service.js';

/**
 * Deal health and anomaly alerts.
 *
 * Alerts are COMPUTED on read from live data and the configured thresholds — they are
 * not a queue that has to be kept in sync. Only the operator actions taken against one
 * (nudged, escalated) are persisted, because only those are facts rather than
 * derivations.
 *
 * The anomaly rule is the one worth reading carefully: each rep is compared against
 * THEIR OWN rolling 90-day average, not a global threshold. A naturally aggressive
 * discounter would otherwise drown out the signal from a conservative one, and the
 * alert would degrade into noise that everyone learns to ignore.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ANOMALY_WINDOW_DAYS = 90;

/** Stages where a deal is live and inactivity is meaningful. */
const OPEN_STAGES = ['draft', 'sent', 'under_negotiation', 'pending_approval'] as const;
const ACTIVE_STAGES = [
  'draft',
  'sent',
  'under_negotiation',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
] as const;

export type Alert = {
  id: string;
  type: AlertType;
  severity: 'low' | 'medium' | 'high';
  quotationId: string;
  reference: string;
  title: string;
  detail: string;
  meta: Record<string, unknown>;
  detectedAt: Date;
  escalated: boolean;
};

type QuotationRow = {
  id: string;
  reference: string;
  stage: string;
  ownerId: string;
  ownerName: string;
  customerName: string;
  lastActivityAt: Date;
  createdAt: Date;
  promisedDeliveryDate: string | null;
  orderDiscountPct: string;
};

async function liveQuotations(): Promise<QuotationRow[]> {
  return db
    .select({
      id: quotations.id,
      reference: quotations.reference,
      stage: quotations.stage,
      ownerId: quotations.ownerId,
      ownerName: users.name,
      customerName: customers.name,
      lastActivityAt: quotations.lastActivityAt,
      createdAt: quotations.createdAt,
      promisedDeliveryDate: quotations.promisedDeliveryDate,
      orderDiscountPct: quotations.orderDiscountPct,
    })
    .from(quotations)
    .innerJoin(users, eq(users.id, quotations.ownerId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(inArray(quotations.stage, [...ACTIVE_STAGES]));
}

/** Effective discount per quotation, derived from its lines. */
async function discountByQuotation(quotationIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (quotationIds.length === 0) return map;

  const lines = await db
    .select()
    .from(quotationLines)
    .where(inArray(quotationLines.quotationId, quotationIds));

  const grouped = new Map<string, typeof lines>();
  for (const line of lines) {
    const list = grouped.get(line.quotationId) ?? [];
    list.push(line);
    grouped.set(line.quotationId, list);
  }

  for (const [quotationId, rows] of grouped) {
    const totals = orderTotals(
      rows.map((row) => ({
        qty: row.qty,
        unitPrice: num(row.unitPrice),
        costPrice: num(row.costPrice),
        discountPct: num(row.discountPct),
        taxPct: num(row.taxPct),
        category: row.category,
        isSubscription: row.isSubscription,
      })),
    );
    map.set(quotationId, totals.effectiveDiscountPct);
  }

  return map;
}

/**
 * Each rep's rolling 90-day average effective discount, from CLOSED business only.
 *
 * Closed rather than all-time because an open quotation is still being negotiated —
 * including it would let today's aggressive draft raise the very baseline it is being
 * measured against, and the alert would never fire.
 */
async function repBaselines(): Promise<Map<string, number>> {
  const since = new Date(Date.now() - ANOMALY_WINDOW_DAYS * DAY_MS);

  const rows = await db
    .select({ id: quotations.id, ownerId: quotations.ownerId })
    .from(quotations)
    .where(
      and(
        inArray(quotations.stage, ['confirmed', 'billed', 'lost']),
        sql`${quotations.createdAt} >= ${since}`,
      ),
    );

  const discounts = await discountByQuotation(rows.map((row) => row.id));

  const byRep = new Map<string, number[]>();
  for (const row of rows) {
    const discount = discounts.get(row.id);
    if (discount === undefined) continue;
    const list = byRep.get(row.ownerId) ?? [];
    list.push(discount);
    byRep.set(row.ownerId, list);
  }

  const averages = new Map<string, number>();
  for (const [ownerId, values] of byRep) {
    if (values.length === 0) continue;
    averages.set(ownerId, round2(values.reduce((sum, v) => sum + v, 0) / values.length));
  }

  return averages;
}

export async function listAlerts(filter?: { type?: AlertType; severity?: string }) {
  const config = await getDashboardConfig();
  const rows = await liveQuotations();
  if (rows.length === 0) return [];

  const [discounts, baselines, pendingSteps, openBackorders, states] = await Promise.all([
    discountByQuotation(rows.map((row) => row.id)),
    repBaselines(),
    db
      .select({
        quotationId: approvalSteps.quotationId,
        createdAt: approvalSteps.createdAt,
        role: approvalSteps.role,
      })
      .from(approvalSteps)
      .where(eq(approvalSteps.status, 'pending')),
    db
      .select({
        quotationId: backorders.quotationId,
        etaDate: backorders.etaDate,
      })
      .from(backorders)
      .where(isNull(backorders.resolvedAt)),
    db.select().from(alertStates),
  ]);

  const escalated = new Map(states.map((state) => [state.alertKey, state.escalated]));
  const now = Date.now();
  const alerts: Alert[] = [];

  for (const row of rows) {
    // --- stalled ---------------------------------------------------------
    if ((OPEN_STAGES as readonly string[]).includes(row.stage)) {
      const idleDays = (now - row.lastActivityAt.getTime()) / DAY_MS;
      if (idleDays > config.stallThresholdDays) {
        const ratio = idleDays / config.stallThresholdDays;
        alerts.push({
          id: `stall-${row.id}`,
          type: 'stalled',
          severity: ratio >= 3 ? 'high' : ratio >= 2 ? 'medium' : 'low',
          quotationId: row.id,
          reference: row.reference,
          title: `${row.reference} has been quiet for ${Math.floor(idleDays)} days`,
          detail: `No activity on ${row.customerName} since ${row.lastActivityAt.toISOString().slice(0, 10)}. Owned by ${row.ownerName}.`,
          meta: {
            idleDays: round2(idleDays),
            threshold: config.stallThresholdDays,
            ratio: round2(ratio),
            ownerName: row.ownerName,
          },
          detectedAt: row.lastActivityAt,
          escalated: escalated.get(`stall-${row.id}`) ?? false,
        });
      }
    }

    // --- discount anomaly ------------------------------------------------
    const given = discounts.get(row.id);
    const baseline = baselines.get(row.ownerId);

    if (given !== undefined && baseline !== undefined && baseline > 0) {
      const multiple = given / baseline;
      if (multiple > config.anomalySensitivity) {
        alerts.push({
          id: `disc-${row.id}`,
          type: 'discount_anomaly',
          severity: multiple >= config.anomalySensitivity + 1 ? 'high' : 'medium',
          quotationId: row.id,
          reference: row.reference,
          title: `${given.toFixed(1)}% discount vs ${row.ownerName}'s ${baseline.toFixed(1)}% average`,
          detail: `${round2(multiple)}x this rep's ${ANOMALY_WINDOW_DAYS}-day average on ${row.customerName}.`,
          // Both numbers travel with the alert so the UI can explain itself rather
          // than just assert that something is wrong.
          meta: {
            given,
            avg: baseline,
            multiple: round2(multiple),
            ownerName: row.ownerName,
            sensitivity: config.anomalySensitivity,
          },
          detectedAt: new Date(),
          escalated: escalated.get(`disc-${row.id}`) ?? false,
        });
      }
    }

    // --- delivery slippage -----------------------------------------------
    if (row.promisedDeliveryDate) {
      const promised = new Date(`${row.promisedDeliveryDate}T00:00:00Z`).getTime();
      const etas = openBackorders
        .filter((back) => back.quotationId === row.id && back.etaDate)
        .map((back) => new Date(`${back.etaDate}T00:00:00Z`).getTime());

      if (etas.length > 0) {
        const latest = Math.max(...etas);
        if (latest > promised) {
          const daysLate = (latest - promised) / DAY_MS;
          alerts.push({
            id: `slip-${row.id}`,
            type: 'delivery_slippage',
            severity: daysLate > 10 ? 'high' : daysLate > 3 ? 'medium' : 'low',
            quotationId: row.id,
            reference: row.reference,
            title: `${row.reference} will miss its promised delivery by ${Math.ceil(daysLate)} days`,
            detail: `Promised ${row.promisedDeliveryDate}, earliest backorder ETA ${new Date(latest).toISOString().slice(0, 10)}. ${row.customerName} needs to be told.`,
            meta: {
              promised: row.promisedDeliveryDate,
              eta: new Date(latest).toISOString().slice(0, 10),
              daysLate: round2(daysLate),
              ownerName: row.ownerName,
            },
            detectedAt: new Date(),
            escalated: escalated.get(`slip-${row.id}`) ?? false,
          });
        }
      }
    }

    // --- approval bottleneck ---------------------------------------------
    const step = pendingSteps.find((candidate) => candidate.quotationId === row.id);
    if (step) {
      const waitingHours = (now - step.createdAt.getTime()) / (60 * 60 * 1000);
      if (waitingHours > config.approvalSlaHours) {
        alerts.push({
          id: `appr-${row.id}`,
          type: 'approval_bottleneck',
          severity: waitingHours > config.approvalSlaHours * 3 ? 'high' : 'medium',
          quotationId: row.id,
          reference: row.reference,
          title: `${row.reference} has been awaiting approval for ${Math.floor(waitingHours)} hours`,
          detail: `Waiting on ${step.role.replace(/_/g, ' ')} sign-off for ${row.customerName}, past the ${config.approvalSlaHours}h SLA.`,
          meta: {
            waitingHours: round2(waitingHours),
            sla: config.approvalSlaHours,
            role: step.role,
            ownerName: row.ownerName,
          },
          detectedAt: step.createdAt,
          escalated: escalated.get(`appr-${row.id}`) ?? false,
        });
      }
    }
  }

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  const filtered = alerts.filter(
    (alert) =>
      (!filter?.type || alert.type === filter.type) &&
      (!filter?.severity || alert.severity === filter.severity),
  );

  return filtered.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

export async function dealHealth() {
  const config = await getDashboardConfig();
  const rows = await liveQuotations();
  const discounts = await discountByQuotation(rows.map((row) => row.id));
  const alerts = await listAlerts();

  const lineTotalsByQuotation = await db
    .select({
      quotationId: quotationLines.quotationId,
      value: sql<string>`SUM(${quotationLines.qty} * ${quotationLines.unitPrice})`,
    })
    .from(quotationLines)
    .where(
      rows.length > 0
        ? inArray(
            quotationLines.quotationId,
            rows.map((row) => row.id),
          )
        : sql`false`,
    )
    .groupBy(quotationLines.quotationId);

  const values = new Map(lineTotalsByQuotation.map((row) => [row.quotationId, num(row.value)]));
  const activeValue = rows.reduce((sum, row) => sum + (values.get(row.id) ?? 0), 0);

  const [[won], [lost], pending] = await Promise.all([
    db
      .select({ total: count() })
      .from(quotations)
      .where(inArray(quotations.stage, ['confirmed', 'billed'])),
    db.select({ total: count() }).from(quotations).where(eq(quotations.stage, 'lost')),
    db
      .select({ createdAt: approvalSteps.createdAt })
      .from(approvalSteps)
      .where(eq(approvalSteps.status, 'pending'))
      .orderBy(approvalSteps.createdAt),
  ]);

  const decided = (won?.total ?? 0) + (lost?.total ?? 0);
  const oldest = pending[0]?.createdAt;

  const cycles = await db
    .select({ createdAt: quotations.createdAt, updatedAt: quotations.updatedAt })
    .from(quotations)
    .where(inArray(quotations.stage, ['confirmed', 'billed']));

  const avgCycleDays =
    cycles.length > 0
      ? round2(
          cycles.reduce(
            (sum, row) => sum + (row.updatedAt.getTime() - row.createdAt.getTime()) / DAY_MS,
            0,
          ) / cycles.length,
        )
      : 0;

  const discountValues = [...discounts.values()];

  return {
    activeCount: rows.length,
    activeValue: round2(activeValue),
    stalledCount: alerts.filter((alert) => alert.type === 'stalled').length,
    anomalyCount: alerts.filter((alert) => alert.type === 'discount_anomaly').length,
    slippageCount: alerts.filter((alert) => alert.type === 'delivery_slippage').length,
    bottleneckCount: alerts.filter((alert) => alert.type === 'approval_bottleneck').length,
    pendingApprovalCount: rows.filter((row) => row.stage === 'pending_approval').length,
    oldestPendingHours: oldest
      ? round2((Date.now() - oldest.getTime()) / (60 * 60 * 1000))
      : 0,
    winRate: decided > 0 ? round2(((won?.total ?? 0) / decided) * 100) : 0,
    avgCycleDays,
    avgDiscountPct:
      discountValues.length > 0
        ? round2(discountValues.reduce((sum, v) => sum + v, 0) / discountValues.length)
        : 0,
    highSeverityCount: alerts.filter((alert) => alert.severity === 'high').length,
    thresholds: config,
  };
}

/** Finds one computed alert by its synthetic key. */
async function findAlert(alertId: string): Promise<Alert> {
  const alerts = await listAlerts();
  const alert = alerts.find((candidate) => candidate.id === alertId);
  if (!alert) throw ApiError.notFound('That alert is no longer active');
  return alert;
}

export async function nudgeAlert(actor: AuditActor, alertId: string) {
  const alert = await findAlert(alertId);

  const [quotation] = await db
    .select({
      ownerId: quotations.ownerId,
      ownerName: users.name,
      ownerEmail: users.email,
      customerName: customers.name,
    })
    .from(quotations)
    .innerJoin(users, eq(users.id, quotations.ownerId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(eq(quotations.id, alert.quotationId))
    .limit(1);

  if (!quotation) throw ApiError.notFound('Quotation not found');

  await upsertState(alert, { nudgedAt: new Date() });

  await notify({
    userIds: [quotation.ownerId],
    type: 'nudge',
    title: `${alert.reference} needs your attention`,
    body: alert.detail,
    entityType: 'quotation',
    entityId: alert.quotationId,
    entityRef: alert.reference,
    view: 'builder',
  });

  await emailNudge({
    to: quotation.ownerEmail,
    ownerName: quotation.ownerName,
    reference: alert.reference,
    customerName: quotation.customerName,
    managerName: actor.name,
    detail: alert.detail,
  });

  await audit({
    entityType: 'quotation',
    entityId: alert.quotationId,
    entityRef: alert.reference,
    action: `Nudged ${quotation.ownerName} about a ${alert.type.replace(/_/g, ' ')} alert`,
    actor,
    meta: { alertId, severity: alert.severity },
  });

  return { ok: true, repName: quotation.ownerName };
}

export async function escalateAlert(actor: AuditActor, alertId: string) {
  const alert = await findAlert(alertId);

  const [quotation] = await db
    .select({
      ownerName: users.name,
      customerName: customers.name,
    })
    .from(quotations)
    .innerJoin(users, eq(users.id, quotations.ownerId))
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(eq(quotations.id, alert.quotationId))
    .limit(1);

  if (!quotation) throw ApiError.notFound('Quotation not found');

  await upsertState(alert, { escalated: true, escalatedAt: new Date() });

  const managerIds = await usersWithRole('sales_manager');

  await notify({
    userIds: managerIds,
    type: 'escalation',
    title: `Escalated: ${alert.title}`,
    body: alert.detail,
    entityType: 'quotation',
    entityId: alert.quotationId,
    entityRef: alert.reference,
    view: 'builder',
  });

  if (managerIds.length > 0) {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(inArray(users.id, managerIds));

    await emailEscalation({
      recipients: rows.map((row) => row.email),
      reference: alert.reference,
      customerName: quotation.customerName,
      ownerName: quotation.ownerName,
      title: alert.title,
      detail: alert.detail,
    });
  }

  await audit({
    entityType: 'quotation',
    entityId: alert.quotationId,
    entityRef: alert.reference,
    action: `Escalated a ${alert.type.replace(/_/g, ' ')} alert to management`,
    actor,
    meta: { alertId, notified: managerIds.length },
  });

  return { ok: true, escalated: true, notified: managerIds.length };
}

async function upsertState(
  alert: Alert,
  patch: { escalated?: boolean; escalatedAt?: Date; nudgedAt?: Date },
) {
  await db
    .insert(alertStates)
    .values({
      alertKey: alert.id,
      quotationId: alert.quotationId,
      type: alert.type,
      escalated: patch.escalated ?? false,
      escalatedAt: patch.escalatedAt ?? null,
      nudgedAt: patch.nudgedAt ?? null,
    })
    .onConflictDoUpdate({ target: alertStates.alertKey, set: patch });
}

