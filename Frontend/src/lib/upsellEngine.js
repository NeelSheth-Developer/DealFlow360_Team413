import { round2 } from './utils';
import { tierPrice } from './pricing';

/**
 * Upsell / cross-sell ranking.
 *
 * A suggestion surfaces only when its trigger product is in the cart, it isn't
 * already in the cart, and its margin clears the rule's configured floor. The
 * ranking score is transparent on purpose — the previewer in the backend config
 * screen shows the same breakdown so the ordering is never a black box.
 */
export function rankSuggestions({
  cartLines = [],
  products = [],
  upsellRules = [],
  priceLists = [],
  tier = 'bronze',
  currency = 'INR',
  dismissed = [],
}) {
  const inCart = new Set(cartLines.map((l) => l.productId));
  const dismissedSet = new Set(dismissed);
  const scored = [];

  for (const rule of upsellRules.filter((r) => r.active)) {
    if (!inCart.has(rule.triggerProductId)) continue;
    if (inCart.has(rule.suggestedProductId)) continue;
    if (dismissedSet.has(rule.suggestedProductId)) continue;

    const product = products.find((p) => p.id === rule.suggestedProductId);
    if (!product || !product.active) continue;

    const price = tierPrice(product, tier, priceLists, currency);
    if (price <= 0) continue;

    const marginPct = ((price - product.costPrice) / price) * 100;
    if (marginPct < rule.minMarginPct) continue;

    const promoBoost = rule.promoted ? 25 : 0;
    const marginBoost = marginPct * 0.3;
    const rankScore = rule.coPurchaseScore + promoBoost + marginBoost;

    const trigger = products.find((p) => p.id === rule.triggerProductId);

    scored.push({
      ruleId: rule.id,
      productId: product.id,
      productName: product.name,
      category: product.category,
      unit: product.unit,
      taxPct: product.taxPct,
      costPrice: product.costPrice,
      price: round2(price),
      marginPct: round2(marginPct),
      marginDelta: round2(price - product.costPrice),
      revenueDelta: round2(price),
      promoted: rule.promoted,
      coPurchaseScore: rule.coPurchaseScore,
      minMarginPct: rule.minMarginPct,
      triggerProductName: trigger?.name ?? 'this cart',
      reason: `Frequently bought with ${trigger?.name ?? 'items in this cart'}`,
      breakdown: {
        coPurchase: round2(rule.coPurchaseScore),
        promotion: round2(promoBoost),
        margin: round2(marginBoost),
      },
      rankScore: round2(rankScore),
    });
  }

  // A product can be suggested by several triggers — keep the strongest.
  const best = new Map();
  for (const s of scored) {
    const prev = best.get(s.productId);
    if (!prev || s.rankScore > prev.rankScore) best.set(s.productId, s);
  }

  return [...best.values()].sort((a, b) => b.rankScore - a.rankScore);
}

/**
 * Suggestions filtered out and why — powers the previewer's "rejected" list so
 * an admin can see that a rule exists but its margin floor is blocking it.
 */
export function explainFilteredSuggestions({
  cartLines = [],
  products = [],
  upsellRules = [],
  priceLists = [],
  tier = 'bronze',
  currency = 'INR',
}) {
  const inCart = new Set(cartLines.map((l) => l.productId));
  const out = [];

  for (const rule of upsellRules) {
    const product = products.find((p) => p.id === rule.suggestedProductId);
    if (!product) continue;

    let reason = null;
    if (!rule.active) reason = 'Rule is inactive';
    else if (!inCart.has(rule.triggerProductId)) reason = 'Trigger product not in cart';
    else if (inCart.has(rule.suggestedProductId)) reason = 'Already in the cart';
    else if (!product.active) reason = 'Product is archived';
    else {
      const price = tierPrice(product, tier, priceLists, currency);
      const marginPct = price > 0 ? ((price - product.costPrice) / price) * 100 : 0;
      if (marginPct < rule.minMarginPct) {
        reason = `Margin ${marginPct.toFixed(1)}% is below the ${rule.minMarginPct}% floor`;
      }
    }

    if (reason) {
      out.push({ ruleId: rule.id, productName: product.name, reason });
    }
  }

  return out;
}
