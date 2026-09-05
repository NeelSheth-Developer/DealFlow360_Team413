/**
 * Three warehouses, stocked deliberately rather than randomly.
 *
 * The key numbers: Laptop Pro 14 has 6 units at Main and 4 at East, 0 at West.
 * So an order of 8 laptops MUST split Main(6) + East(2), and an order of 12
 * creates a backorder. That is exactly what the demo script needs to show.
 *
 * shippingCostWeight is the multiplier the split algorithm uses as its cost
 * tie-breaker — higher weight means the system prefers to ship elsewhere.
 */
export const warehouses = [
  {
    id: 'w-main',
    name: 'Main Warehouse',
    location: 'Bhiwandi, Mumbai',
    shippingCostWeight: 1.0,
    baseShipCost: 400,
    replenishThreshold: 5,
    replenishQty: 20,
    replenishLeadDays: 4,
    stock: {
      'p-laptop14': 6,
      'p-dock': 24,
      'p-monitor27': 18,
      'p-keyboard': 60,
      'p-tablet': 9,
      'p-switch24': 7,
      'p-ap': 30,
      'p-ups': 11,
      'p-case': 45,
      'p-cables': 80,
      'p-warranty': 999,
    },
  },
  {
    id: 'w-east',
    name: 'East Depot',
    location: 'Salt Lake, Kolkata',
    shippingCostWeight: 1.4,
    baseShipCost: 400,
    replenishThreshold: 4,
    replenishQty: 15,
    replenishLeadDays: 7,
    stock: {
      'p-laptop14': 4,
      'p-dock': 9,
      'p-monitor27': 6,
      'p-keyboard': 22,
      'p-tablet': 3,
      'p-switch24': 2,
      'p-ap': 12,
      'p-ups': 4,
      'p-case': 18,
      'p-cables': 30,
      'p-warranty': 999,
    },
  },
  {
    id: 'w-west',
    name: 'West Hub',
    location: 'Hinjawadi, Pune',
    shippingCostWeight: 1.8,
    baseShipCost: 400,
    replenishThreshold: 3,
    replenishQty: 12,
    replenishLeadDays: 10,
    stock: {
      'p-laptop14': 0,
      'p-dock': 3,
      'p-monitor27': 2,
      'p-keyboard': 8,
      'p-tablet': 0,
      'p-switch24': 1,
      'p-ap': 5,
      'p-ups': 2,
      'p-case': 6,
      'p-cables': 14,
      'p-warranty': 999,
    },
  },
];
