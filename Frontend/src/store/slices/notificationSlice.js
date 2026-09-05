import { nextId, nowISO } from '@/lib/utils';

/**
 * In-app notifications. These stand in for the emails a real deployment would
 * send: approval requests to approvers, results back to reps, negotiation
 * activity, nudges and escalations.
 */
export function createNotificationSlice(set, get) {
  return {
    notify({ userId, type, title, body = '', link = null }) {
      const notification = {
        id: nextId('nt'),
        userId,
        type,
        title,
        body,
        link,
        read: false,
        at: nowISO(),
      };
      set((state) => ({ notifications: [notification, ...state.notifications] }));
      return notification;
    },

    /** Notify every user holding a given role — used for approval routing. */
    notifyRole({ role, type, title, body = '', link = null }) {
      const recipients = get().users.filter((u) => u.role === role);
      for (const u of recipients) {
        get().notify({ userId: u.id, type, title, body, link });
      }
    },

    markNotificationRead(id) {
      set((state) => ({
        notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }));
    },

    markAllNotificationsRead() {
      const me = get().currentUser;
      if (!me) return;
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.userId === me.id ? { ...n, read: true } : n,
        ),
      }));
    },

    clearNotifications() {
      const me = get().currentUser;
      if (!me) return;
      set((state) => ({ notifications: state.notifications.filter((n) => n.userId !== me.id) }));
    },
  };
}
