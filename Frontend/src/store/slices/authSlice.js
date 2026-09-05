import { nextId } from '@/lib/utils';
import { roleLabel } from '@/lib/format';

/**
 * Session handling. There is no auth server: credentials are accepted as-is and
 * the role quick-pick on the login screen is the real fast path. `switchRole`
 * exists so a single-laptop demo can walk a Rep -> Manager -> Finance approval
 * chain without four separate logins — it is labelled as a demo affordance in
 * the UI, not hidden.
 */
export function createAuthSlice(set, get) {
  return {
    currentUser: null,

    login(email) {
      const users = get().users;
      const match =
        users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase()) ?? null;

      if (!match) {
        return { ok: false, error: 'No account found for that email. Try a role card below.' };
      }
      set({ currentUser: match });
      return { ok: true, user: match };
    },

    loginAsRole(role) {
      const user = get().users.find((u) => u.role === role);
      if (!user) return { ok: false, error: `No seeded user with the ${roleLabel(role)} role.` };
      set({ currentUser: user });
      return { ok: true, user };
    },

    loginAsUser(userId) {
      const user = get().users.find((u) => u.id === userId);
      if (!user) return { ok: false, error: 'Unknown user.' };
      set({ currentUser: user });
      return { ok: true, user };
    },

    signup({ name, email, role, team }) {
      const exists = get().users.some((u) => u.email.toLowerCase() === email.toLowerCase());
      if (exists) {
        return { ok: false, error: 'That email is already registered. Sign in instead.' };
      }

      const user = {
        id: nextId('u'),
        name,
        email,
        role,
        team: team || 'Unassigned',
        avatarColor: 'from-brand-500 to-accent-pink',
      };

      set((state) => ({ users: [...state.users, user], currentUser: user }));
      get().logAudit({
        entityType: 'user',
        entityId: user.id,
        action: `Account created — ${roleLabel(role)}`,
        actor: user,
      });
      return { ok: true, user };
    },

    /** Demo convenience: jump to a seeded user holding the given role. */
    switchRole(role) {
      const user = get().users.find((u) => u.role === role);
      if (!user) return { ok: false, error: 'No user with that role.' };
      set({ currentUser: user });
      return { ok: true, user };
    },

    logout() {
      set({ currentUser: null });
    },

    hasRole(...roles) {
      const me = get().currentUser;
      return Boolean(me && roles.flat().includes(me.role));
    },

    canAccessBackend() {
      return get().hasRole('admin', 'sales_manager', 'finance');
    },
  };
}
