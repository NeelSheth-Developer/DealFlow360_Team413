import { and, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { customers, quotations, tierConfig, type Tier } from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { num, pct } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import type { FindCustomersQuery } from './customers.schemas.js';

/** Never selects `password_hash`. */
const publicColumns = {
  id: customers.id,
  customerId: customers.customerId,
  name: customers.name,
  contactName: customers.contactName,
  email: customers.email,
  tier: customers.tier,
  currency: customers.currency,
  industry: customers.industry,
  emailVerifiedAt: customers.emailVerifiedAt,
  active: customers.active,
  createdAt: customers.createdAt,
};

/**
 * The staff customer directory.
 *
 * With no `q` this lists everyone, newest first. A `DF-CMC827` term is matched exactly
 * — that is the intended path when a customer reads their id down a phone, and it
 * returns at most one row. Anything else is a partial match on name, contact and
 * email.
 */
export async function findCustomers(query: FindCustomersQuery) {
  const filters: SQL[] = [];

  const term = query.q?.trim();
  if (term) {
    const isCustomerId = /^DF-[A-Z]{3}\d{3}$/i.test(term);
    if (isCustomerId) {
      filters.push(eq(customers.customerId, term.toUpperCase()));
    } else {
      const pattern = `%${term}%`;
      const search = or(
        ilike(customers.name, pattern),
        ilike(customers.email, pattern),
        ilike(customers.contactName, pattern),
      );
      if (search) filters.push(search);
    }
  }

  if (query.tier) filters.push(eq(customers.tier, query.tier));

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.limit;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        ...publicColumns,
        // Counted in the same round trip rather than N+1 per customer.
        quotationCount: sql<number>`(SELECT COUNT(*)::int FROM ${quotations} WHERE ${quotations.customerId} = ${customers.id})`,
      })
      .from(customers)
      .where(where)
      .orderBy(desc(customers.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(customers).where(where),
  ]);

  const total = totals?.total ?? 0;

  return {
    data: rows.map(present),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getCustomer(id: string) {
  const [row] = await db
    .select({
      ...publicColumns,
      quotationCount: sql<number>`(SELECT COUNT(*)::int FROM ${quotations} WHERE ${quotations.customerId} = ${customers.id})`,
    })
    .from(customers)
    .where(eq(customers.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Customer not found');
  return present(row);
}

/**
 * Promote or demote a customer's pricing tier.
 *
 * The one mutation allowed on a customer record, and admin / sales_manager only. It is
 * commercial configuration rather than account data: it moves the starting price on
 * every future quotation and one half of the binding discount ceiling.
 *
 * Existing quotations are NOT rewritten. Each snapshots its tier at creation, so an
 * approval already given cannot be invalidated by a tier change made afterwards.
 */
export async function updateCustomerTier(actor: AuditActor, id: string, tier: Tier) {
  const [existing] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Customer not found');

  if (existing.tier === tier) return getCustomer(id);

  await db.update(customers).set({ tier, updatedAt: new Date() }).where(eq(customers.id, id));

  await audit({
    entityType: 'customer',
    entityId: id,
    entityRef: existing.customerId,
    action: `Pricing tier changed for ${existing.name}`,
    actor,
    meta: { from: existing.tier, to: tier },
  });

  return getCustomer(id);
}

/**
 * The discount ceiling for a whole tier — not for one customer.
 *
 * Business policy: it changes what the blended risk score will flag on every future
 * quotation for every customer on that tier.
 */
export async function getTierCeiling(tier: Tier) {
  const [row] = await db.select().from(tierConfig).where(eq(tierConfig.tier, tier));
  if (!row) throw ApiError.notFound(`No configuration for tier "${tier}"`);
  return { tier: row.tier, maxDiscountPct: num(row.maxDiscountPct), updatedAt: row.updatedAt };
}

export async function updateTierCeiling(actor: AuditActor, tier: Tier, maxDiscountPct: number) {
  const before = await getTierCeiling(tier);

  const [updated] = await db
    .update(tierConfig)
    .set({ maxDiscountPct: pct(maxDiscountPct), updatedAt: new Date() })
    .where(eq(tierConfig.tier, tier))
    .returning();

  // The three rows are seeded by migration, so a miss means the tier is unknown.
  if (!updated) throw ApiError.notFound(`No configuration for tier "${tier}"`);

  await audit({
    entityType: 'config',
    action: `Discount ceiling for ${tier} tier changed`,
    actor,
    meta: { tier, from: before.maxDiscountPct, to: maxDiscountPct },
  });

  return {
    tier: updated.tier,
    // numeric() comes back as a string; the API returns a number.
    maxDiscountPct: num(updated.maxDiscountPct),
    updatedAt: updated.updatedAt,
  };
}

/**
 * The customer shape returned to clients. Fields are listed explicitly rather than
 * spread: it fixes the key order, and a column added to `publicColumns` later cannot
 * leak into the response by accident.
 *
 * `hasAccount` is a boolean derived from whether the address has been verified — never
 * the password or its hash. The UI shows "Registered" against it, and no endpoint
 * anywhere returns credential material.
 */
function present(row: {
  id: string;
  customerId: string;
  name: string;
  contactName: string | null;
  email: string;
  tier: string;
  currency: string;
  industry: string | null;
  emailVerifiedAt: Date | null;
  active: boolean;
  createdAt: Date;
  quotationCount?: number;
}) {
  return {
    id: row.id,
    customerId: row.customerId,
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    tier: row.tier,
    currency: row.currency,
    industry: row.industry,
    hasAccount: row.emailVerifiedAt !== null,
    verified: row.emailVerifiedAt !== null,
    active: row.active,
    registeredAt: row.createdAt,
    createdAt: row.createdAt,
    quotationCount: row.quotationCount ?? 0,
  };
}
