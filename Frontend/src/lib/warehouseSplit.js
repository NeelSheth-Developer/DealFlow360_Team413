import { addDaysISO, round2 } from './utils';

/**
 * Multi-warehouse fulfillment allocation.
 *
 * Objective: fulfil every shippable line while minimising the number of
 * shipments, using shipping cost weight as the tie-breaker. Subscriptions and
 * services are skipped — there is nothing physical to ship.
 */
export function suggestWarehouseSplit(lines = [], warehouses = []) {
  const allocations = [];
  const backorders = [];
  const usedWarehouses = new Set();

  // Working copy so planning never mutates the store's real stock.
  const available = {};
  for (const w of warehouses) available[w.id] = { ...w.stock };

  const shippable = lines.filter((l) => !l.isSubscription && l.category !== 'service');

  for (const line of shippable) {
    let remaining = Number(line.qty) || 0;

    const ranked = [...warehouses].sort((a, b) => {
      const aQty = available[a.id]?.[line.productId] || 0;
      const bQty = available[b.id]?.[line.productId] || 0;

      // 1. Prefer a warehouse that can fulfil the WHOLE line (fewer shipments).
      const aWhole = aQty >= remaining ? 1 : 0;
      const bWhole = bQty >= remaining ? 1 : 0;
      if (aWhole !== bWhole) return bWhole - aWhole;

      // 2. Prefer a warehouse already shipping something on this order.
      const aUsed = usedWarehouses.has(a.id) ? 1 : 0;
      const bUsed = usedWarehouses.has(b.id) ? 1 : 0;
      if (aUsed !== bUsed) return bUsed - aUsed;

      // 3. Cheaper shipping first.
      if (a.shippingCostWeight !== b.shippingCostWeight) {
        return a.shippingCostWeight - b.shippingCostWeight;
      }

      // 4. More stock first.
      return bQty - aQty;
    });

    for (const w of ranked) {
      if (remaining <= 0) break;
      const have = available[w.id]?.[line.productId] || 0;
      if (have <= 0) continue;
      const take = Math.min(have, remaining);
      allocations.push({ lineId: line.id, warehouseId: w.id, qty: take });
      available[w.id][line.productId] = have - take;
      usedWarehouses.add(w.id);
      remaining -= take;
    }

    if (remaining > 0) {
      // Soonest replenishment across warehouses that stock this product at all.
      const leadDays = warehouses
        .filter((w) => Object.prototype.hasOwnProperty.call(w.stock, line.productId))
        .map((w) => w.replenishLeadDays)
        .sort((a, b) => a - b)[0];

      backorders.push({
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        qty: remaining,
        etaDate: leadDays == null ? null : addDaysISO(new Date(), leadDays),
      });
    }
  }

  return {
    allocations,
    backorders,
    ...shipmentMetrics(allocations, warehouses),
    isOverride: false,
    acceptedAt: null,
  };
}

/** Shipment count and cost derived from a set of allocations. */
export function shipmentMetrics(allocations = [], warehouses = []) {
  const used = new Set(allocations.filter((a) => a.qty > 0).map((a) => a.warehouseId));
  const estimatedCost = [...used].reduce((total, id) => {
    const w = warehouses.find((x) => x.id === id);
    if (!w) return total;
    return total + w.baseShipCost * w.shippingCostWeight;
  }, 0);
  return {
    shipmentCount: used.size,
    estimatedCost: round2(estimatedCost),
    warehousesUsed: [...used],
  };
}

/** Validate a manually overridden allocation set against stock and ordered qty. */
export function validateOverride(allocations = [], lines = [], warehouses = []) {
  const errors = [];
  const shippable = lines.filter((l) => !l.isSubscription && l.category !== 'service');

  for (const line of shippable) {
    const allocated = allocations
      .filter((a) => a.lineId === line.id)
      .reduce((s, a) => s + (Number(a.qty) || 0), 0);

    if (allocated > line.qty) {
      errors.push({
        lineId: line.id,
        message: `Over-allocated: ${allocated} assigned but only ${line.qty} ordered`,
      });
    }
  }

  for (const a of allocations) {
    if (!a.qty) continue;
    const w = warehouses.find((x) => x.id === a.warehouseId);
    const line = lines.find((l) => l.id === a.lineId);
    const have = w?.stock?.[line?.productId] || 0;
    if (a.qty > have) {
      errors.push({
        lineId: a.lineId,
        warehouseId: a.warehouseId,
        message: `Only ${have} available at ${w?.name ?? 'warehouse'}`,
      });
    }
  }

  return errors;
}

/** Recompute backorders for an arbitrary allocation set (used after an override). */
export function backordersFor(allocations = [], lines = [], warehouses = []) {
  const shippable = lines.filter((l) => !l.isSubscription && l.category !== 'service');
  const out = [];
  for (const line of shippable) {
    const allocated = allocations
      .filter((a) => a.lineId === line.id)
      .reduce((s, a) => s + (Number(a.qty) || 0), 0);
    const short = (Number(line.qty) || 0) - allocated;
    if (short > 0) {
      const leadDays = warehouses
        .filter((w) => Object.prototype.hasOwnProperty.call(w.stock, line.productId))
        .map((w) => w.replenishLeadDays)
        .sort((a, b) => a - b)[0];
      out.push({
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        qty: short,
        etaDate: leadDays == null ? null : addDaysISO(new Date(), leadDays),
      });
    }
  }
  return out;
}

export function consolidationSaving(currentPlan, newPlan) {
  return {
    shipmentsSaved: currentPlan.shipmentCount - newPlan.shipmentCount,
    costSaved: round2(currentPlan.estimatedCost - newPlan.estimatedCost),
  };
}

/** Can the open backorder now be filled from current stock? */
export function canConsolidate(plan, lines, warehouses) {
  if (!plan?.backorders?.length) return false;
  return plan.backorders.every((b) => {
    const totalAvailable = warehouses.reduce((s, w) => s + (w.stock?.[b.productId] || 0), 0);
    return totalAvailable >= b.qty;
  });
}

/** Stock availability signal for a product across the whole network. */
export function stockSignal(productId, qtyWanted, warehouses = []) {
  const total = warehouses.reduce((s, w) => s + (w.stock?.[productId] || 0), 0);
  if (total >= qtyWanted && qtyWanted > 0) return { level: 'full', total };
  if (total > 0) return { level: 'partial', total };
  return { level: 'none', total };
}

/** Per-line view combining allocations, used by the split table and bar chart. */
export function splitByLine(plan, lines, warehouses) {
  const shippable = lines.filter((l) => !l.isSubscription && l.category !== 'service');
  return shippable.map((line) => {
    const rows = (plan?.allocations ?? [])
      .filter((a) => a.lineId === line.id)
      .map((a) => ({
        ...a,
        warehouseName: warehouses.find((w) => w.id === a.warehouseId)?.name ?? a.warehouseId,
      }));
    const allocated = rows.reduce((s, r) => s + r.qty, 0);
    const backorder = (plan?.backorders ?? []).find((b) => b.lineId === line.id);
    return {
      line,
      rows,
      allocated,
      shortfall: Math.max(0, (Number(line.qty) || 0) - allocated),
      backorderEta: backorder?.etaDate ?? null,
    };
  });
}
