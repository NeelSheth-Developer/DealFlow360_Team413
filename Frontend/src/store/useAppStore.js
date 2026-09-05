import { create } from 'zustand';
import { createAuditSlice } from './slices/auditSlice';
import { createNotificationSlice } from './slices/notificationSlice';
import { createAuthSlice } from './slices/authSlice';
import { createCatalogSlice } from './slices/catalogSlice';
import { createConfigSlice } from './slices/configSlice';
import { createDirectorySlice } from './slices/directorySlice';
import { createRiskSlice } from './slices/riskSlice';
import { createQuotationSlice } from './slices/quotationSlice';
import { createFulfillmentSlice } from './slices/fulfillmentSlice';
import { createBillingSlice } from './slices/billingSlice';
import { createCustomerSlice } from './slices/customerSlice';
import { createDashboardSlice } from './slices/dashboardSlice';

/**
 * The single application store.
 *
 * IT IS A CACHE OF THE API, NOT A DATABASE. Every collection here is filled by a
 * `load…()` action from `src/services/*` and every mutation goes through the server.
 * Nothing is computed locally that the server computes: totals, risk scores, alerts and
 * invoice balances are all read from responses.
 *
 * THERE IS NO PERSIST MIDDLEWARE. It used to mirror the whole store into sessionStorage,
 * which made sense when the data was seeded locally. Now that the server owns it,
 * persisting would show stale rows on refresh and would keep a signed-out user's data
 * readable. The session itself survives a refresh through the token cookies in
 * `src/services/tokenStore.js`, and `boot()` re-reads everything else.
 *
 * Two separate identity spaces coexist: `currentUser` for internal staff and
 * `customerUser` for external customers. Signing into one clears the other.
 */
export const useAppStore = create(
    (set, get) => ({
      /**
       * Empty until the API answers.
       *
       * These were seeded from `src/data/seed/*` before the backend existed. They are
       * now caches of server responses, so they start empty and every screen shows a
       * loading or empty state until its `load…()` resolves. Seeding them would put
       * fabricated rows on screen for the first few hundred milliseconds, which is
       * exactly the dummy data this integration removes.
       */
      users: [],
      usersMeta: null,
      teams: [],
      roles: [],
      directoryLoading: false,
      directoryError: null,
      customers: [],
      products: [],
      priceLists: [],
      warehouses: [],
      subscriptionPlans: [],
      upsellRules: [],
      quotations: [],
      invoices: [],
      creditNotes: [],
      // Audit is read-only: `auditLog` is the paginated platform screen, `auditByEntity`
      // is the trail shown under one quotation. Kept apart so a filter on the first
      // cannot evict the second.
      auditLog: [],
      auditByEntity: {},
      auditMeta: null,
      auditLoading: false,
      auditError: null,

      // Notifications are scoped to the caller server-side, so these rows are already
      // "mine" and nothing filters by currentUser. unreadCount comes from meta and
      // counts everything unread, not just what fits in the fetched limit.
      notifications: [],
      notificationUnreadCount: 0,
      notificationsLoading: false,

      // Alerts and KPIs are computed by the server on every read from live data, so
      // re-fetching IS the recompute. There is no local detector.
      alerts: [],
      alertsLoading: false,
      dealHealth: null,
      dealHealthLoading: false,
      dashboardError: null,

      // Customer portal. These hold the SERVER'S allow-list projection, keyed by
      // quotation reference — not internal quotations with fields removed.
      myQuotations: [],
      myQuotationViews: {},
      portalLoading: false,
      portalError: null,

      // Governance config — populated by loadDiscountConfig(), which no-ops for a rep.
      tierCeilings: {},
      categoryCeilings: {},
      approvalChain: [],
      dashboardConfig: {
        stallThresholdDays: 5,
        anomalySensitivity: 1.8,
        approvalSlaHours: 24,
      },

      // Server payloads cached per quotation id, filled by computeFulfillment()
      // and loadBilling(). Not derived here — these ARE the server's answers.
      fulfillmentPlans: {},
      billingViews: {},
      invoicesMeta: null,

      // ------------------------------------------------------- runtime flags
      isReloading: false,
      isBooted: false,
      lastReloadedAt: null,
      consolidationCandidates: [],

      // ------------------------------------------------------------- slices
      ...createAuditSlice(set, get),
      ...createNotificationSlice(set, get),
      ...createAuthSlice(set, get),
      ...createCatalogSlice(set, get),
      ...createConfigSlice(set, get),
      ...createDirectorySlice(set, get),
      ...createRiskSlice(set, get),
      ...createQuotationSlice(set, get),
      ...createFulfillmentSlice(set, get),
      ...createBillingSlice(set, get),
      ...createCustomerSlice(set, get),
      ...createDashboardSlice(set, get),

      /**
       * One-time boot: restore the session from the token cookie, then fetch whatever
       * that identity is actually allowed to read.
       */
      async boot() {
        if (get().isBooted) return;
        set({ isBooted: true });

        // Restore the signed-in session from the token cookie BEFORE anything else,
        // so guards and role-gated screens resolve on the first render instead of
        // flashing a redirect to /login.
        await get().restoreSession();

        // Nothing else is fetchable without a session, and every request would 401.
        if (!get().currentUser && !get().customerUser) return;

        await get().loadReferenceData();
      },

      /**
       * Fetch everything the workspace needs to render.
       *
       * Run in parallel because none of these depend on each other, and each swallows
       * its own failure — one 403 on governance config (which a sales_rep cannot read)
       * must not stop the catalogue from loading.
       */
      async loadReferenceData() {
        if (get().customerUser) {
          // A customer has no access to any internal collection — a staff route answers
          // a customer token with 403 WRONG_KIND. Their screens read from /customer/*
          // instead, so loading staff reference data here would fire a row of 403s.
          await get().loadMyQuotations();
          return { ok: true, portal: true };
        }

        await Promise.allSettled([
          get().loadProducts(),
          get().loadCustomers(),
          get().loadWarehouses(),
          get().loadSubscriptionPlans(),
          get().loadUpsellRules(),
          get().loadDiscountConfig(),
          get().loadDashboardConfig(),
          get().loadQuotations(),
          get().loadNotifications(),
          get().loadUsers(),
          get().loadTeams(),
        ]);
        return { ok: true };
      },

      /**
       * The "Reload Data" button.
       *
       * Alerts and risk scores are computed server-side on read, so this is a re-fetch
       * rather than a recompute — there is no client-side engine left to re-run.
       */
      async reloadData() {
        set({ isReloading: true });
        try {
          await get().loadReferenceData();
          if (get().currentUser) {
            get().invalidateRisk?.();
            await Promise.allSettled([get().loadAlerts(), get().loadDealHealth()]);
          }
          set({ lastReloadedAt: new Date().toISOString() });
          return { ok: true, alerts: get().alerts.length };
        } finally {
          set({ isReloading: false });
        }
      },
    }),
);
