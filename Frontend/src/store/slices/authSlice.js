import { nextId, nowISO } from '@/lib/utils';
import { roleLabel } from '@/lib/format';

/**
 * Two completely separate identity spaces.
 *
 *  - `currentUser`     internal staff: sales_rep, sales_manager, finance, admin.
 *                      One shared login and signup at /login and /signup.
 *  - `customerUser`    external customers. Their own login and signup under
 *                      /customer/*. Never granted an internal role.
 *
 * Accounts can only be created by self-signup. No role — including admin — can
 * create an account for someone else, which is why there is no `createUser`
 * action anywhere in this store.
 */

const DEMO_PASSWORD_HINT = 'demo1234';

function normalise(email) {
  return String(email ?? '').trim().toLowerCase();
}

export function createAuthSlice(set, get) {
  return {
    currentUser: null,
    customerUser: null,

    // ------------------------------------------------------ internal staff
    login(email, password) {
      const target = normalise(email);
      const user = get().users.find((u) => normalise(u.email) === target);

      if (!user) {
        return { ok: false, error: 'No staff account found for that email.' };
      }
      if (password && user.password && password !== user.password) {
        return { ok: false, error: 'Incorrect password.' };
      }

      set({ currentUser: user, customerUser: null });
      return { ok: true, user };
    },

    loginAsUser(userId) {
      const user = get().users.find((u) => u.id === userId);
      if (!user) return { ok: false, error: 'Unknown user.' };
      set({ currentUser: user, customerUser: null });
      return { ok: true, user };
    },

    /**
     * Self-registration for internal staff. This is the ONLY way an internal
     * account comes into existence.
     */
    signup({ name, email, password, role, team }) {
      const target = normalise(email);

      if (!name?.trim()) return { ok: false, error: 'Enter your full name.' };
      if (!/^\S+@\S+\.\S+$/.test(target)) return { ok: false, error: 'Enter a valid email address.' };
      if (!password || password.length < 6) {
        return { ok: false, error: 'Choose a password of at least 6 characters.' };
      }
      if (get().users.some((u) => normalise(u.email) === target)) {
        return { ok: false, error: 'That email already has a staff account. Sign in instead.' };
      }
      if (get().customers.some((c) => normalise(c.email) === target)) {
        return { ok: false, error: 'That email is registered as a customer account.' };
      }

      const user = {
        id: nextId('u'),
        name: name.trim(),
        email: target,
        password,
        role,
        team: team?.trim() || 'Unassigned',
        avatarColor: 'from-brand-500 to-accent-pink',
        createdAt: nowISO(),
      };

      set((state) => ({ users: [...state.users, user], currentUser: user, customerUser: null }));
      get().logAudit({
        entityType: 'user',
        entityId: user.id,
        action: `Staff account self-registered — ${roleLabel(role)}`,
        actor: user,
      });
      return { ok: true, user };
    },

    /** Demo convenience: hop to a seeded user holding a given role. */
    switchRole(role) {
      const user = get().users.find((u) => u.role === role);
      if (!user) return { ok: false, error: `No seeded user with the ${roleLabel(role)} role.` };
      set({ currentUser: user, customerUser: null });
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

    /** Only Finance and Admin may settle money. */
    canRecordPayments() {
      return get().hasRole('finance', 'admin');
    },

    /** Who may hand a quotation to a different owner. */
    canAssignQuotations() {
      return get().hasRole('admin', 'sales_manager');
    },

    // ---------------------------------------------------------- customers
    customerLogin(email, password) {
      const target = normalise(email);
      const customer = get().customers.find((c) => normalise(c.email) === target);

      if (!customer) {
        return { ok: false, error: 'No customer account found for that email.' };
      }
      if (!customer.password) {
        return {
          ok: false,
          error: 'This account has no password set yet. Use Create account to finish registering.',
        };
      }
      if (password !== customer.password) {
        return { ok: false, error: 'Incorrect password.' };
      }

      set({ customerUser: customer, currentUser: null });
      get().logAudit({
        entityType: 'customer',
        entityId: customer.id,
        action: 'Customer signed in to the portal',
        actor: { id: customer.id, name: customer.contactName || customer.name, role: 'customer' },
      });
      return { ok: true, customer };
    },

    /**
     * Customer self-registration.
     *
     * Two paths:
     *  - the company already exists in the directory but has no password yet
     *    (a rep added them commercially) — this claims that account;
     *  - the company is new — a Bronze-tier customer record is created.
     *
     * Tier is never self-selected. New accounts start at the lowest tier and only
     * a Sales Manager or Admin can promote them, because tier decides pricing.
     */
    customerSignup({ companyName, contactName, email, password }) {
      const target = normalise(email);

      if (!companyName?.trim()) return { ok: false, error: 'Enter your company name.' };
      if (!contactName?.trim()) return { ok: false, error: 'Enter your name.' };
      if (!/^\S+@\S+\.\S+$/.test(target)) return { ok: false, error: 'Enter a valid email address.' };
      if (!password || password.length < 6) {
        return { ok: false, error: 'Choose a password of at least 6 characters.' };
      }
      if (get().users.some((u) => normalise(u.email) === target)) {
        return { ok: false, error: 'That email belongs to a staff account.' };
      }

      const existing = get().customers.find((c) => normalise(c.email) === target);

      if (existing) {
        if (existing.password) {
          return { ok: false, error: 'That email is already registered. Sign in instead.' };
        }
        const claimed = {
          ...existing,
          password,
          contactName: contactName.trim(),
          registeredAt: nowISO(),
        };
        set((state) => ({
          customers: state.customers.map((c) => (c.id === claimed.id ? claimed : c)),
          customerUser: claimed,
          currentUser: null,
        }));
        get().logAudit({
          entityType: 'customer',
          entityId: claimed.id,
          action: 'Customer claimed their existing account',
          actor: { id: claimed.id, name: claimed.contactName, role: 'customer' },
        });
        return { ok: true, customer: claimed, claimed: true };
      }

      const customer = {
        id: nextId('c'),
        name: companyName.trim(),
        tier: 'bronze',
        contactName: contactName.trim(),
        email: target,
        password,
        currency: 'INR',
        industry: '',
        registeredAt: nowISO(),
      };

      set((state) => ({
        customers: [...state.customers, customer],
        customerUser: customer,
        currentUser: null,
      }));

      get().logAudit({
        entityType: 'customer',
        entityId: customer.id,
        action: `Customer account self-registered — ${customer.name} (Bronze tier)`,
        actor: { id: customer.id, name: customer.contactName, role: 'customer' },
      });

      // Sales team needs to know a new customer arrived and can be quoted.
      get().notifyRole({
        role: 'sales_manager',
        type: 'system',
        title: `New customer registered: ${customer.name}`,
        body: `${customer.contactName} signed up. Starts at Bronze tier until promoted.`,
        link: '/app/backend/directory',
      });

      return { ok: true, customer, claimed: false };
    },

    customerLogout() {
      set({ customerUser: null });
    },

    /** The signed-in customer, refreshed from the store so tier changes show. */
    currentCustomer() {
      const session = get().customerUser;
      if (!session) return null;
      return get().customers.find((c) => c.id === session.id) ?? session;
    },

    demoPasswordHint() {
      return DEMO_PASSWORD_HINT;
    },
  };
}
