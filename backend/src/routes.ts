import { Router } from 'express';
import { approvalsRouter } from './modules/approvals/approvals.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { billingRouter } from './modules/billing/billing.routes.js';
import { priceListsRouter, productsRouter } from './modules/catalog/catalog.routes.js';
import { configRouter } from './modules/config/config.routes.js';
import { customerTiersRouter, customersRouter } from './modules/customers/customers.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import {
  invoicePdfRouter,
  portalPdfRouter,
  quotationPdfRouter,
} from './modules/documents/documents.routes.js';
import { fulfillmentRouter } from './modules/fulfillment/fulfillment.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { invoicesRouter } from './modules/invoices/invoices.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { portalRouter } from './modules/portal/portal.routes.js';
import { quotationsRouter } from './modules/quotations/quotations.routes.js';
import { reportsRouter, teamsRouter } from './modules/reports/reports.routes.js';
import { riskRouter } from './modules/risk/risk.routes.js';
import { subscriptionPlansRouter } from './modules/subscriptions/subscriptions.routes.js';
import { upsellRouter } from './modules/upsell/upsell.routes.js';
import { rolesRouter } from './modules/users/roles.routes.js';
import { usersRouter } from './modules/users/users.routes.js';
import { warehousesRouter } from './modules/warehouses/warehouses.routes.js';

export const apiRouter = Router();

// --- Public / identity -----------------------------------------------------
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);

/**
 * The customer namespace, mounted FIRST.
 *
 * `/customer/*` and `/customers` are different surfaces with different guards, and
 * mounting the portal ahead of everything else keeps that separation obvious in the
 * one file where all the paths are visible together.
 */
apiRouter.use('/customer', portalPdfRouter);
apiRouter.use('/customer', portalRouter);

// --- Directory -------------------------------------------------------------
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/teams', teamsRouter);
apiRouter.use('/customers', customersRouter);
apiRouter.use('/customer-tiers', customerTiersRouter);

// --- Catalog & configuration -----------------------------------------------
apiRouter.use('/products', productsRouter);
apiRouter.use('/price-lists', priceListsRouter);
apiRouter.use('/config', configRouter);
apiRouter.use('/warehouses', warehousesRouter);
apiRouter.use('/subscription-plans', subscriptionPlansRouter);
apiRouter.use('/upsell-rules', upsellRouter);

// --- Governance ------------------------------------------------------------
apiRouter.use('/risk', riskRouter);
apiRouter.use('/approvals', approvalsRouter);

/**
 * Fulfillment and billing are mounted UNDER the quotations path because every one of
 * their routes is addressed by quotation. They are separate routers with
 * `mergeParams: true` rather than more handlers on `quotationsRouter`, so each module
 * keeps its own guards and its own file.
 *
 * Mounted before `/quotations` itself: Express matches in declaration order, and
 * `quotationsRouter` has a `/:id` that would otherwise swallow `/:id/fulfillment`.
 */
apiRouter.use('/quotations/:id/pdf', quotationPdfRouter);
apiRouter.use('/quotations/:id/fulfillment', fulfillmentRouter);
apiRouter.use('/quotations/:id', billingRouter);
apiRouter.use('/quotations', quotationsRouter);

// --- Money -----------------------------------------------------------------
apiRouter.use('/invoices/:id/pdf', invoicePdfRouter);
apiRouter.use('/invoices', invoicesRouter);

// --- Observability ---------------------------------------------------------
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/audit-log', auditRouter);
apiRouter.use('/notifications', notificationsRouter);
