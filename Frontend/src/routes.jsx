import { Navigate, Route, Routes } from 'react-router-dom';

import MarketingLayout from '@/layouts/MarketingLayout';
import WorkspaceLayout from '@/layouts/WorkspaceLayout';
import BackendLayout from '@/layouts/BackendLayout';
import PortalLayout from '@/layouts/PortalLayout';
import { RequireAuth, RequirePortalToken, RequireRole } from '@/guards/Guards';

import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Signup from '@/pages/Signup';
import { Forbidden, NotFound } from '@/pages/ErrorPages';

import Dashboard from '@/pages/workspace/Dashboard';
import Pipeline from '@/pages/workspace/Pipeline';
import Quotations from '@/pages/workspace/Quotations';
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
import UsersPage from '@/pages/backend/Users';
import AuditLog from '@/pages/backend/AuditLog';

import PortalLogin from '@/pages/portal/PortalLogin';
import PortalNegotiation from '@/pages/portal/PortalNegotiation';
import PortalConfirmed from '@/pages/portal/PortalConfirmed';

const BACKEND_ROLES = ['admin', 'sales_manager', 'finance'];

export default function AppRoutes() {
  return (
    <Routes>
      {/* ------------------------------------------------------- public */}
      <Route element={<MarketingLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/403" element={<Forbidden />} />
      </Route>

      {/* --------------------------------------------- internal workspace */}
      <Route element={<RequireAuth />}>
        <Route path="/app" element={<WorkspaceLayout />}>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="quotations" element={<Quotations />} />
          <Route path="quotations/new" element={<NewQuotation />} />
          <Route path="quotations/:id" element={<QuotationBuilder />} />
          <Route path="quotations/:id/approval" element={<QuotationApproval />} />
          <Route path="quotations/:id/fulfillment" element={<QuotationFulfillment />} />
          <Route path="quotations/:id/billing" element={<QuotationBilling />} />
          <Route path="quotations/:id/invoice" element={<QuotationInvoice />} />
          <Route path="reports" element={<Reports />} />

          {/* ----------------------------------- backend configuration */}
          <Route element={<RequireRole allow={BACKEND_ROLES} />}>
            <Route path="backend" element={<BackendLayout />}>
              <Route index element={<Navigate to="/app/backend/products" replace />} />
              <Route path="products" element={<Products />} />
              <Route path="discount-tiers" element={<DiscountTiers />} />
              <Route path="warehouses" element={<Warehouses />} />
              <Route path="subscriptions" element={<Subscriptions />} />
              <Route path="upsell-rules" element={<UpsellRules />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit-log" element={<AuditLog />} />
            </Route>
          </Route>
        </Route>
      </Route>

      {/* ------------------------------- customer portal (isolated shell) */}
      <Route element={<PortalLayout />}>
        <Route element={<RequirePortalToken />}>
          <Route path="/portal/:token" element={<PortalNegotiation />} />
          <Route path="/portal/:token/confirmed" element={<PortalConfirmed />} />
        </Route>
      </Route>

      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
