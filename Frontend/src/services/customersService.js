/**
 * Customers — API-REFERENCE §4 (3 of the 5; the two tier-ceiling routes live in
 * configService because they configure a TIER, not a customer).
 *
 *   GET   /customers            any staff · ?q=&tier=&page=&pageSize=
 *   GET   /customers/:id        any staff
 *   PATCH /customers/:id/tier   admin, sales_manager
 *
 * Staff only — a customer token gets 403 WRONG_KIND, because the portal is a
 * separate surface with a much narrower shape (§16).
 *
 * There is NO POST (customers self-register through /auth/signup) and NO DELETE (a
 * customer with quotations against them must keep resolving).
 */

import { api, buildQuery } from './apiClient';

/**
 * `q` is OPTIONAL. With no term this lists the directory newest-first, so a customer
 * picker can browse as well as search.
 *
 * A `DF-CMC827`-style reference is matched EXACTLY and returns at most one row —
 * that is the intended path when a customer reads their id down a phone. Anything
 * else is a partial match on name, contact name and email.
 *
 * @returns {Promise<{items: Array, meta: Object|null}>}
 */
export function listCustomers({ q, tier, page = 1, pageSize = 25 } = {}) {
  return api.list(`/customers${buildQuery({ q, tier, page, pageSize })}`);
}

/**
 * The whole customer book. `pageSize` caps at 100 server-side, so anything past the
 * hundredth customer was invisible to the picker and to the tier screen.
 *
 * @returns {Promise<{items: Array, meta: Object|null}>}
 */
export function listAllCustomers({ q, tier } = {}) {
  return api.listAll(({ page, pageSize }) => `/customers${buildQuery({ q, tier, page, pageSize })}`, {
    pageSize: 100,
  });
}

/** One customer including `quotationCount`. 404 when unknown. */
export function getCustomer(customerId) {
  return api.get(`/customers/${encodeURIComponent(customerId)}`);
}

/**
 * Look a customer up by email, or by their DF-… reference.
 *
 * There is no dedicated by-email route in the reference, so this uses the search
 * form of §4.1 and then confirms an exact match client-side — a partial search on
 * `buyer@acme…` could otherwise return a different row that merely contains it.
 *
 * @returns {Promise<Object|null>} null when nothing matches, which is an expected
 *   answer rather than an error.
 */
export async function findCustomerByEmail(email) {
  const term = String(email ?? '').trim().toLowerCase();
  if (!term) return null;

  const { items } = await listCustomers({ q: term, pageSize: 10 });

  const exact = items.find(
    (c) =>
      String(c.email ?? '').toLowerCase() === term ||
      String(c.customerId ?? '').toLowerCase() === term,
  );
  return exact ?? items[0] ?? null;
}

/**
 * The ONE mutation allowed on a customer record.
 *
 * It is commercial configuration, not account data: it moves the starting price on
 * every future quotation and one half of the binding discount ceiling.
 *
 * Existing quotations are NOT rewritten — each snapshots its tier at creation, so an
 * approval already given cannot be invalidated by a later tier change.
 */
export function setCustomerTier(customerId, tier) {
  return api.patch(`/customers/${encodeURIComponent(customerId)}/tier`, { tier });
}
