/**
 * Catalog and pricing — API-REFERENCE §6 (8 endpoints).
 *
 *   GET    /products              any staff · ?category=&active=&search=&page=&pageSize=
 *   GET    /products/:id          any staff
 *   POST   /products              admin
 *   PUT    /products/:id          admin · full replace, `sku` not accepted
 *   PATCH  /products/:id/active   admin · archive/restore, there is no DELETE
 *   POST   /products/:id/duplicate admin · copy starts ARCHIVED
 *   GET    /price-lists           any staff
 *   PUT    /price-lists           admin, sales_manager · upsert one tier/currency
 *
 * Every response here carries `costPrice`, so the whole module is staff-only. The
 * customer portal builds its projection in a different module entirely (§16), so
 * no cost can reach a customer through this path.
 *
 * Note the list filter is `search`, not `q` — `q` is the customers endpoint.
 */

import { api, buildQuery } from './apiClient';

export const CATEGORIES = ['hardware', 'service', 'subscription', 'accessories'];

/** @returns {Promise<{items: Array, meta: Object|null}>} */
export function listProducts({ category, active, search, page = 1, pageSize = 50 } = {}) {
  return api.list(`/products${buildQuery({ category, active, search, page, pageSize })}`);
}

/**
 * THE WHOLE CATALOGUE, not the first page of it.
 *
 * `pageSize` is capped at 200 server-side and the catalogue is larger than that, so a
 * single maximal request quietly returned a truncated list — and a product missing from
 * the builder's picker looks like a product that does not exist. The builder filters
 * client side, so it needs every row, not a page.
 *
 * @returns {Promise<{items: Array, meta: Object|null}>}
 */
export function listAllProducts({ category, active, search } = {}) {
  return api.listAll(
    ({ page, pageSize }) => `/products${buildQuery({ category, active, search, page, pageSize })}`,
    { pageSize: 200 },
  );
}

export function getProduct(productId) {
  return api.get(`/products/${encodeURIComponent(productId)}`);
}

/**
 * Create a product. Tier price rows are generated server-side on create (bronze =
 * list, silver −4%, gold −8%, rounded to the nearest 50) so it is immediately
 * quotable. `409 SKU_TAKEN` when the SKU exists.
 */
export function createProduct(payload) {
  return api.post('/products', payload);
}

/**
 * Full replace. Every field optional, but `sku` is rejected — quotations already
 * reference it. Variants are replaced wholesale, not diffed.
 */
export function updateProduct(productId, payload) {
  const body = { ...payload };
  // Sending it would earn a 400 rather than being ignored, so drop it here where
  // the reason can be explained once.
  delete body.sku;
  return api.put(`/products/${encodeURIComponent(productId)}`, body);
}

/** Archive or restore. There is no DELETE: historical lines must keep resolving. */
export function setProductActive(productId, active) {
  return api.patch(`/products/${encodeURIComponent(productId)}/active`, { active: Boolean(active) });
}

/** Copies product, variants and prices under a derived SKU. Copy starts archived. */
export function duplicateProduct(productId) {
  return api.post(`/products/${encodeURIComponent(productId)}/duplicate`);
}

/* ---------------------------------------------------------------- pricing */

/**
 * Tier pricing is NOT a discount — it is the starting price for that customer. A
 * rep's discount applies on top and is measured against the ceilings.
 */
export async function listPriceLists({ productId, tier, currency } = {}) {
  const data = await api.get(`/price-lists${buildQuery({ productId, tier, currency })}`);
  return Array.isArray(data) ? data : [];
}

/** Upsert one tier/currency price. Returns every price for that product. */
export function upsertPriceListEntry({ productId, tier, currency = 'INR', price }) {
  return api.put('/price-lists', { productId, tier, currency, price: Number(price) });
}

/**
 * Resolve the price a given tier pays, falling back to the product's base price.
 *
 * The server applies the same fallback when quoting: a missing price-list row must
 * not block a quotation, and quoting at list is the conservative direction.
 */
export function resolveTierPrice(product, tier, priceLists = []) {
  const entry = priceLists.find((p) => p.productId === product?.id && p.tier === tier);
  return entry ? Number(entry.price) : Number(product?.basePrice ?? 0);
}
