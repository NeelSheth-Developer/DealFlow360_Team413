import { products } from './products';

/**
 * Tier pricing: Bronze pays list, Silver ~4% off, Gold ~8% off.
 *
 * These are the *starting* prices per tier. They are a separate concept from
 * discounts: a Gold customer already buys cheaper, and any discount a rep gives
 * is applied on top and measured against the ceilings in discountConfig.
 */
const TIER_FACTOR = { bronze: 1, silver: 0.96, gold: 0.92 };

/** Rounded to the nearest 50 so seeded prices look like real price-list entries. */
function roundPrice(n) {
  return Math.round(n / 50) * 50;
}

const inrEntries = products.flatMap((product) =>
  Object.entries(TIER_FACTOR).map(([tier, factor]) => ({
    productId: product.id,
    tier,
    currency: 'INR',
    price: roundPrice(product.basePrice * factor),
  })),
);

/**
 * USD entries for Everest Labs. Not a live FX conversion — a deliberately
 * maintained USD price book, which is how this works in practice.
 */
const USD_RATE = 1 / 83;

const usdEntries = products.flatMap((product) =>
  Object.entries(TIER_FACTOR).map(([tier, factor]) => ({
    productId: product.id,
    tier,
    currency: 'USD',
    price: Math.round(product.basePrice * factor * USD_RATE),
  })),
);

export const priceLists = [...inrEntries, ...usdEntries];

export const tierFactors = TIER_FACTOR;
