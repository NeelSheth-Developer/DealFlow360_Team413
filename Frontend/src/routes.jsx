import { Navigate, Route, Routes } from 'react-router-dom';

import MarketingLayout from '@/layouts/MarketingLayout';
import WorkspaceLayout from '@/layouts/WorkspaceLayout';
import BackendLayout from '@/layouts/BackendLayout';
import CustomerLayout from '@/layouts/CustomerLayout';
import {
  RedirectIfAuthenticated,
  RequireCustomerAuth,
  RequireRole,
  RequireStaffAuth,
} from '@/guards/Guards';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import ForgotPassword from '@/pages/ForgotPassword';
import { Forbidden, NotFound } from '@/pages/ErrorPages';

import Dashboard from '@/pages/workspace/Dashboard';
import Pipeline from '@/pages/workspace/Pipeline';
import Quotations from '@/pages/workspace/Quotations';
import Approvals from '@/pages/workspace/Approvals';
import NewQuotation from '@/pages/workspace/NewQuotation';
import QuotationBuilder from '@/pages/workspace/QuotationBuilder';
import QuotationApproval from '@/pages/workspace/QuotationApproval';
import QuotationFulfillment from '@/pages/workspace/QuotationFulfillment';
import QuotationBilling from '@/pages/workspace/QuotationBilling';
import QuotationInvoice from '@/pages/workspace/QuotationInvoice';
import Reports from '@/pages/workspace/Reports';

import Products from '@/pages/backend/Products';
import DiscountTiers from '@/pages/backend/DiscountTiers';
import Warehouses from '@/pages/backend/Warehouses';
import Subscriptions from '@/pages/backend/Subscriptions';
import UpsellRules from '@/pages/backend/UpsellRules';
import Directory from '@/pages/backend/Directory';
import AuditLog from '@/pages/backend/AuditLog';

import CustomerLogin from '@/pages/customer/CustomerLogin';
import CustomerSignup from '@/pages/customer/CustomerSignup';
import CustomerQuotations from '@/pages/customer/CustomerQuotations';
import CustomerQuotationDetail from '@/pages/customer/CustomerQuotationDetail';
import CustomerConfirmed from '@/pages/customer/CustomerConfirmed';

const BACKEND_ROLES = ['admin', 'sales_manager', 'finance'];

/**
 * The three roles the server lets past its governance and reporting routes.
 *
 * `GET /approvals/queue` (§12.5), `GET /reports/summary` and `GET /reports/products`
 * (§17.5, §17.6) all answer a sales_rep with 403, so both screens are gated here rather
 * than left to render a wall of failed requests.
 */
const APPROVER_ROLES = ['admin', 'sales_manager', 'finance'];

/**
 * Three separate route trees:
 *
 *   /            public marketing and staff auth
 *   /app/*       internal workspace, staff session required
 *   /customer/*  customer area, customer session required
 *
 * The two authenticated trees share no layout, no guard and no session.
 */
export default function AppRoutes() {
  return (
    <Routes>
      {/* ---------------------------------------------- public + staff auth */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <Login />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthenticated>
              <Signup />
            </RedirectIfAuthenticated>
          }
        />
        {/*
          Shared by both identity spaces. `?type=customer` targets the customer
          space; the default is staff. Not wrapped in RedirectIfAuthenticated so
          a signed-in user can still reset their password from a link.
        */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/403" element={<Forbidden />} />
      </Route>

      {/* ------------------------------------------------- customer auth */}
      <Route element={<MarketingLayout />}>
        <Route
          path="/customer/login"
          element={
            <RedirectIfAuthenticated>
              <CustomerLogin />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/customer/signup"
          element={
            <RedirectIfAuthenticated>
              <CustomerSignup />
            </RedirectIfAuthenticated>
          }
        />
      </Route>

      {/* ---------------------------------------------- customer area */}
      <Route element={<RequireCustomerAuth />}>
        <Route path="/customer" element={<CustomerLayout />}>
          <Route index element={<Navigate to="/customer/quotations" replace />} />
          <Route path="quotations" element={<CustomerQuotations />} />
          <Route path="quotations/:id" element={<CustomerQuotationDetail />} />
          <Route path="quotations/:id/confirmed" element={<CustomerConfirmed />} />
        </Route>
      </Route>

      {/* --------------------------------------------- internal workspace */}
      <Route element={<RequireStaffAuth />}>
        <Route path="/app" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="quotations" element={<Quotations />} />
          <Route element={<RequireRole allow={APPROVER_ROLES} />}>
            <Route path="approvals" element={<Approvals />} />
          </Route>
          <Route path="quotations/new" element={<NewQuotation />} />
          <Route path="quotations/:id" element={<QuotationBuilder />} />
          <Route path="quotations/:id/approval" element={<QuotationApproval />} />
          <Route path="quotations/:id/fulfillment" element={<QuotationFulfillment />} />
          <Route path="quotations/:id/billing" element={<QuotationBilling />} />
          <Route path="quotations/:id/invoice" element={<QuotationInvoice />} />
          {/* Same gate as the nav item — a rep reaching this by URL gets /403 rather
              than a screen of failed requests. */}
          <Route element={<RequireRole allow={APPROVER_ROLES} />}>
            <Route path="reports" element={<Reports />} />
          </Route>

          {/* --------------------------------- backend configuration */}
          <Route element={<RequireRole allow={BACKEND_ROLES} />}>
            <Route path="backend" element={<BackendLayout />}>
              <Route index element={<Navigate to="/app/backend/products" replace />} />
              <Route path="products" element={<Products />} />
              <Route path="discount-tiers" element={<DiscountTiers />} />
              <Route path="warehouses" element={<Warehouses />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="upsell-rules" element={<UpsellRules />} />
              <Route path="directory" element={<Directory />} />
              <Route path="audit-log" element={<AuditLog />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* Legacy token links now land on the customer sign-in. */}
      <Route path="/portal/*" element={<Navigate to="/customer/login" replace />} />

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
