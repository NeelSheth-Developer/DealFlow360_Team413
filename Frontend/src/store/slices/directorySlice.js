import * as usersApi from '@/services/usersService';

/**
 * Staff directory — API-REFERENCE §3.
 *
 * `state.users` backs the owner pickers, the rep filters on the reporting screen and the
 * directory table. Nothing populated it before this slice existed, so every one of those
 * rendered an empty list.
 *
 * THERE IS NO CREATE AND NO DELETE, and that is not an omission. Every staff account
 * comes from POST /auth/signup, so each one has proved its own email address and chosen
 * its own password; an admin-provisioned account could do neither without an invite
 * flow. `updateUser` is the whole write surface.
 *
 * `loadRoles` is ADMIN ONLY and no-ops otherwise rather than firing a 403 that the boot
 * sequence would only swallow. The role picker is server-driven so it cannot drift out of
 * step with what PATCH /users/:id actually accepts — `admin` is absent from the list
 * because it is not assignable through the API at all.
 */
export function createDirectorySlice(set, get) {
  return {
    /**
     * Every page. The directory is a single table with no pager, and the owner pickers
     * read `state.users` directly — a staff member past the server's 100-row page cap
     * would not be assignable at all.
     */
    async loadUsers({ role, active, teamId, q } = {}) {
      set({ directoryLoading: true, directoryError: null });
      try {
        const { items, meta } = await usersApi.listAllUsers({ role, active, teamId, q });
        set({ users: items, usersMeta: meta ?? null, directoryLoading: false });
        return { ok: true, items };
      } catch (error) {
        set({ directoryLoading: false, directoryError: error.message });
        return { ok: false, error: error.message };
      }
    },

    async loadTeams() {
      try {
        const teams = await usersApi.listTeams();
        set({ teams });
        return { ok: true, teams };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /** Admin only. Skipped for everyone else — the list is only useful if you can assign. */
    async loadRoles() {
      if (!get().hasRole('admin')) return { ok: false, skipped: true };
      try {
        const roles = await usersApi.listRoles();
        set({ roles });
        return { ok: true, roles };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    },

    /**
     * Promote, rename, reassign or disable.
     *
     * `role` and `active` are admin-only; `name` and `teamId` are also open to a sales
     * manager, because placing a rep in a territory grants nothing while granting a role
     * changes what somebody can do.
     *
     * Three server guards land here as errors rather than being pre-empted locally: an
     * admin cannot change their own role, cannot deactivate themselves, and the last
     * active admin cannot be demoted or disabled (409 LAST_ADMIN). Only the server can
     * count the remaining active admins, so only the server can enforce the third.
     */
    async updateUser(userId, patch = {}) {
      try {
        const user = await usersApi.updateUser(userId, patch);
        set((state) => ({ users: state.users.map((u) => (u.id === user.id ? user : u)) }));

        // Changing your own name has to be reflected in the header immediately.
        if (get().currentUser?.id === user.id) {
          set((state) => ({ currentUser: { ...state.currentUser, ...user } }));
        }
        return { ok: true, user };
      } catch (error) {
        return { ok: false, error: error.message, code: error.code ?? null };
      }
    },
  };
}
