import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { products, upsellRules } from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { num, pct, round2 } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import { resolveUnitPrice } from '../catalog/catalog.service.js';
import type {
  CreateUpsellRuleInput,
  SuggestInput,
  UpdateUpsellRuleInput,
} from './upsell.schemas.js';

/**
 * Upsell and cross-sell.
 *
 * Ranking is `coPurchaseScore + (promoted ? 25 : 0) + marginPct * 0.3`, and the
 * `breakdown` on every suggestion shows those three terms separately so the ranking is
 * not a black box to the admin previewing it.
 *
 * The margin floor is a hard drop, not a demotion. A product whose margin at the
 * customer's tier price falls below its rule's `minMarginPct` is removed from the
 * results entirely — the panel must never nudge a rep toward an add-on that costs the
 * business money, and ranking it last still puts it on screen.
 */

const PROMOTION_BONUS = 25;
const MARGIN_WEIGHT = 0.3;

export async function listRules() {
  const rows = await db
    .select({
      id: upsellRules.id,
      triggerProductId: upsellRules.triggerProductId,
      suggestedProductId: upsellRules.suggestedProductId,
      coPurchaseScore: upsellRules.coPurchaseScore,
      promoted: upsellRules.promoted,
      minMarginPct: upsellRules.minMarginPct,
      active: upsellRules.active,
    })
    .from(upsellRules)
    .orderBy(asc(upsellRules.createdAt));

  const names = await productNames([
    ...rows.map((row) => row.triggerProductId),
    ...rows.map((row) => row.suggestedProductId),
  ]);

  return rows.map((row) => ({
    id: row.id,
    triggerProductId: row.triggerProductId,
    triggerProductName: names.get(row.triggerProductId) ?? null,
    suggestedProductId: row.suggestedProductId,
    suggestedProductName: names.get(row.suggestedProductId) ?? null,
    coPurchaseScore: num(row.coPurchaseScore),
    promoted: row.promoted,
    minMarginPct: num(row.minMarginPct),
    active: row.active,
  }));
}

export async function createRule(actor: AuditActor, input: CreateUpsellRuleInput) {
  await assertProductsExist([input.triggerProductId, input.suggestedProductId]);

  const [clash] = await db
    .select({ id: upsellRules.id })
    .from(upsellRules)
    .where(
      and(
        eq(upsellRules.triggerProductId, input.triggerProductId),
        eq(upsellRules.suggestedProductId, input.suggestedProductId),
      ),
    )
    .limit(1);

  if (clash) {
    throw ApiError.conflict(
      'VALIDATION_FAILED',
      'A rule already pairs these two products — update that one instead',
    );
  }

  const [created] = await db
    .insert(upsellRules)
    .values({
      triggerProductId: input.triggerProductId,
      suggestedProductId: input.suggestedProductId,
      coPurchaseScore: pct(input.coPurchaseScore),
      promoted: input.promoted,
      minMarginPct: pct(input.minMarginPct),
    })
    .returning();

  if (!created) throw ApiError.notFound('Upsell rule not found');

  await audit({
    entityType: 'upsell_rule',
    entityId: created.id,
    action: 'Upsell rule created',
    actor,
    meta: { ...input },
  });

  return listRules();
}

export async function updateRule(actor: AuditActor, id: string, input: UpdateUpsellRuleInput) {
  const [existing] = await db.select().from(upsellRules).where(eq(upsellRules.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Upsell rule not found');

  await db
    .update(upsellRules)
    .set({
      ...(input.coPurchaseScore !== undefined
        ? { coPurchaseScore: pct(input.coPurchaseScore) }
        : {}),
      ...(input.promoted !== undefined ? { promoted: input.promoted } : {}),
      ...(input.minMarginPct !== undefined ? { minMarginPct: pct(input.minMarginPct) } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .where(eq(upsellRules.id, id));

  await audit({
    entityType: 'upsell_rule',
    entityId: id,
    action: 'Upsell rule updated',
    actor,
    meta: { changed: Object.keys(input) },
  });

  return listRules();
}

/** A pairing is configuration, not history — deleting one loses nothing recoverable. */
export async function deleteRule(actor: AuditActor, id: string) {
  const [existing] = await db.select().from(upsellRules).where(eq(upsellRules.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Upsell rule not found');

  await db.delete(upsellRules).where(eq(upsellRules.id, id));

  await audit({
    entityType: 'upsell_rule',
    entityId: id,
    action: 'Upsell rule removed',
    actor,
    meta: {
      triggerProductId: existing.triggerProductId,
      suggestedProductId: existing.suggestedProductId,
    },
  });

  return listRules();
}

export type Suggestion = {
  productId: string;
  productName: string;
  category: string;
  price: number;
  marginPct: number;
  marginDelta: number;
  promoted: boolean;
  coPurchaseScore: number;
  reason: string;
  rankScore: number;
  breakdown: { coPurchase: number; promotion: number; margin: number };
};

/**
 * Ranked suggestions for what is currently in the cart.
 *
 * Server-side rather than client-side because `coPurchaseScore` is meant to be learned
 * from real order history — the frontend can rank from the rule list, but only the
 * server can eventually derive the score from what actually sold together.
 */
export async function suggest(input: SuggestInput): Promise<Suggestion[]> {
  const rules = await db
    .select()
    .from(upsellRules)
    .where(
      and(
        inArray(upsellRules.triggerProductId, input.productIds),
        eq(upsellRules.active, true),
      ),
    );

  if (rules.length === 0) return [];

  // Already in the cart, or explicitly dismissed on this quotation.
  const excluded = new Set([...input.productIds, ...input.excludeProductIds]);

  // Best rule per suggested product: the same add-on can be triggered by two different
  // cart items, and it should appear once, at its strongest score.
  const best = new Map<string, typeof rules[number]>();
  for (const rule of rules) {
    if (excluded.has(rule.suggestedProductId)) continue;
    const current = best.get(rule.suggestedProductId);
    if (!current || num(rule.coPurchaseScore) > num(current.coPurchaseScore)) {
      best.set(rule.suggestedProductId, rule);
    }
  }

  if (best.size === 0) return [];

  const candidates = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, [...best.keys()]), eq(products.active, true)));

  const triggerNames = await productNames(input.productIds);
  const suggestions: Suggestion[] = [];

  for (const product of candidates) {
    const rule = best.get(product.id);
    if (!rule) continue;

    const price = await resolveUnitPrice(product.id, input.tier, input.currency);
    const cost = num(product.costPrice);
    const marginDelta = round2(price - cost);
    const marginPct = price > 0 ? round2((marginDelta / price) * 100) : 0;

    // The hard drop. See the note at the top of this file.
    if (marginPct < num(rule.minMarginPct)) continue;

    const coPurchase = num(rule.coPurchaseScore);
    const promotion = rule.promoted ? PROMOTION_BONUS : 0;
    const marginTerm = round2(marginPct * MARGIN_WEIGHT);

    suggestions.push({
      productId: product.id,
      productName: product.name,
      category: product.category,
      price,
      marginPct,
      marginDelta,
      promoted: rule.promoted,
      coPurchaseScore: coPurchase,
      reason: `Frequently bought with ${triggerNames.get(rule.triggerProductId) ?? 'this item'}`,
      rankScore: round2(coPurchase + promotion + marginTerm),
      breakdown: { coPurchase, promotion, margin: marginTerm },
    });
  }

  return suggestions.sort((a, b) => b.rankScore - a.rankScore).slice(0, input.limit);
}

async function assertProductsExist(productIds: string[]) {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, productIds));

  const known = new Set(rows.map((row) => row.id));
  const unknown = productIds.filter((id) => !known.has(id));

  if (unknown.length > 0) {
    throw ApiError.badRequest('VALIDATION_FAILED', 'Unknown product id', { unknown });
  }
}

async function productNames(productIds: string[]) {
  const map = new Map<string, string>();
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return map;

  const rows = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.id, unique));

  for (const row of rows) map.set(row.id, row.name);
  return map;
}
