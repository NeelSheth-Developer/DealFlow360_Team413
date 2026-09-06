import * as reportsApi from '@/services/reportsService';

/**
 * In-app notifications — API-REFERENCE §17.8–17.10.
 *
 * READ-ONLY FROM THE CLIENT. `notify()` and `notifyRole()` are gone: there is no
 * endpoint that creates a notification, and there should not be. The server raises them
 * as a side effect of the action that caused them — an approval request, a customer
 * comment, a nudge, an escalation — and sends the matching email in the same
 * transaction. A client-side writer would produce a bell badge with no email behind it,
 * and would let any signed-in user post a notification into someone else's feed.
 *
 * `clearNotifications()` is gone for the same reason: there is no delete endpoint. The
 * feed is the caller's own record of what happened, and "read" is the only state it has.
 *
 * Every response is already scoped to the caller's own user id in the WHERE clause, so
 * nothing here filters by `currentUser` — the rows in `state.notifications` are mine by
 * construction.
 */
export function createNotificationSlice(set, get) {
  return {
    /**
     * Takes a plain `limit`, not page/pageSize (§0 pagination exception).
     * `meta.unreadCount` is the badge number and counts everything unread, not just
     * what fits in `limit`.
     */
    async loadNotifications({ unreadOnly = false, limit = 25 } = {}) {
      if (!get().currentUser) return { ok: false, skipped: true };

      set({ notificationsLoading: true });
      try {
        const { items, unreadCount } = await reportsApi.fetchNotifications({
          unreadOnly: unreadOnly || undefined,
          limit,
        });
        set({
          notifications: items,
          notificationUnreadCount: unreadCount,
          notificationsLoading: false,
        });
        return { ok: true, items, unreadCount };
      } catch (error) {
        set({ notificationsLoading: false });
        return { ok: false, error: error.message };
      }
    },

    /**
     * 204 on success. Marked locally first: the row is already on screen and the badge
     * should drop the moment it is clicked, not a round trip later. A failure rolls the
     * optimistic change back so the badge cannot silently disagree with the server.
     */
    async markNotificationRead(id) {
      const before = get().notifications;
      const target = before.find((n) => n.id === id);
      if (!target || target.read) return { ok: true };

      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        notificationUnreadCount: Math.max(0, (state.notificationUnreadCount || 0) - 1),
      }));

      try {
        await reportsApi.markNotificationRead(id);
        return { ok: true };
      } catch (error) {
        set({ notifications: before });
        await get().loadNotifications();
        return { ok: false, error: error.message };
      }
    },

    async markAllNotificationsRead() {
      const before = get().notifications;
      const beforeCount = get().notificationUnreadCount;
      if (!beforeCount) return { ok: true };

      set((state) => ({
        notifications: state.notifications.map((n) => (n.read ? n : { ...n, read: true })),
        notificationUnreadCount: 0,
      }));

      try {
        await reportsApi.markAllNotificationsRead();
        return { ok: true };
      } catch (error) {
        set({ notifications: before, notificationUnreadCount: beforeCount });
        return { ok: false, error: error.message };
      }
    },

    /**
     * Where a notification should navigate to.
     *
     * The row carries `view` plus `entityId`, never a URL, so the mapping to a route
     * belongs on this side. Re-exported through the store so components do not each
     * import the service directly.
     */
    notificationRoute(notification) {
      return reportsApi.notificationRoute(notification);
    },
  };
}
