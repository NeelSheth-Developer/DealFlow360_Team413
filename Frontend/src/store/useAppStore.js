import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildInitialState } from '@/data';
import { createAuditSlice } from './slices/auditSlice';
import { createNotificationSlice } from './slices/notificationSlice';
import { createAuthSlice } from './slices/authSlice';
import { createCatalogSlice } from './slices/catalogSlice';
import { createConfigSlice } from './slices/configSlice';
import { createRiskSlice } from './slices/riskSlice';
import { createQuotationSlice } from './slices/quotationSlice';
import { createFulfillmentSlice } from './slices/fulfillmentSlice';
import { createBillingSlice } from './slices/billingSlice';
import { createCustomerSlice } from './slices/customerSlice';
import { createDashboardSlice } from './slices/dashboardSlice';

const PERSIST_KEY = 'dealflow360';
const PERSIST_VERSION = 2;

/**
 * The single application store.
 *
 * Business data lives here. Discount risk scoring does NOT — that is fetched
 * from the backend through `src/services/riskService.js` and cached in
 * `riskCache` by the risk slice, so the UI always renders a server-decided
 * score rather than one it invented.
 *
 * Two separate identity spaces coexist: `currentUser` for internal staff and
 * `customerUser` for external customers. Signing into one clears the other.
 */
export const useAppStore = create(
  persist(
    (set, get) => ({
      // ------------------------------------------------------- seeded state
      ...buildInitialState(),

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
      ...createRiskSlice(set, get),
      ...createQuotationSlice(set, get),
      ...createFulfillmentSlice(set, get),
      ...createBillingSlice(set, get),
      ...createCustomerSlice(set, get),
      ...createDashboardSlice(set, get),

      /**
       * One-time boot: builds fulfillment plans and billing schedules for
       * quotations already past approval, fetches risk scores for everything,
       * then runs anomaly detection. Doing this at boot rather than baking
       * results into the seed keeps backorder ETAs and stall counters accurate
       * relative to today.
       */
      async boot() {
        if (get().isBooted) return;
        set({ isBooted: true });

        get().refreshFulfillmentPlans();
        for (const quote of get().quotations) {
          if (['fulfillment', 'billed', 'confirmed'].includes(quote.stage)) {
            get().buildBilling(quote.id);
          }
        }

        await get().refreshAllRisks();
        get().recomputeAlerts();
      },

      /** Wipes persisted state and re-seeds. Exposed in the user menu. */
      async resetDemoData() {
        const fresh = buildInitialState();
        set({
          ...fresh,
          currentUser: get().currentUser,
          customerUser: get().customerUser,
          riskCache: {},
          isBooted: false,
          isReloading: false,
          lastReloadedAt: null,
          consolidationCandidates: [],
        });
        await get().boot();
      },
    }),
    {
      name: PERSIST_KEY,
      version: PERSIST_VERSION,
      storage: {
        getItem: (name) => {
          try {
            const value = sessionStorage.getItem(name);
            return value ? JSON.parse(value) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, JSON.stringify(value));
          } catch {
            // Storage full or blocked. The app still works, it just won't
            // survive a refresh — not worth interrupting the user over.
          }
        },
        removeItem: (name) => {
          try {
            sessionStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      },
      // Only data is persisted, never functions. Risk scores are intentionally
      // excluded: they are the server's answer and get refetched on boot.
      partialize: (state) => ({
        currentUser: state.currentUser,
        customerUser: state.customerUser,
        users: state.users,
        customers: state.customers,
        products: state.products,
        priceLists: state.priceLists,
        tierCeilings: state.tierCeilings,
        categoryCeilings: state.categoryCeilings,
        approvalChain: state.approvalChain,
        warehouses: state.warehouses,
        subscriptionPlans: state.subscriptionPlans,
        upsellRules: state.upsellRules,
        dashboardConfig: state.dashboardConfig,
        quotations: state.quotations,
        invoices: state.invoices,
        creditNotes: state.creditNotes,
        auditLog: state.auditLog,
        notifications: state.notifications,
      }),
      // Rehydrated data needs its derived caches rebuilt.
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isBooted = false;
          state.riskCache = {};
        }
      },
    },
  ),
);
