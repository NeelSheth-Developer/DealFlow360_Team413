import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { buildInitialState } from '@/data';
import { createAuditSlice } from './slices/auditSlice';
import { createNotificationSlice } from './slices/notificationSlice';
import { createAuthSlice } from './slices/authSlice';
import { createCatalogSlice } from './slices/catalogSlice';
import { createConfigSlice } from './slices/configSlice';
import { createQuotationSlice } from './slices/quotationSlice';
import { createFulfillmentSlice } from './slices/fulfillmentSlice';
import { createBillingSlice } from './slices/billingSlice';
import { createPortalSlice } from './slices/portalSlice';
import { createDashboardSlice } from './slices/dashboardSlice';

const PERSIST_KEY = 'dealflow360';
const PERSIST_VERSION = 1;

/**
 * The single application store. In this build it *is* the backend: seed data in,
 * real business logic in the middle, UI reading derived selectors out.
 *
 * Swapping in a real API later is a contained change — replace the bodies of the
 * slice actions with HTTP calls and keep their names and signatures. No component
 * talks to data directly, so nothing in the UI has to change.
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
      ...createQuotationSlice(set, get),
      ...createFulfillmentSlice(set, get),
      ...createBillingSlice(set, get),
      ...createPortalSlice(set, get),
      ...createDashboardSlice(set, get),

      /**
       * One-time boot: builds fulfillment plans and billing schedules for
       * quotations that are already past approval, then runs anomaly detection.
       * Doing this at boot (rather than baking results into the seed) keeps
       * backorder ETAs and stall counters accurate relative to today.
       */
      boot() {
        if (get().isBooted) return;
        get().refreshFulfillmentPlans();
        for (const quote of get().quotations) {
          if (['fulfillment', 'billed', 'confirmed'].includes(quote.stage)) {
            get().buildBilling(quote.id);
          }
        }
        get().recomputeAlerts();
        set({ isBooted: true });
      },

      /** Wipes persisted state and re-seeds. Exposed in the user menu. */
      resetDemoData() {
        const fresh = buildInitialState();
        set({
          ...fresh,
          currentUser: get().currentUser,
          isBooted: false,
          isReloading: false,
          lastReloadedAt: null,
          consolidationCandidates: [],
        });
        get().boot();
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
            // Storage full or blocked — the app still works, it just won't
            // survive a refresh. Not worth interrupting the user over.
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
      // Only persist data, never functions. Derived caches are rebuilt on boot.
      partialize: (state) => ({
        currentUser: state.currentUser,
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
        if (state) state.isBooted = false;
      },
    },
  ),
);
