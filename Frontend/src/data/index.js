import { users, roleQuickPick } from './seed/users';
import { customers } from './seed/customers';
import { products } from './seed/products';
import { priceLists } from './seed/priceLists';
import { warehouses } from './seed/warehouses';
import { subscriptionPlans } from './seed/subscriptionPlans';
import { upsellRules } from './seed/upsellRules';
import { quotations } from './seed/quotations';
import { invoices, creditNotes } from './seed/invoices';
import { auditLog } from './seed/auditLog';
import {
  approvalChain,
  categoryCeilings,
  dashboardConfig,
  tierCeilings,
} from './seed/discountConfig';
import { clone } from '@/lib/utils';

/**
 * Assembles the initial application state.
 *
 * Returns a deep clone every time it is called so "Reset demo data" always gets
 * a pristine copy and runtime mutations can never leak back into the seed
 * modules. This function is the single seam a real backend would replace: swap
 * it for an async loader and nothing downstream changes.
 */
export function buildInitialState() {
  return {
    // --- catalog & directory
    users: clone(users),
    customers: clone(customers),
    products: clone(products),
    priceLists: clone(priceLists),

    // --- configuration
    tierCeilings: clone(tierCeilings),
    categoryCeilings: clone(categoryCeilings),
    approvalChain: clone(approvalChain),
    warehouses: clone(warehouses),
    subscriptionPlans: clone(subscriptionPlans),
    upsellRules: clone(upsellRules),
    dashboardConfig: clone(dashboardConfig),

    // --- transactional
    quotations: clone(quotations),
    invoices: clone(invoices),
    creditNotes: clone(creditNotes),
    auditLog: clone(auditLog),

    // --- derived / runtime caches (populated by store actions)
    fulfillmentPlans: {},
    billingSchedules: {},
    alerts: [],
    notifications: [],
  };
}

export { roleQuickPick };
