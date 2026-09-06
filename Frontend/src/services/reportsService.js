/**
 * Reports, audit log and notifications — API-REFERENCE §17.5–17.10.
 *
 *   GET   /reports/summary          MANAGER, FINANCE, ADMIN
 *   GET   /reports/products         MANAGER, FINANCE, ADMIN
 *   GET   /audit-log                MANAGER, FINANCE, ADMIN
 *   GET   /notifications            any staff · ?unreadOnly=&limit=
 *   PATCH /notifications/:id/read   any staff · 204
 *   PATCH /notifications/read-all   any staff · 204
 *
 * Report filters are the four the brief names: Period (`from`/`to`), Sales Team / Rep
 * (`repIds`/`teamIds`), Approval Status (`stages`) and Product / Category (`category`).
 * List params are comma-separated — `buildQuery` handles arrays.
 *
 * `category` filters the LINES, not the quotations: a mixed order still contributes its
 * hardware lines to a hardware report.
 */

import { api, buildQuery } from './apiClient';

/**
 * @returns {Promise<{kpis, valueByRep, valueByTeam, discountBuckets, funnel, revenueMix}>}
 *
 * `valueByTeam` is the rollup the brief asks for, and reps with no team appear under
 * "Unassigned" so the team rows always reconcile to `kpis.totalValue` — a report whose
 * parts do not sum to its header is worse than no report.
 *
 * `revenueMix` is the hybrid-billing split, one-time against recurring, by month.
 */
export function fetchReportSummary({ from, to, repIds, teamIds, stages, category } = {}) {
  return api.get(`/reports/summary${buildQuery({ from, to, repIds, teamIds, stages, category })}`);
}

/** Per-product qty, value, average effective discount and estimated cost, by value. */
export async function fetchProductReport({ from, to, repIds, teamIds, stages, category } = {}) {
  const data = await api.get(
    `/reports/products${buildQuery({ from, to, repIds, teamIds, stages, category })}`,
  );
  return Array.isArray(data) ? data : [];
}

/* ------------------------------------------------------------------ audit */

/**
 * APPEND-ONLY. There is no update or delete endpoint on this router and there never will
 * be — a trail that can be edited afterwards proves nothing.
 *
 * The actor is always the server's own view of who called; a client-supplied actor id is
 * never trusted. `actorRole` may also be `customer` (portal actions) or `system`
 * (auto-approve).
 *
 * @returns {Promise<{items: Array, meta: Object|null}>}
 */
export function fetchAuditLog({
  entityType,
  entityId,
  actorId,
  actorRole,
  search,
  from,
  to,
  page = 1,
  pageSize = 50,
} = {}) {
  return api.list(
    `/audit-log${buildQuery({ entityType, entityId, actorId, actorRole, search, from, to, page, pageSize })}`,
  );
}

/** The immutable trail for one entity — what the approval screen shows at the bottom. */
export function fetchEntityAudit(entityType, entityId, { pageSize = 100 } = {}) {
  return fetchAuditLog({ entityType, entityId, pageSize });
}

/* ---------------------------------------------------------- notifications */

/**
 * Always scoped to the caller's OWN user id — there is no way to read anyone else's,
 * including for an admin, because the row often summarises a deal the reader is not part
 * of.
 *
 * Takes a plain `limit`, not page/pageSize. `meta.unreadCount` carries the badge number.
 *
 * The row stores entityType / entityId / entityRef / view rather than a URL, so the
 * frontend owns its own routing — map `view` to a route on this side.
 *
 * @returns {Promise<{items: Array, unreadCount: number}>}
 */
export async function fetchNotifications({ unreadOnly, limit = 25 } = {}) {
  const { items, meta } = await api.list(`/notifications${buildQuery({ unreadOnly, limit })}`);
  return { items, unreadCount: Number(meta?.unreadCount) || 0 };
}

/**
 * 204. Scoped to the caller in the WHERE clause, so another user's id simply matches
 * nothing rather than being rejected — there is no probe here.
 */
export function markNotificationRead(notificationId) {
  return api.patch(`/notifications/${encodeURIComponent(notificationId)}/read`);
}

/** 204. Marks every unread notification for the caller as read. */
export function markAllNotificationsRead() {
  return api.patch('/notifications/read-all');
}

/**
 * Map a notification's `view` to a frontend route.
 *
 * Lives here rather than in the API because a routing change on this side must not need
 * a backend deploy — which is exactly why the server sends `view` and not a URL.
 */
export function notificationRoute(notification) {
  const id = notification?.entityId;
  if (!id) return '/app/dashboard';

  switch (notification.view) {
    case 'approval':
      return `/app/quotations/${id}/approval`;
    case 'fulfillment':
      return `/app/quotations/${id}/fulfillment`;
    case 'billing':
      return `/app/quotations/${id}/billing`;
    case 'invoice':
      return `/app/quotations/${id}/invoice`;
    case 'quotation':
      return `/app/quotations/${id}`;
    default:
      return '/app/dashboard';
  }
}
