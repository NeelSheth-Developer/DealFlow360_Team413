import { nextId, nowISO } from '@/lib/utils';

/**
 * Append-only audit trail.
 *
 * Every slice that mutates business state calls `logAudit`. Entries are never
 * edited or removed — the spec requires all approvals, rejections and edits to
 * be logged with user, timestamp and reason.
 */
export function createAuditSlice(set, get) {
  return {
    /**
     * @param {Object} entry
     * @param {string} entry.entityType 'quotation' | 'invoice' | 'config' | ...
     * @param {string} entry.entityId
     * @param {string} entry.action human-readable past-tense description
     * @param {string|null} [entry.reason]
     * @param {Object|null} [entry.meta]
     * @param {Object|null} [entry.actor] override the acting user (portal/system)
     */
    logAudit({ entityType, entityId, action, reason = null, meta = null, actor = null }) {
      const user = actor ?? get().currentUser;
      const resolved = user ?? {
        id: 'system',
        name: 'DealFlow360',
        role: 'system',
      };

      const entry = {
        id: nextId('au'),
        entityType,
        entityId,
        action,
        actorId: resolved.id,
        actorName: resolved.name,
        actorRole: resolved.role,
        reason,
        meta,
        at: nowISO(),
      };

      set((state) => ({ auditLog: [entry, ...state.auditLog] }));
      return entry;
    },

    auditForEntity(entityId) {
      return get().auditLog.filter((e) => e.entityId === entityId);
    },
  };
}
