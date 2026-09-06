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

/**
 * The exact keys the schema accepts. WHITELISTED, not blacklisted — the editors seed
 * their forms from the server's own object, so `id`, `active`, `createdAt` and anything
 * else the API returns would otherwise be echoed back into a `.strict()` body and earn
 * `400 FIELD_NOT_ALLOWED`.
 */
function pick(source = {}, keys) {
  const out = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const WAREHOUSE_KEYS = [
  'name',
  'location',
  'shippingCostWeight',
  'baseShipCost',
  'replenishThreshold',
  'replenishQty',
  'replenishLeadDays',
];
// `updateWarehouseSchema` extends the create shape with `active`; create does not take it.
const WAREHOUSE_UPDATE_KEYS = [...WAREHOUSE_KEYS, 'active'];


export const SHIPPING_WEIGHT_FLOOR = 0.1;

export async function listWarehouses() {
  const data = await api.get('/warehouses');
  return Array.isArray(data) ? data : [];
}

export function getWarehouse(warehouseId) {
  return api.get(`/warehouses/${encodeURIComponent(warehouseId)}`);
}

export function createWarehouse(payload) {
  return api.post('/warehouses', pick(normaliseWeight(payload), WAREHOUSE_KEYS));
}

/** Same body as create, every field optional, plus `active`. */
export function updateWarehouse(warehouseId, payload) {
  return api.put(
    `/warehouses/${encodeURIComponent(warehouseId)}`,
    pick(normaliseWeight(payload), WAREHOUSE_UPDATE_KEYS),
  );
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

/* --------------------------------------------------------- stateless split */

/**
 * `POST /warehouses/split` — allocate an arbitrary basket across warehouses.
 *
 * HOW IT DIFFERS FROM `GET /quotations/:id/fulfillment`:
 *
 *   · IT NEEDS NO QUOTATION. It takes bare `{ product_id, qty }` pairs, so a basket that
 *     has not been saved — or is not a quotation at all — can be costed. The §13 route
 *     answers only for a stored quotation and additionally carries the accept/override
 *     state that quotation has.
 *   · IT IS ADVISORY. Nothing is persisted, no stage moves, and it does not respect an
 *     override a rep has already accepted on a real order. So it previews; §13 decides.
 *
 * The algorithm is the same shape as §13's: active warehouses only, cheapest
 * `shippingCostWeight` first, a single-warehouse fast path when one depot can cover the
 * whole basket, then a greedy fill, with whatever cannot be met falling to backorder.
 *
 * Request and response are snake_case — the only two routes in the API that are — so
 * both are translated here rather than letting a second naming convention reach a
 * component.
 *
 * @param lines [{ productId, qty }]
 * @returns {Promise<{allocations, backorders, shipmentCount, estimatedCost}>}
 *   `allocations` is `{ warehouseId, productId, qty }`, matching the field names §13.1
 *   already uses, so the same table can render either source.
 */
export async function splitOrder(lines = []) {
  const orderLines = lines
    .map((l) => ({ product_id: l.productId ?? l.product_id, qty: Number(l.qty) || 0 }))
    .filter((l) => l.product_id && l.qty > 0);

  // The schema requires at least one line, so an empty basket is answered locally
  // rather than sent off to earn a 400.
  if (orderLines.length === 0) {
    return { allocations: [], backorders: [], shipmentCount: 0, estimatedCost: 0 };
  }

  const raw = await api.post('/warehouses/split', { order_lines: orderLines });

  return {
    allocations: (raw?.allocation ?? []).map((a) => ({
      warehouseId: a.warehouse_id,
      productId: a.product_id,
      qty: Number(a.qty) || 0,
    })),
    backorders: (raw?.backorder ?? []).map((b) => ({
      productId: b.product_id,
      qty: Number(b.qty) || 0,
    })),
    shipmentCount: Number(raw?.shipment_count) || 0,
    estimatedCost: Number(raw?.estimated_cost) || 0,
  };
}
