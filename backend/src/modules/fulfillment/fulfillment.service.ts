import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  backorders,
  fulfillmentAllocations,
  fulfillmentPlans,
  quotationLines,
  quotations,
  warehouseStock,
  warehouses,
  type BackorderPolicy,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import {
  computeSplit,
  costOf,
  isShippable,
  type Allocation,
  type WarehouseView,
} from '../../lib/allocation.js';
import { money, num } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import { loadQuotation, type LoadedQuotation } from '../quotations/quotations.repo.js';

/**
 * Multi-warehouse fulfillment.
 *
 * The plan is RECOMPUTED from live stock on every read, with one exception: once a rep
 * has accepted a suggestion or saved a manual override, that decision is persisted and
 * returned as-is. A recompute silently discarding someone's deliberate choice is the
 * failure this guards against — they made the call for a reason the algorithm cannot
 * see, such as a customer who wants everything in one delivery.
 *
 * The ordering itself lives in `lib/allocation.ts` and is explained to users on the
 * warehouse configuration screen, so it has to be the ordering the code actually uses.
 */

/** Loads every warehouse with its stock, in the shape the algorithm expects. */
async function warehouseViews(): Promise<WarehouseView[]> {
  const rows = await db
    .select()
    .from(warehouses)
    .where(eq(warehouses.active, true))
    .orderBy(asc(warehouses.name));

  if (rows.length === 0) return [];

  const stockRows = await db
    .select()
    .from(warehouseStock)
    .where(
      inArray(
        warehouseStock.warehouseId,
        rows.map((row) => row.id),
      ),
    );

  const byWarehouse = new Map<string, Record<string, number>>();
  for (const row of stockRows) {
    const shelf = byWarehouse.get(row.warehouseId) ?? {};
    shelf[row.productId] = row.qty;
    byWarehouse.set(row.warehouseId, shelf);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    shippingCostWeight: num(row.shippingCostWeight),
    baseShipCost: num(row.baseShipCost),
    replenishLeadDays: row.replenishLeadDays,
    stock: byWarehouse.get(row.id) ?? {},
  }));
}

function allocatableLines(loaded: LoadedQuotation) {
  return loaded.lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    productName: line.productName,
    category: line.category,
    qty: line.qty,
  }));
}

export async function getPlan(id: string) {
  const loaded = await loadQuotation(id);
  const views = await warehouseViews();

  const [saved] = await db
    .select()
    .from(fulfillmentPlans)
    .where(eq(fulfillmentPlans.quotationId, id))
    .limit(1);

  // A rep's accepted or overridden decision is returned verbatim — see the note above.
  if (saved && saved.acceptedAt !== null) {
    const [allocations, openBackorders] = await Promise.all([
      db.select().from(fulfillmentAllocations).where(eq(fulfillmentAllocations.quotationId, id)),
      db
        .select()
        .from(backorders)
        .where(and(eq(backorders.quotationId, id), isNull(backorders.resolvedAt))),
    ]);

    const used = [...new Set(allocations.map((row) => row.warehouseId))];

    return present(loaded, {
      allocations: allocations.map((row) => ({
        lineId: row.lineId,
        warehouseId: row.warehouseId,
        qty: row.qty,
      })),
      backorders: openBackorders.map((row) => ({
        lineId: row.lineId,
        productId: row.productId,
        productName:
          loaded.lines.find((line) => line.id === row.lineId)?.productName ?? 'Unknown',
        qty: row.qty,
        etaDate: row.etaDate,
      })),
      shipmentCount: used.length,
      estimatedCost: num(saved.estimatedCost),
      warehousesUsed: used,
      isOverride: saved.isOverride,
      acceptedAt: saved.acceptedAt,
      canConsolidate: await canConsolidate(id, views),
      views,
    });
  }

  const split = computeSplit(allocatableLines(loaded), views);

  return present(loaded, {
    ...split,
    isOverride: false,
    acceptedAt: null,
    canConsolidate: false,
    views,
  });
}

/**
 * True when an open backorder could now be filled from current stock. That is what
 * raises the consolidation prompt on the fulfillment screen.
 */
async function canConsolidate(quotationId: string, views: WarehouseView[]): Promise<boolean> {
  const open = await db
    .select()
    .from(backorders)
    .where(and(eq(backorders.quotationId, quotationId), isNull(backorders.resolvedAt)));

  if (open.length === 0) return false;

  // Stock already promised to OTHER quotations is not counted — it is not really
  // available, and a prompt that leads to a failed consolidation is worse than none.
  const committed = await committedStock(quotationId);

  return open.some((row) =>
    views.some((view) => {
      const onHand = view.stock[row.productId] ?? 0;
      const spokenFor = committed.get(`${view.id}:${row.productId}`) ?? 0;
      return onHand - spokenFor >= row.qty;
    }),
  );
}

/**
 * Units already promised to OTHER live quotations, keyed `warehouseId:productId`.
 *
 * Joined through `quotation_lines` to reach the product: an allocation is recorded
 * against a line, but stock is held against a product, and two quotations competing
 * for the same units is exactly the case this has to catch.
 */
async function committedStock(excludeQuotationId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      warehouseId: fulfillmentAllocations.warehouseId,
      productId: quotationLines.productId,
      qty: fulfillmentAllocations.qty,
    })
    .from(fulfillmentAllocations)
    .innerJoin(quotations, eq(quotations.id, fulfillmentAllocations.quotationId))
    .innerJoin(quotationLines, eq(quotationLines.id, fulfillmentAllocations.lineId))
    .where(
      and(
        inArray(quotations.stage, ['approved', 'fulfillment', 'billed']),
        ne(quotations.id, excludeQuotationId),
      ),
    );

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.warehouseId}:${row.productId}`;
    map.set(key, (map.get(key) ?? 0) + row.qty);
  }

  return map;
}

/** Accepts the suggested split and moves the quotation into fulfillment. */
export async function acceptPlan(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);

  if (loaded.stage !== 'approved' && loaded.stage !== 'fulfillment') {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Can't accept a fulfillment plan — this quotation is ${loaded.stage.replace(/_/g, ' ')}.`,
    );
  }

  const views = await warehouseViews();
  const split = computeSplit(allocatableLines(loaded), views);

  if (split.allocations.length === 0 && split.backorders.length === 0) {
    throw ApiError.conflict(
      'NOTHING_TO_SHIP',
      'This order has nothing physical to ship, so there is no fulfillment plan to accept.',
    );
  }

  await persist(id, split.allocations, split.backorders, split.estimatedCost, false);

  await db
    .update(quotations)
    .set({ stage: 'fulfillment', lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Fulfillment split accepted',
    actor,
    meta: {
      shipments: split.shipmentCount,
      estimatedCost: split.estimatedCost,
      backorders: split.backorders.length,
    },
  });

  return getPlan(id);
}

/**
 * Saves a manual override.
 *
 * Errors come back per cell so the UI can highlight the exact input that is wrong.
 * Line-level problems (over-allocation) omit `warehouseId`; stock problems name it.
 */
export async function overridePlan(actor: AuditActor, id: string, allocations: Allocation[]) {
  const loaded = await loadQuotation(id);

  if (loaded.stage !== 'approved' && loaded.stage !== 'fulfillment') {
    throw ApiError.conflict(
      'INVALID_TRANSITION',
      `Can't override a fulfillment plan — this quotation is ${loaded.stage.replace(/_/g, ' ')}.`,
    );
  }

  const views = await warehouseViews();
  const errors: { lineId: string; warehouseId?: string; message: string }[] = [];

  const shippable = new Map(
    loaded.lines.filter((line) => isShippable(line.category)).map((line) => [line.id, line]),
  );

  const perLine = new Map<string, number>();
  const perCell = new Map<string, number>();

  for (const allocation of allocations) {
    const line = shippable.get(allocation.lineId);
    if (!line) {
      errors.push({
        lineId: allocation.lineId,
        message: 'That line is not on this order, or has nothing physical to ship',
      });
      continue;
    }

    perLine.set(allocation.lineId, (perLine.get(allocation.lineId) ?? 0) + allocation.qty);
    const key = `${allocation.lineId}:${allocation.warehouseId}`;
    perCell.set(key, (perCell.get(key) ?? 0) + allocation.qty);
  }

  for (const [key, qty] of perCell) {
    const [lineId, warehouseId] = key.split(':');
    const line = shippable.get(lineId ?? '');
    const view = views.find((candidate) => candidate.id === warehouseId);

    if (!view) {
      errors.push({
        lineId: lineId ?? '',
        warehouseId: warehouseId ?? '',
        message: 'Unknown or inactive warehouse',
      });
      continue;
    }

    const available = line ? (view.stock[line.productId] ?? 0) : 0;
    if (qty > available) {
      errors.push({
        lineId: lineId ?? '',
        warehouseId: warehouseId ?? '',
        message: `Only ${available} available at ${view.name}`,
      });
    }
  }

  for (const [lineId, qty] of perLine) {
    const line = shippable.get(lineId);
    if (line && qty > line.qty) {
      errors.push({
        lineId,
        message: `Over-allocated: ${qty} assigned but only ${line.qty} ordered`,
      });
    }
  }

  if (errors.length > 0) {
    throw ApiError.unprocessable(
      'INVALID_ALLOCATION',
      'Fix the highlighted allocations.',
      { errors },
    );
  }

  const suggestion = computeSplit(allocatableLines(loaded), views);

  // Whatever the override does not cover becomes a backorder, so the two views of the
  // order still reconcile to the same quantities.
  const remaining: typeof suggestion.backorders = [];
  for (const line of shippable.values()) {
    const assigned = perLine.get(line.id) ?? 0;
    if (assigned < line.qty) {
      remaining.push({
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        qty: line.qty - assigned,
        etaDate: suggestion.backorders.find((row) => row.lineId === line.id)?.etaDate ?? null,
      });
    }
  }

  const cost = costOf(allocations, views);
  await persist(id, allocations, remaining, cost, true);

  await db
    .update(quotations)
    .set({ stage: 'fulfillment', lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  const costDelta = Math.round((cost - suggestion.estimatedCost) * 100) / 100;

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Fulfillment split manually overridden',
    actor,
    meta: {
      shipments: new Set(allocations.map((row) => row.warehouseId)).size,
      suggestedCost: suggestion.estimatedCost,
      overrideCost: cost,
      costDelta,
    },
  });

  return { plan: await getPlan(id), costDelta };
}

/** Recomputes from current stock and reports what consolidating saved. */
export async function consolidate(actor: AuditActor, id: string) {
  const loaded = await loadQuotation(id);
  const views = await warehouseViews();

  const [before] = await db
    .select()
    .from(fulfillmentPlans)
    .where(eq(fulfillmentPlans.quotationId, id))
    .limit(1);

  const openBefore = await db
    .select()
    .from(backorders)
    .where(and(eq(backorders.quotationId, id), isNull(backorders.resolvedAt)));

  if (openBefore.length === 0) {
    throw ApiError.conflict(
      'NOTHING_TO_CONSOLIDATE',
      'There is no open backorder on this order to consolidate.',
    );
  }

  const split = computeSplit(allocatableLines(loaded), views);

  const shipmentsSaved = Math.max(0, (before?.shipmentCount ?? 0) - split.shipmentCount);
  const costSaved =
    Math.round((num(before?.estimatedCost ?? '0') - split.estimatedCost) * 100) / 100;

  await persist(id, split.allocations, split.backorders, split.estimatedCost, false);

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: 'Backorder consolidated',
    actor,
    meta: {
      shipmentsSaved,
      costSaved,
      backordersClosed: openBefore.length - split.backorders.length,
    },
  });

  return {
    plan: await getPlan(id),
    saving: { shipmentsSaved, costSaved: Math.max(0, costSaved) },
  };
}

export async function setBackorderPolicy(
  actor: AuditActor,
  id: string,
  policy: BackorderPolicy,
) {
  const loaded = await loadQuotation(id);

  await db
    .update(quotations)
    .set({ backorderPolicy: policy, lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(quotations.id, id));

  await audit({
    entityType: 'quotation',
    entityId: id,
    entityRef: loaded.reference,
    action: `Backorder policy set to ${policy.replace(/_/g, ' ')}`,
    actor,
    meta: { from: loaded.backorderPolicy, to: policy },
  });

  return getPlan(id);
}

/** Replaces the stored plan wholesale. Rewriting beats diffing for a small set. */
async function persist(
  quotationId: string,
  allocations: Allocation[],
  openBackorders: { lineId: string; productId: string; qty: number; etaDate: string | null }[],
  estimatedCost: number,
  isOverride: boolean,
) {
  await db
    .delete(fulfillmentAllocations)
    .where(eq(fulfillmentAllocations.quotationId, quotationId));
  await db.delete(backorders).where(eq(backorders.quotationId, quotationId));

  if (allocations.length > 0) {
    await db.insert(fulfillmentAllocations).values(
      allocations
        .filter((allocation) => allocation.qty > 0)
        .map((allocation) => ({
          quotationId,
          lineId: allocation.lineId,
          warehouseId: allocation.warehouseId,
          qty: allocation.qty,
        })),
    );
  }

  if (openBackorders.length > 0) {
    await db.insert(backorders).values(
      openBackorders.map((row) => ({
        quotationId,
        lineId: row.lineId,
        productId: row.productId,
        qty: row.qty,
        etaDate: row.etaDate,
      })),
    );
  }

  const shipmentCount = new Set(
    allocations.filter((allocation) => allocation.qty > 0).map((row) => row.warehouseId),
  ).size;

  await db
    .insert(fulfillmentPlans)
    .values({
      quotationId,
      isOverride,
      acceptedAt: new Date(),
      estimatedCost: money(estimatedCost),
      shipmentCount,
    })
    .onConflictDoUpdate({
      target: fulfillmentPlans.quotationId,
      set: {
        isOverride,
        acceptedAt: new Date(),
        estimatedCost: money(estimatedCost),
        shipmentCount,
        updatedAt: new Date(),
      },
    });
}

function present(
  loaded: LoadedQuotation,
  data: {
    allocations: Allocation[];
    backorders: { lineId: string; productId: string; productName: string; qty: number; etaDate: string | null }[];
    shipmentCount: number;
    estimatedCost: number;
    warehousesUsed: string[];
    isOverride: boolean;
    acceptedAt: Date | null;
    canConsolidate: boolean;
    views: WarehouseView[];
  },
) {
  const names = new Map(data.views.map((view) => [view.id, view.name]));

  return {
    quotationId: loaded.id,
    reference: loaded.reference,
    backorderPolicy: loaded.backorderPolicy,
    allocations: data.allocations.map((allocation) => ({
      lineId: allocation.lineId,
      warehouseId: allocation.warehouseId,
      warehouseName: names.get(allocation.warehouseId) ?? 'Unknown',
      productName:
        loaded.lines.find((line) => line.id === allocation.lineId)?.productName ?? 'Unknown',
      qty: allocation.qty,
    })),
    backorders: data.backorders,
    shipmentCount: data.shipmentCount,
    estimatedCost: data.estimatedCost,
    warehousesUsed: data.warehousesUsed,
    isOverride: data.isOverride,
    acceptedAt: data.acceptedAt,
    canConsolidate: data.canConsolidate,
  };
}
