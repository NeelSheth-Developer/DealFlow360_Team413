import { desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { customers, tierConfig, type Tier } from '../../db/schema.js';
import { parseCustomerCode, toCustomerCode } from '../../lib/customer-code.js';
import { ApiError } from '../../utils/api-error.js';
import type { FindCustomersQuery } from './customers.schemas.js';

/** Never selects `password_hash`. */
const publicColumns = {
  id: customers.id,
  seq: customers.seq,
  name: customers.name,
  contactName: customers.contactName,
  email: customers.email,
  tier: customers.tier,
  currency: customers.currency,
  emailVerifiedAt: customers.emailVerifiedAt,
  active: customers.active,
  createdAt: customers.createdAt,
};

/**
 * Look a customer up by the code they read out, or by part of their name or email.
 *
 * A `CUST-0001` term is resolved to the identity column and matched exactly — that is
 * the intended path, and it returns at most one row. Anything else falls back to a
 * partial match, which is why the result is always an array.
 */
export async function findCustomers(query: FindCustomersQuery) {
  const seq = parseCustomerCode(query.q);

  const where = seq
    ? eq(customers.seq, seq)
    : or(ilike(customers.name, `%${query.q}%`), ilike(customers.email, `%${query.q}%`));

  const rows = await db
    .select(publicColumns)
    .from(customers)
    .where(where)
    .orderBy(desc(customers.createdAt))
    .limit(query.limit);

  return rows.map(present);
}

/**
 * Move the discount ceiling for a whole tier.
 *
 * Business policy, not a per-customer decision: it changes what the blended risk score
 * will flag on every future quotation for every customer on that tier. Existing
 * quotations are NOT re-scored — risk is recomputed on the next mutation, so a ceiling
 * change cannot silently invalidate an approval someone already gave.
 */
export async function getTierCeiling(tier: Tier) {
  const [row] = await db.select().from(tierConfig).where(eq(tierConfig.tier, tier));
  if (!row) throw ApiError.notFound(`No configuration for tier "${tier}"`);
  return { tier: row.tier, maxDiscountPct: Number(row.maxDiscountPct), updatedAt: row.updatedAt };
}

export async function updateTierCeiling(tier: Tier, maxDiscountPct: number) {
  const [updated] = await db
    .update(tierConfig)
    .set({ maxDiscountPct: maxDiscountPct.toFixed(2), updatedAt: new Date() })
    .where(eq(tierConfig.tier, tier))
    .returning();

  // The three rows are seeded by migration, so a miss means the tier is unknown.
  if (!updated) throw ApiError.notFound(`No configuration for tier "${tier}"`);

  return {
    tier: updated.tier,
    // numeric() comes back as a string; the API returns a number.
    maxDiscountPct: Number(updated.maxDiscountPct),
    updatedAt: updated.updatedAt,
  };
}

/**
 * The customer shape returned to clients. Fields are listed explicitly rather than
 * spread: it fixes the key order, and a column added to `publicColumns` later cannot
 * leak into the response by accident.
 */
function present(row: {
  id: string;
  seq: number;
  name: string;
  contactName: string | null;
  email: string;
  tier: string;
  currency: string;
  emailVerifiedAt: Date | null;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: row.id,
    customerCode: toCustomerCode(row.seq),
    name: row.name,
    contactName: row.contactName,
    email: row.email,
    tier: row.tier,
    currency: row.currency,
    verified: row.emailVerifiedAt !== null,
    active: row.active,
    createdAt: row.createdAt,
  };
}
