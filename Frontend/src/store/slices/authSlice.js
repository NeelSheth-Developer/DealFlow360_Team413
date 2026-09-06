import * as authApi from '@/services/authService';
import { CUSTOMER, INTERNAL, authErrorMessage } from '@/services/authService';
import { clearAuthTokens, hasSession } from '@/services/apiClient';

/**
 * Authentication. Every action here talks to the real backend — there is no
 * local credential check and no seeded password anywhere in this file.
 *
 * TWO SEPARATE IDENTITY SPACES, enforced server-side by the `type` field:
 *   currentUser   staff    type: 'internal'  → /login, /signup
 *   customerUser  buyers   type: 'customer'  → /customer/login, /customer/signup
 * A session is only ever one or the other; signing into one clears the other.
 *
 * SIGNUP IS TWO STEPS. POST /auth/signup replies 201 "OTP sent" and issues no
 * tokens. `pendingVerification` holds the email/type between that call and
 * POST /auth/verify-otp so the OTP screen knows what it is confirming.
 *
 * ROLES ARE NOT SELF-ASSIGNED. /auth/signup rejects `role` with 400
 * FIELD_NOT_ALLOWED. New staff land on whatever the server defaults to and an
 * admin promotes them via PATCH /users/:id. That is why there is no role picker
 * on the signup form and no switchRole action in this slice.
 */

/** Uniform failure shape so every caller can do `if (!result.ok)`. */
function fail(error) {
  return { ok: false, error: authErrorMessage(error), code: error?.code ?? null };
}

export function createAuthSlice(set, get) {
  /** Applies a session to the right identity slot, clearing the other. */
  function adoptSession(session) {
    if (!session) return null;
    if (session.kind === 'customer') {
      set({ customerUser: session, currentUser: null, pendingVerification: null });
    } else {
      set({ currentUser: session, customerUser: null, pendingVerification: null });
    }
    return session;
  }

  /**
   * Fill the store's caches straight after an interactive sign-in.
   *
   * WHY THIS IS NEEDED, and why it is not in `adoptSession`:
   * `boot()` fetches reference data, but it runs once when the app mounts. On a cold
   * visit there is no session cookie yet, so `boot()` restores nothing and returns
   * early — and because it has already set `isBooted`, it never runs again. Signing in
   * therefore used to leave `quotations`, `products`, `customers`, `warehouses`,
   * `subscriptionPlans` and `upsellRules` permanently empty, which is why the
   * quotation list, pipeline and catalogue screens rendered blank while the screens
   * that fetch in their own `useEffect` (dashboard, directory, audit) worked.
   *
   * It is awaited so the workspace has data on arrival rather than flashing empty, and
   * `loadReferenceData` already isolates each request with `allSettled` — one 403 on
   * governance config (which a sales_rep cannot read) will not block the rest.
   *
   * `restoreSession` deliberately does NOT call this: on that path `boot()` performs the
   * load itself, and doing it here as well would double every request on page load.
   */
  async function hydrateAfterSignIn() {
    try {
      await get().loadReferenceData();
    } catch {
      // Never block a successful sign-in on a slow or partial fetch. The screens have
      // their own empty states and Reload Data retries.
    }
  }

  return {
    currentUser: null,
    customerUser: null,

    /** { email, type, purpose } while an OTP is outstanding. */
    pendingVerification: null,

    isAuthLoading: false,
    /** True until the first /auth/me settles, so guards don't bounce too early. */
    isRestoringSession: true,

    // ------------------------------------------------------ session restore
    /**
     * Rehydrate from the stored refresh/access token on page load. Called once
     * from App boot. Silent by design: no token simply means "not signed in".
     */
    async restoreSession() {
      if (!hasSession()) {
        set({ isRestoringSession: false });
        return { ok: false };
      }

      set({ isRestoringSession: true });
      try {
        const session = await authApi.getMe();
        adoptSession(session);
        return { ok: true, session };
      } catch (error) {
        // Expired or revoked. Drop the tokens so we don't retry on every route.
        clearAuthTokens();
        set({ currentUser: null, customerUser: null });
        return fail(error);
      } finally {
        set({ isRestoringSession: false });
      }
    },

    // -------------------------------------------------------- staff sign-in
    async login({ email, password }) {
      set({ isAuthLoading: true });
      try {
        const session = await authApi.login({ email, password, type: INTERNAL });
        adoptSession(session);
        await hydrateAfterSignIn();
        return { ok: true, user: session };
      } catch (error) {
        return fail(error);
      } finally {
        set({ isAuthLoading: false });
      }
    },

    /**
     * Staff self-registration. Only name/email/password are sent — the server
     * rejects role, team, tier and currency.
     * @returns {{ok:true, status:'otp_sent'|'authenticated'}}
     */
    async signup({ name, email, password }) {
      set({ isAuthLoading: true });
      try {
        const result = await authApi.signup({ name, email, password, type: INTERNAL });

        if (result.status === 'authenticated') {
          adoptSession(result.session);
          await hydrateAfterSignIn();
          return { ok: true, status: 'authenticated', user: result.session };
        }

        set({ pendingVerification: { email, type: INTERNAL, purpose: 'signup' } });
        return { ok: true, status: 'otp_sent', message: result.message };
      } catch (error) {
        return fail(error);
      } finally {
        set({ isAuthLoading: false });
      }
    },

    // ----------------------------------------------------- customer sign-in
    async customerLogin({ email, password }) {
      set({ isAuthLoading: true });
      try {
        const session = await authApi.login({ email, password, type: CUSTOMER });
        adoptSession(session);
        await hydrateAfterSignIn();
        return { ok: true, customer: session };
      } catch (error) {
        return fail(error);
      } finally {
        set({ isAuthLoading: false });
      }
    },

    /**
     * Customer self-registration. `name` is the organisation name — the API takes
     * a single name field and assigns the CUST-XXXX code after verification.
     * Tier always starts at bronze server-side; it is never self-selected.
     */
    async customerSignup({ name, email, password }) {
      set({ isAuthLoading: true });
      try {
        const result = await authApi.signup({ name, email, password, type: CUSTOMER });

        if (result.status === 'authenticated') {
          adoptSession(result.session);
          await hydrateAfterSignIn();
          return { ok: true, status: 'authenticated', customer: result.session };
        }

        set({ pendingVerification: { email, type: CUSTOMER, purpose: 'signup' } });
        return { ok: true, status: 'otp_sent', message: result.message };
      } catch (error) {
        return fail(error);
      } finally {
        set({ isAuthLoading: false });
      }
    },

    // ------------------------------------------------------------------ OTP
    /** Confirm the code for whatever signup is currently pending. */
    async verifyOtp({ otp, email, type } = {}) {
      const pending = get().pendingVerification;
      const targetEmail = email ?? pending?.email;
      const targetType = type ?? pending?.type ?? INTERNAL;

      if (!targetEmail) {
        return { ok: false, error: 'Nothing is awaiting verification. Start again.' };
      }

      set({ isAuthLoading: true });
      try {
        const session = await authApi.verifyOtp({ email: targetEmail, otp, type: targetType });
        adoptSession(session);
        await hydrateAfterSignIn();
        return { ok: true, session, kind: session.kind };
      } catch (error) {
        return fail(error);
      } finally {
        set({ isAuthLoading: false });
      }
    },

    /** Request a fresh code. Response is identical whether or not the email exists. */
    async resendOtp({ email, type, purpose } = {}) {
      const pending = get().pendingVerification;
      const targetEmail = email ?? pending?.email;
      const targetType = type ?? pending?.type ?? INTERNAL;
      const targetPurpose = purpose ?? pending?.purpose ?? 'signup';

      if (!targetEmail) return { ok: false, error: 'No email to send a code to.' };

      try {
        const result = await authApi.resendOtp({
          email: targetEmail,
          type: targetType,
          purpose: targetPurpose,
        });
        return { ok: true, ...result };
      } catch (error) {
        return fail(error);
      }
    },

    clearPendingVerification() {
      set({ pendingVerification: null });
    },

    // ------------------------------------------------------- password reset
    async forgotPassword({ email, type = INTERNAL }) {
      try {
        const result = await authApi.forgotPassword({ email, type });
        set({ pendingVerification: { email, type, purpose: 'password_reset' } });
        return { ok: true, ...result };
      } catch (error) {
        return fail(error);
      }
    },

    /** Revokes every session and issues no token — the caller must send the user to login. */
    async resetPassword({ email, otp, newPassword, type }) {
      const pending = get().pendingVerification;
      const targetEmail = email ?? pending?.email;
      const targetType = type ?? pending?.type ?? INTERNAL;

      try {
        const result = await authApi.resetPassword({
          email: targetEmail,
          otp,
          newPassword,
          type: targetType,
        });
        set({ currentUser: null, customerUser: null, pendingVerification: null });
        return { ok: true, ...result };
      } catch (error) {
        return fail(error);
      }
    },

    async changePassword({ currentPassword, newPassword }) {
      try {
        const result = await authApi.changePassword({ currentPassword, newPassword });
        return { ok: true, ...result };
      } catch (error) {
        return fail(error);
      }
    },

    // --------------------------------------------------------------- logout
    async logout() {
      await authApi.logout();
      set({ currentUser: null, pendingVerification: null });
    },

    async customerLogout() {
      await authApi.logout();
      set({ customerUser: null, pendingVerification: null });
    },

    // ---------------------------------------------------------- permissions
    hasRole(...roles) {
      const me = get().currentUser;
      return Boolean(me && roles.flat().includes(me.role));
    },

    /**
     * Server permissions win when present.
     *
     * GET /auth/me returns a `permissions` object for staff. Trusting it keeps
     * the UI aligned with what the API will actually allow, instead of the UI
     * guessing from a role name and then eating a 403.
     */
    can(permission, ...fallbackRoles) {
      const me = get().currentUser;
      if (!me) return false;
      const granted = me.permissions?.[permission];
      if (typeof granted === 'boolean') return granted;
      return get().hasRole(...fallbackRoles);
    },

    canAccessBackend() {
      return get().can('canAccessBackend', 'admin', 'sales_manager', 'finance');
    },

    /** Only Finance and Admin may settle money. No server flag for this yet. */
    canRecordPayments() {
      return get().can('canRecordPayments', 'finance', 'admin');
    },

    /** Who may hand a quotation to a different owner. */
    canAssignQuotations() {
      return get().can('canAssignQuotations', 'admin', 'sales_manager');
    },

    canConfigureCatalog() {
      return get().can('canConfigureCatalog', 'admin');
    },

    canConfigureDiscounts() {
      return get().can('canConfigureDiscounts', 'admin', 'sales_manager');
    },

    canViewReports() {
      return get().can('canViewReports', 'admin', 'sales_manager', 'finance', 'sales_rep');
    },

    // ---------------------------------------------------------- convenience
    /**
     * The signed-in customer. Prefers the local directory record when one exists
     * so a tier change made in the back-end shows immediately, and otherwise
     * falls back to the session the API handed us.
     */
    currentCustomer() {
      const session = get().customerUser;
      if (!session) return null;
      const local = get().customers.find(
        (c) => c.id === session.id || c.email?.toLowerCase() === session.email?.toLowerCase(),
      );
      return local ? { ...session, ...local, kind: 'customer' } : session;
    },
  };
}
