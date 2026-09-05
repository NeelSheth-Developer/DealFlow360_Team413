import 'dotenv/config';
import { computeSplit, type AllocatableLine, type WarehouseView } from '../lib/allocation.js';
import { cancellationValue, prorate, type Cycle } from '../lib/billing-math.js';

/**
 * Reference cases from the frontend contract, section 24. These are the numbers the
 * frontend's own test harness asserts, so a mismatch here is an integration bug that
 * would otherwise surface as a badge disagreeing with a table.
 */

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  console.log(ok ? 'PASS  ' : 'FAIL  ', name);
  if (!ok) {
    failed += 1;
    console.log('        expected', e);
    console.log('        got     ', a);
  }
}

// --- Warehouse split -------------------------------------------------------
// Main = 6, East = 4, West = 0 units; weights 1.0 / 1.4 / 1.8; baseShipCost 400.
const P = 'p-laptop14';
const warehouses: WarehouseView[] = [
  {
    id: 'w-main',
    name: 'Main',
    shippingCostWeight: 1.0,
    baseShipCost: 400,
    replenishLeadDays: 4,
    stock: { [P]: 6 },
  },
  {
    id: 'w-east',
    name: 'East',
    shippingCostWeight: 1.4,
    baseShipCost: 400,
    replenishLeadDays: 6,
    stock: { [P]: 4 },
  },
  {
    id: 'w-west',
    name: 'West',
    shippingCostWeight: 1.8,
    baseShipCost: 400,
    replenishLeadDays: 9,
    stock: { [P]: 0 },
  },
];
const line = (qty: number, category = 'hardware'): AllocatableLine[] => [
  { id: 'l-1', productId: P, productName: 'Laptop Pro 14', category, qty },
];

const eight = computeSplit(line(8), warehouses);
check(
  'split 8 units -> Main 6 + East 2, 2 shipments, no backorder',
  {
    alloc: eight.allocations.map((a) => [a.warehouseId, a.qty]),
    ships: eight.shipmentCount,
    back: eight.backorders.length,
  },
  {
    alloc: [
      ['w-main', 6],
      ['w-east', 2],
    ],
    ships: 2,
    back: 0,
  },
);

const twelve = computeSplit(line(12), warehouses);
check(
  'split 12 units -> Main 6 + East 4, backorder 2',
  {
    alloc: twelve.allocations.map((a) => [a.warehouseId, a.qty]),
    back: twelve.backorders.map((b) => b.qty),
    hasEta: twelve.backorders[0]?.etaDate !== null,
  },
  {
    alloc: [
      ['w-main', 6],
      ['w-east', 4],
    ],
    back: [2],
    hasEta: true,
  },
);

const two = computeSplit(line(2), warehouses);
check(
  'split 2 units -> 1 shipment from Main',
  { alloc: two.allocations.map((a) => [a.warehouseId, a.qty]), ships: two.shipmentCount },
  { alloc: [['w-main', 2]], ships: 1 },
);

const svc = computeSplit([...line(5, 'service'), ...line(3, 'subscription')], warehouses);
check(
  'split service/subscription only -> nothing to ship',
  { alloc: svc.allocations.length, back: svc.backorders.length, ships: svc.shipmentCount },
  { alloc: 0, back: 0, ships: 0 },
);

check('estimated cost of Main + East = 400*1.0 + 400*1.4', eight.estimatedCost, 960);

// --- Proration -------------------------------------------------------------
// 10 seats at 1,200, changed on day 12 of a 31-day cycle.
const cycle: Cycle = {
  start: new Date(Date.UTC(2026, 2, 1)),
  end: new Date(Date.UTC(2026, 3, 1)),
  daysInCycle: 31,
  daysUsed: 12,
  daysRemaining: 19,
};

check(
  'daily_prorate 10 -> 12',
  (() => {
    const r = prorate(10, 12, 1200, 0, 'daily_prorate', cycle);
    return { amountNow: r.amountNow, deferred: r.deferredAmount, type: r.type };
  })(),
  { amountNow: 1470.97, deferred: 0, type: 'charge' },
);

check(
  'daily_prorate 10 -> 8',
  (() => {
    const r = prorate(10, 8, 1200, 0, 'daily_prorate', cycle);
    return { amountNow: r.amountNow, deferred: r.deferredAmount, type: r.type };
  })(),
  { amountNow: -1470.97, deferred: 0, type: 'credit' },
);

check(
  'full_period 10 -> 12',
  (() => {
    const r = prorate(10, 12, 1200, 0, 'full_period', cycle);
    return { amountNow: r.amountNow, deferred: r.deferredAmount, type: r.type };
  })(),
  { amountNow: 0, deferred: 0, type: 'none' },
);

check(
  'next_cycle_adjust 10 -> 12',
  (() => {
    const r = prorate(10, 12, 1200, 0, 'next_cycle_adjust', cycle);
    return { amountNow: r.amountNow, deferred: r.deferredAmount, type: r.type };
  })(),
  { amountNow: 0, deferred: 2400, type: 'deferred' },
);

// --- Cancellation ----------------------------------------------------------
// Same line: perCycle = 10 x 1,200 = 12,000.
check(
  'cancel refund_unused',
  (() => {
    const r = cancellationValue(12000, 'refund_unused', cycle);
    return { amount: r.amount, type: r.type };
  })(),
  { amount: 7354.84, type: 'refund' },
);

check(
  'cancel credit_note_only',
  (() => {
    const r = cancellationValue(12000, 'credit_note_only', cycle);
    return { amount: r.amount, type: r.type };
  })(),
  { amount: 7354.84, type: 'credit_note' },
);

check(
  'cancel no_refund',
  (() => {
    const r = cancellationValue(12000, 'no_refund', cycle);
    return { amount: r.amount, type: r.type };
  })(),
  { amount: 0, type: null },
);

console.log(failed === 0 ? '\nAll engine reference cases match.' : `\n${failed} case(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
