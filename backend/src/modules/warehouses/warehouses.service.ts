import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { backorders, products, quotations, warehouseStock, warehouses } from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { money, num, round2 } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import type {
  CreateWarehouseInput,
  SplitOrderInput,
  UpdateStockInput,
  UpdateWarehouseInput,
} from './warehouses.schemas.js';

/**
 * Warehouses, stock levels and replenishment.
 *
 * `shippingCostWeight` is the multiplier the split algorithm uses as its cost
 * tie-breaker — a higher weight means the system prefers to ship from elsewhere. The
 * algorithm itself lives in `lib/allocation.ts`; this module owns the data it reads.
 */

export async function listWarehouses() {
  const rows = await db.select().from(warehouses).orderBy(asc(warehouses.name));
  const stock = await stockFor(rows.map((row) => row.id));
  return rows.map((row) => present(row, stock.get(row.id) ?? {}));
}

export async function getWarehouse(id: string) {
  const [row] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!row) throw ApiError.notFound('Warehouse not found');

  const stock = await stockFor([id]);
  return present(row, stock.get(id) ?? {});
}

export async function createWarehouse(actor: AuditActor, input: CreateWarehouseInput) {
  let created: (typeof warehouses.$inferSelect) | undefined;
  try {
    [created] = await db
      .insert(warehouses)
      .values({
        name: input.name,
        location: input.location,
        shippingCostWeight: input.shippingCostWeight.toFixed(2),
        baseShipCost: money(input.baseShipCost),
        replenishThreshold: input.replenishThreshold,
        replenishQty: input.replenishQty,
        replenishLeadDays: input.replenishLeadDays,
      })
      .returning();
  } catch (err: unknown) {
    if (isDuplicateWarehouseName(err)) {
      throw ApiError.conflict('WAREHOUSE_NAME_TAKEN', `A warehouse named "${input.name}" already exists`);
    }
    throw err;
  }

  if (!created) throw ApiError.notFound('Warehouse not found');

  await audit({
    entityType: 'warehouse',
    entityId: created.id,
    action: `Warehouse created: ${created.name}`,
    actor,
  });

  return getWarehouse(created.id);
}

export async function updateWarehouse(actor: AuditActor, id: string, input: UpdateWarehouseInput) {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Warehouse not found');

  try {
    await db
      .update(warehouses)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.shippingCostWeight !== undefined
          ? { shippingCostWeight: input.shippingCostWeight.toFixed(2) }
          : {}),
        ...(input.baseShipCost !== undefined ? { baseShipCost: money(input.baseShipCost) } : {}),
        ...(input.replenishThreshold !== undefined
          ? { replenishThreshold: input.replenishThreshold }
          : {}),
        ...(input.replenishQty !== undefined ? { replenishQty: input.replenishQty } : {}),
        ...(input.replenishLeadDays !== undefined
          ? { replenishLeadDays: input.replenishLeadDays }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      })
      .where(eq(warehouses.id, id));
  } catch (err: unknown) {
    if (isDuplicateWarehouseName(err)) {
      throw ApiError.conflict('WAREHOUSE_NAME_TAKEN', `A warehouse named "${input.name}" already exists`);
    }
    throw err;
  }

  await audit({
    entityType: 'warehouse',
    entityId: id,
    action: `Warehouse updated: ${existing.name}`,
    actor,
    meta: { changed: Object.keys(input) },
  });

  return getWarehouse(id);
}

/**
 * Bulk stock update.
 *
 * Returns `affectedQuotationIds` alongside the warehouse: a stock increase can make an
 * existing backorder fillable, and without that list the consolidation prompt on the
 * fulfillment screen has nothing to fire on.
 */
export async function updateStock(actor: AuditActor, id: string, input: UpdateStockInput) {
  const [existing] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Warehouse not found');

  const productIds = Object.keys(input.stock);
  if (productIds.length === 0) {
    return { warehouse: await getWarehouse(id), affectedQuotationIds: [] };
  }

  const known = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds));

  const knownIds = new Set(known.map((row) => row.id));
  const unknown = productIds.filter((productId) => !knownIds.has(productId));
  if (unknown.length > 0) {
    throw ApiError.badRequest('VALIDATION_FAILED', 'Unknown product id in the stock map', {
      unknown,
    });
  }

  const before = await stockFor([id]);
  const previous = before.get(id) ?? {};

  for (const [productId, qty] of Object.entries(input.stock)) {
    await db
      .insert(warehouseStock)
      .values({ warehouseId: id, productId, qty })
      .onConflictDoUpdate({
        target: [warehouseStock.warehouseId, warehouseStock.productId],
        set: { qty, updatedAt: new Date() },
      });
  }

  const raised = productIds.filter(
    (productId) => (input.stock[productId] ?? 0) > (previous[productId] ?? 0),
  );
  const affectedQuotationIds = await quotationsAwaiting(raised);

  await audit({
    entityType: 'warehouse',
    entityId: id,
    action: `Stock updated at ${existing.name}`,
    actor,
    meta: { from: previous, to: input.stock, affectedQuotationIds },
  });

  return { warehouse: await getWarehouse(id), affectedQuotationIds };
}

/**
 * Applies `replenishQty` to every product at or below `replenishThreshold`.
 *
 * An ops convenience that makes the backorder-consolidation path reproducible on
 * demand rather than only when real stock happens to arrive.
 */
export async function restock(actor: AuditActor, id: string) {
  const [warehouse] = await db.select().from(warehouses).where(eq(warehouses.id, id)).limit(1);
  if (!warehouse) throw ApiError.notFound('Warehouse not found');

  const low = await db
    .select({ productId: warehouseStock.productId, qty: warehouseStock.qty })
    .from(warehouseStock)
    .where(
      and(
        eq(warehouseStock.warehouseId, id),
        lte(warehouseStock.qty, warehouse.replenishThreshold),
      ),
    );

  if (low.length === 0 || warehouse.replenishQty === 0) {
    return { restocked: 0, warehouseName: warehouse.name, affectedQuotationIds: [] };
  }

  await db
    .update(warehouseStock)
    .set({ qty: sql`${warehouseStock.qty} + ${warehouse.replenishQty}`, updatedAt: new Date() })
    .where(
      and(
        eq(warehouseStock.warehouseId, id),
        lte(warehouseStock.qty, warehouse.replenishThreshold),
      ),
    );

  const affectedQuotationIds = await quotationsAwaiting(low.map((row) => row.productId));

  await audit({
    entityType: 'warehouse',
    entityId: id,
    action: `Replenishment applied at ${warehouse.name}`,
    actor,
    meta: { restocked: low.length, qtyEach: warehouse.replenishQty, affectedQuotationIds },
  });

  return { restocked: low.length, warehouseName: warehouse.name, affectedQuotationIds };
}

/**
 * Quotations with an unresolved backorder on any of these products — the ones whose
 * consolidation prompt should now light up.
 */
/**
 * Greedy warehouse split for a confirmed order.
 *
 * 1. If one warehouse can cover every line → single shipment.
 * 2. Otherwise fill greedily, cheapest `shippingCostWeight` first.
 * 3. Anything left after all warehouses exhausted → backorder.
 */
export async function splitOrder(input: SplitOrderInput) {
  const allWarehouses = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.active, true));

  const stockMap = await stockFor(allWarehouses.map((w) => w.id));

  const whs = allWarehouses
    .map((w) => ({
      id: w.id,
      name: w.name,
      shippingCostWeight: num(w.shippingCostWeight),
      baseShipCost: num(w.baseShipCost),
      stock: stockMap.get(w.id) ?? {},
    }))
    .sort((a, b) => a.shippingCostWeight * a.baseShipCost - b.shippingCostWeight * b.baseShipCost);

  const lines = input.order_lines;

  // 1. Single-warehouse fast path
  for (const wh of whs) {
    if (lines.every((l) => (wh.stock[l.product_id] ?? 0) >= l.qty)) {
      return {
        allocation: lines.map((l) => ({ warehouse_id: wh.id, product_id: l.product_id, qty: l.qty })),
        backorder: [],
        shipment_count: 1,
        estimated_cost: round2(wh.shippingCostWeight * wh.baseShipCost),
      };
    }
  }

  // 2. Greedy fill
  const remaining: Record<string, number> = {};
  for (const l of lines) remaining[l.product_id] = l.qty;

  const allocation: { warehouse_id: string; product_id: string; qty: number }[] = [];
  const usedWarehouses = new Set<string>();

  for (const wh of whs) {
    const shelf = { ...wh.stock };
    for (const productId of Object.keys(remaining)) {
      const needed = remaining[productId] ?? 0;
      if (needed <= 0) continue;
      const take = Math.min(shelf[productId] ?? 0, needed);
      if (take > 0) {
        allocation.push({ warehouse_id: wh.id, product_id: productId, qty: take });
        remaining[productId] = needed - take;
        usedWarehouses.add(wh.id);
      }
    }
  }

  // 3. Backorder
  const backorder = Object.entries(remaining)
    .filter(([, qty]) => qty > 0)
    .map(([product_id, qty]) => ({ product_id, qty }));

  const estimated_cost = round2(
    [...usedWarehouses].reduce((sum, id) => {
      const wh = whs.find((w) => w.id === id);
      return sum + (wh ? wh.shippingCostWeight * wh.baseShipCost : 0);
    }, 0),
  );

  return { allocation, backorder, shipment_count: usedWarehouses.size, estimated_cost };
}

function isDuplicateWarehouseName(err: unknown): boolean {
  const containsKey = (e: unknown): boolean =>
    typeof e === 'object' &&
    e !== null &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string' &&
    (e as { message: string }).message.includes('warehouses_name_key');

  if (containsKey(err)) return true;
  // DrizzleQueryError wraps the original NeonDbError in `cause`
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    return containsKey((err as { cause: unknown }).cause);
  }
  return false;
}

async function quotationsAwaiting(productIds: string[]): Promise<string[]> {
  if (productIds.length === 0) return [];

  const rows = await db
    .selectDistinct({ quotationId: backorders.quotationId })
    .from(backorders)
    .innerJoin(quotations, eq(quotations.id, backorders.quotationId))
    .where(
      and(
        inArray(backorders.productId, productIds),
        sql`${backorders.resolvedAt} IS NULL`,
        inArray(quotations.stage, ['approved', 'fulfillment']),
      ),
    );

  return rows.map((row) => row.quotationId);
}

async function stockFor(warehouseIds: string[]) {
  const map = new Map<string, Record<string, number>>();
  if (warehouseIds.length === 0) return map;

  const rows = await db
    .select()
    .from(warehouseStock)
    .where(inArray(warehouseStock.warehouseId, warehouseIds));

  for (const row of rows) {
    const shelf = map.get(row.warehouseId) ?? {};
    shelf[row.productId] = row.qty;
    map.set(row.warehouseId, shelf);
  }

  return map;
}

function present(
  row: {
    id: string;
    name: string;
    location: string | null;
    shippingCostWeight: string;
    baseShipCost: string;
    replenishThreshold: number;
    replenishQty: number;
    replenishLeadDays: number;
    active: boolean;
  },
  stock: Record<string, number>,
) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    shippingCostWeight: num(row.shippingCostWeight),
    baseShipCost: num(row.baseShipCost),
    replenishThreshold: row.replenishThreshold,
    replenishQty: row.replenishQty,
    replenishLeadDays: row.replenishLeadDays,
    active: row.active,
    stock,
    totalUnits: round2(Object.values(stock).reduce((sum, qty) => sum + qty, 0)),
  };
}
