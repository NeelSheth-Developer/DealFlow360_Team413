import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { products, subscriptionPlanProducts, subscriptionPlans } from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { ApiError } from '../../utils/api-error.js';
import type { CreatePlanInput, UpdatePlanInput } from './subscriptions.schemas.js';

/**
 * Recurring plans.
 *
 * A plan carries the two rules the billing engine branches on — how a mid-cycle
 * quantity change is prorated, and what a cancellation refunds. Both are per-plan
 * rather than global because they are commercial terms: an annual plan can reasonably
 * refuse refunds where a monthly one prorates daily.
 *
 * Note that a `subscription` CATEGORY on a product does not by itself make a line
 * recurring — an attached plan does. A product can sit in that category and still be
 * sold as a one-off.
 */

export async function listPlans() {
  const rows = await db.select().from(subscriptionPlans).orderBy(asc(subscriptionPlans.name));
  const links = await productsFor(rows.map((row) => row.id));
  return rows.map((row) => present(row, links.get(row.id) ?? []));
}

export async function getPlan(id: string) {
  const [row] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Subscription plan not found');

  const links = await productsFor([id]);
  return present(row, links.get(id) ?? []);
}

export async function createPlan(actor: AuditActor, input: CreatePlanInput) {
  await assertProductsExist(input.productIds);

  const [created] = await db
    .insert(subscriptionPlans)
    .values({
      name: input.name,
      cadence: input.cadence,
      prorationRule: input.prorationRule,
      cancellationRule: input.cancellationRule,
      minCommitmentMonths: input.minCommitmentMonths,
      trialDays: input.trialDays,
      billingDayOfCycle: input.billingDayOfCycle,
    })
    .returning();

  if (!created) throw ApiError.notFound('Subscription plan not found');

  if (input.productIds.length > 0) {
    await db
      .insert(subscriptionPlanProducts)
      .values(input.productIds.map((productId) => ({ planId: created.id, productId })));
  }

  await audit({
    entityType: 'subscription_plan',
    entityId: created.id,
    action: `Subscription plan created: ${created.name}`,
    actor,
    meta: { cadence: created.cadence, prorationRule: created.prorationRule },
  });

  return getPlan(created.id);
}

export async function updatePlan(actor: AuditActor, id: string, input: UpdatePlanInput) {
  const [existing] = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, id))
    .limit(1);

  if (!existing) throw ApiError.notFound('Subscription plan not found');
  if (input.productIds) await assertProductsExist(input.productIds);

  await db
    .update(subscriptionPlans)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.cadence !== undefined ? { cadence: input.cadence } : {}),
      ...(input.prorationRule !== undefined ? { prorationRule: input.prorationRule } : {}),
      ...(input.cancellationRule !== undefined
        ? { cancellationRule: input.cancellationRule }
        : {}),
      ...(input.minCommitmentMonths !== undefined
        ? { minCommitmentMonths: input.minCommitmentMonths }
        : {}),
      ...(input.trialDays !== undefined ? { trialDays: input.trialDays } : {}),
      ...(input.billingDayOfCycle !== undefined
        ? { billingDayOfCycle: input.billingDayOfCycle }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .where(eq(subscriptionPlans.id, id));

  if (input.productIds !== undefined) {
    await db
      .delete(subscriptionPlanProducts)
      .where(eq(subscriptionPlanProducts.planId, id));

    if (input.productIds.length > 0) {
      await db
        .insert(subscriptionPlanProducts)
        .values(input.productIds.map((productId) => ({ planId: id, productId })));
    }
  }

  await audit({
    entityType: 'subscription_plan',
    entityId: id,
    action: `Subscription plan updated: ${input.name ?? existing.name}`,
    actor,
    meta: { changed: Object.keys(input) },
  });

  return getPlan(id);
}

/**
 * The plan to attach when a rep adds a subscription product without naming one.
 *
 * Picks the first active plan linked to that product. Returns null rather than
 * throwing when there is none: the line is still valid, it just bills one-off.
 */
export async function defaultPlanFor(productId: string) {
  const [row] = await db
    .select({ id: subscriptionPlans.id, cadence: subscriptionPlans.cadence })
    .from(subscriptionPlanProducts)
    .innerJoin(subscriptionPlans, eq(subscriptionPlans.id, subscriptionPlanProducts.planId))
    .where(
      eq(subscriptionPlanProducts.productId, productId),
    )
    .orderBy(asc(subscriptionPlans.name))
    .limit(1);

  return row ?? null;
}

async function assertProductsExist(productIds: string[]) {
  if (productIds.length === 0) return;

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

async function productsFor(planIds: string[]) {
  const map = new Map<string, string[]>();
  if (planIds.length === 0) return map;

  const rows = await db
    .select()
    .from(subscriptionPlanProducts)
    .where(inArray(subscriptionPlanProducts.planId, planIds));

  for (const row of rows) {
    const list = map.get(row.planId) ?? [];
    list.push(row.productId);
    map.set(row.planId, list);
  }

  return map;
}

function present(
  row: typeof subscriptionPlans.$inferSelect,
  productIds: string[],
) {
  return {
    id: row.id,
    name: row.name,
    cadence: row.cadence,
    productIds,
    prorationRule: row.prorationRule,
    cancellationRule: row.cancellationRule,
    minCommitmentMonths: row.minCommitmentMonths,
    trialDays: row.trialDays,
    billingDayOfCycle: row.billingDayOfCycle,
    active: row.active,
  };
}
