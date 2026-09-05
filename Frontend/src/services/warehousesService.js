/**
 * Warehouses and stock — API-REFERENCE §7 (6 endpoints).
 *
 *   GET  /warehouses               any staff
 *   GET  /warehouses/:id           any staff
 *   POST /warehouses               admin, finance
 *   PUT  /warehouses/:id           admin, finance · + `active`
 *   PUT  /warehouses/:id/stock     admin, finance · PARTIAL map
 *   POST /warehouses/:id/restock   admin, finance
 *
 * `shippingCostWeight` is the split algorithm's cost tie-breaker: a HIGHER weight
 * means the system prefers to ship from elsewhere. Its floor is 0.1, not 0 — a
 * weight of zero makes a warehouse free to ship from and collapses the whole
 * ordering onto that one site.
 */

import { api } from './apiClient';

export const SHIPPING_WEIGHT_FLOOR = 0.1;

export async function listWarehouses() {
  const data = await api.get('/warehouses');
  return Array.isArray(data) ? data : [];
}

export function getWarehouse(warehouseId) {
  return api.get(`/warehouses/${encodeURIComponent(warehouseId)}`);
}

export function createWarehouse(payload) {
  return api.post('/warehouses', normaliseWeight(payload));
}

/** Same body as create, every field optional, plus `active`. */
export function updateWarehouse(warehouseId, payload) {
  return api.put(`/warehouses/${encodeURIComponent(warehouseId)}`, normaliseWeight(payload));
}

function normaliseWeight(payload = {}) {
  if (payload.shippingCostWeight === undefined) return payload;
  return {
    ...payload,
    shippingCostWeight: Math.max(SHIPPING_WEIGHT_FLOOR, Number(payload.shippingCostWeight)),
  };
}

/**
 * Set stock levels.
 *
 * The map is PARTIAL — only the products being changed. Absent keys are left alone
 * rather than zeroed, so a client that knows about one product cannot wipe the rest.
 *
 * @returns {Promise<{warehouse: Object, affectedQuotationIds: string[]}>}
 *   `affectedQuotationIds` lists open backorders this stock increase could now
 *   fill. It is what the fulfillment screen's consolidation prompt fires on.
 */
export function setStock(warehouseId, stock) {
  return api.put(`/warehouses/${encodeURIComponent(warehouseId)}/stock`, { stock });
}

/**
 * Applies `replenishQty` to every product at or below `replenishThreshold`.
 *
 * @returns {Promise<{restocked: number, warehouseName: string, affectedQuotationIds: string[]}>}
 */
export function restock(warehouseId) {
  return api.post(`/warehouses/${encodeURIComponent(warehouseId)}/restock`);
}

/**
 * Availability of one product across the network, derived from the warehouse list.
 *
 * There is no dedicated stock-signal endpoint, so this computes the green / amber /
 * red dot the catalog picker shows from the `stock` maps already returned by §7.1.
 */
export function stockSignal(productId, qtyWanted, warehouses = []) {
  const active = warehouses.filter((w) => w.active !== false);
  const total = active.reduce((sum, w) => sum + (Number(w.stock?.[productId]) || 0), 0);
  const wanted = Math.max(1, Number(qtyWanted) || 1);

  let level = 'backorder';
  if (total >= wanted) level = 'in_stock';
  else if (total > 0) level = 'partial';

  return { level, total, wanted, warehouseCount: active.length };
}
