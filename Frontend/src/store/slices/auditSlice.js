import * as reportsApi from '@/services/reportsService';

/**
 * Append-only audit trail — API-REFERENCE §17.7.
 *
 * `logAudit()` HAS BEEN REMOVED, and no client-side equivalent replaces it.
 *
 * Entries are written only from inside the server's own services, and the actor is
 * always the server's view of who called — a client-supplied actor id is never trusted.
 * Every mutation the frontend can trigger is already audited on the other side:
 * discount changes with the binding ceiling and the overage, approvals and rejections
 * with their reason, auto-approvals as `system`, customer counters as `customer`,
 * fulfillment overrides, credit notes, payments with the balance after, and every
 * config change from → to.
 *
 * Writing entries here as well would produce a second, parallel trail that the real
 * append-only log does not contain, and the two would disagree the moment a request
 * failed after the local write. A trail that can be authored by the client proves
 * nothing, which is the whole point of the log.
 *
 * So this slice only reads. `auditLog` backs the full-platform screen and
 * `auditByEntity` backs the trail at the bottom of an approval screen; they are kept
 * apart because the first is paginated across everything and the second must not be
 * evicted by someone else's filter.
 */
export function createAuditSlice(set, get) {
  return {
    /**
     * The platform-wide trail. Manager, finance and admin only.
     *
     * Filtering, searching and paging are all server-side: the log runs to hundreds of
     * thousands of rows, so `search` cannot be a pass over a local array.
     */
    async loadAuditLog(filters = {}) {
      set({ auditLoading: true, auditError: null });
      try {
        const { items, meta } = await reportsApi.fetchAuditLog({
          entityType: filters.entityType || undefined,
          entityId: filters.entityId || undefined,
          actorId: filters.actorId || undefined,
          actorRole: filters.actorRole || undefined,
          search: filters.search || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 100,
        });
        set({ auditLog: items, auditMeta: meta ?? null, auditLoading: false });
        return { ok: true, items, meta };
      } catch (error) {
        set({ auditLoading: false, auditError: error.message });
        return { ok: false, error: error.message };
      }
    },

    /** The immutable trail for one entity, cached under its id. */
    async loadEntityAudit(entityType, entityId) {
      if (!entityId) return { ok: false, error: 'No entity.' };
      try {
        const { items } = await reportsApi.fetchEntityAudit(entityType, entityId);
        set((state) => ({ auditByEntity: { ...state.auditByEntity, [entityId]: items } }));
        return { ok: true, items };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /** Cache read. Empty until `loadEntityAudit` has resolved for this id. */
    auditForEntity(entityId) {
      return get().auditByEntity[entityId] ?? [];
    },
  };
}
