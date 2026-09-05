import { addDays, formatDate } from './billing-math.js';
import { num, round2 } from './money.js';

/**
 * Multi-warehouse fulfillment splitting.
 *
 * The ordering below is explained to users on the warehouse configuration screen, so
 * it has to be the ordering the code actually uses:
 *
 *   1. Prefer a warehouse that can fulfil the ENTIRE line — fewer shipments.
 *   2. Then a warehouse already shipping something else on this order — consolidation.
 *   3. Then the lowest `shippingCostWeight` — cheapest.
 *   4. Then the most stock — avoid fragmenting what is left.
 *   5. Anything unallocated becomes a backorder, with an ETA from the shortest
 *      `replenishLeadDays` among warehouses that stock the product.
 *
 * Subscription and service lines are skipped entirely: there is nothing physical to
 * ship, and allocating them would inflate the shipment count and its cost.
 */

export type AllocatableLine = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  qty: number;
};

export type WarehouseView = {
  id: string;
  name: string;
  shippingCostWeight: number;
  baseShipCost: number;
  replenishLeadDays: number;
  /** productId -> qty on hand */
  stock: Record<string, number>;
};

export type Allocation = { lineId: string; warehouseId: string; qty: number };

export type Backorder = {
  lineId: string;
  productId: string;
  productName: string;
  qty: number;
  etaDate: string | null;
};

export type SplitResult = {
  allocations: Allocation[];
  backorders: Backorder[];
  shipmentCount: number;
  estimatedCost: number;
  warehousesUsed: string[];
};

/** Only physical goods ship. */
export function isShippable(category: string): boolean {
  return category !== 'subscription' && category !== 'service';
}

/**
 * Computes the split. Pure — it takes a snapshot of stock and never writes, so the
 * same function serves both the live suggestion and a what-if preview.
 *
 * `stock` is copied before use: the algorithm decrements as it allocates so a second
 * line cannot be promised units the first already took, and mutating the caller's
 * object to achieve that would be a trap.
 */
export function computeSplit(lines: AllocatableLine[], warehouses: WarehouseView[]): SplitResult {
  const remaining = new Map<string, Record<string, number>>();
  for (const warehouse of warehouses) {
    remaining.set(warehouse.id, { ...warehouse.stock });
  }

  const allocations: Allocation[] = [];
  const backorders: Backorder[] = [];
  const used = new Set<string>();

  for (const line of lines.filter((line) => isShippable(line.category))) {
    let outstanding = line.qty;

    while (outstanding > 0) {
      const candidates = warehouses
        .map((warehouse) => ({
          warehouse,
          available: remaining.get(warehouse.id)?.[line.productId] ?? 0,
        }))
        .filter((candidate) => candidate.available > 0);

      if (candidates.length === 0) break;

      candidates.sort((a, b) => {
        // 1. can it cover the whole outstanding amount?
        const aWhole = a.available >= outstanding ? 0 : 1;
        const bWhole = b.available >= outstanding ? 0 : 1;
        if (aWhole !== bWhole) return aWhole - bWhole;

        // 2. already shipping on this order?
        const aUsed = used.has(a.warehouse.id) ? 0 : 1;
        const bUsed = used.has(b.warehouse.id) ? 0 : 1;
        if (aUsed !== bUsed) return aUsed - bUsed;

        // 3. cheapest
        if (a.warehouse.shippingCostWeight !== b.warehouse.shippingCostWeight) {
          return a.warehouse.shippingCostWeight - b.warehouse.shippingCostWeight;
        }

        // 4. most stock
        return b.available - a.available;
      });

      const best = candidates[0];
      if (!best) break;

      const take = Math.min(outstanding, best.available);
      allocations.push({ lineId: line.id, warehouseId: best.warehouse.id, qty: take });
      used.add(best.warehouse.id);

      const shelf = remaining.get(best.warehouse.id);
      if (shelf) shelf[line.productId] = (shelf[line.productId] ?? 0) - take;
      outstanding -= take;
    }

    if (outstanding > 0) {
      backorders.push({
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        qty: outstanding,
        etaDate: etaFor(line.productId, warehouses),
      });
    }
  }

  const warehousesUsed = [...used];
  const estimatedCost = warehousesUsed.reduce((total, id) => {
    const warehouse = warehouses.find((w) => w.id === id);
    if (!warehouse) return total;
    return total + warehouse.baseShipCost * warehouse.shippingCostWeight;
  }, 0);

  return {
    allocations,
    backorders,
    shipmentCount: warehousesUsed.length,
    estimatedCost: round2(estimatedCost),
    warehousesUsed,
  };
}

/**
 * The soonest a backordered product could arrive: the shortest replenishment lead time
 * among warehouses that carry the product at all.
 *
 * A warehouse that has never stocked it is excluded — its lead time says nothing about
 * when this product will land. When no warehouse carries it, there is no honest date
 * to give, so the ETA is null rather than a guess.
 */
function etaFor(productId: string, warehouses: WarehouseView[]): string | null {
  const leads = warehouses
    .filter((warehouse) => productId in warehouse.stock)
    .map((warehouse) => warehouse.replenishLeadDays)
    .filter((days) => days > 0);

  if (leads.length === 0) return null;
  return formatDate(addDays(new Date(), Math.min(...leads)));
}

/** Cost of a specific set of allocations — used to price a manual override. */
export function costOf(allocations: Allocation[], warehouses: WarehouseView[]): number {
  const used = new Set(allocations.map((allocation) => allocation.warehouseId));
  let total = 0;
  for (const id of used) {
    const warehouse = warehouses.find((w) => w.id === id);
    if (warehouse) total += warehouse.baseShipCost * warehouse.shippingCostWeight;
  }
  return round2(total);
}

/** Shapes a stock row set into the `productId -> qty` map the algorithm expects. */
export function toStockMap(rows: { productId: string; qty: number }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) map[row.productId] = num(row.qty);
  return map;
}
