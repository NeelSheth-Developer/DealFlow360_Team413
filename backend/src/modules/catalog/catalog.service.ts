import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  priceLists,
  productVariants,
  products,
  type Category,
  type Tier,
} from '../../db/schema.js';
import { audit, type AuditActor } from '../../lib/audit.js';
import { money, num, pct } from '../../lib/money.js';
import { ApiError } from '../../utils/api-error.js';
import type {
  CreateProductInput,
  ListProductsQuery,
  PriceListQuery,
  UpdateProductInput,
  UpsertPriceInput,
} from './catalog.schemas.js';

/**
 * Products, variants and tier price lists.
 *
 * `costPrice` is present on every shape this module returns, and every one of them is
 * staff-only. The portal builds its projection from a different module entirely
 * (`modules/portal`), so there is no path by which a cost or a margin can reach a
 * customer through here.
 */

const DEFAULT_CURRENCY = 'INR';

/**
 * Tier pricing generated on create so a new product is immediately quotable.
 *
 * Bronze is list; silver and gold step down. Rounded to the nearest 50 because a
 * price list is a published document — `87,400` reads like a decision, `87,398.40`
 * reads like a spreadsheet artefact.
 */
const TIER_FACTOR: Record<Tier, number> = { bronze: 1, silver: 0.96, gold: 0.92 };

function tierPrice(basePrice: number, tier: Tier): number {
  return Math.round((basePrice * TIER_FACTOR[tier]) / 50) * 50;
}

export async function listProducts(query: ListProductsQuery) {
  const filters: SQL[] = [];
  if (query.category) filters.push(eq(products.category, query.category));
  if (query.active !== undefined) filters.push(eq(products.active, query.active));
  if (query.search) {
    const term = `%${query.search}%`;
    const search = or(ilike(products.name, term), ilike(products.sku, term));
    if (search) filters.push(search);
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.limit;

  const [rows, [totals]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(asc(products.name))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  const variants = await variantsFor(rows.map((row) => row.id));
  const total = totals?.total ?? 0;

  return {
    data: rows.map((row) => present(row, variants.get(row.id) ?? [])),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getProduct(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) throw ApiError.notFound('Product not found');

  const variants = await variantsFor([id]);
  return present(row, variants.get(id) ?? []);
}

export async function createProduct(actor: AuditActor, input: CreateProductInput) {
  const [clash] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, input.sku))
    .limit(1);

  if (clash) throw ApiError.conflict('SKU_TAKEN', `SKU "${input.sku}" is already in use`);

  const [created] = await db
    .insert(products)
    .values({
      name: input.name,
      sku: input.sku,
      category: input.category,
      basePrice: money(input.basePrice),
      costPrice: money(input.costPrice),
      unit: input.unit,
      taxPct: pct(input.taxPct),
      description: input.description,
    })
    .returning();

  if (!created) throw ApiError.notFound('Product not found');

  if (input.variants.length > 0) {
    await db.insert(productVariants).values(
      input.variants.map((variant) => ({
        productId: created.id,
        attribute: variant.attribute,
        value: variant.value,
        extraPrice: money(variant.extraPrice),
      })),
    );
  }

  // Generated here rather than on first quote so the product is quotable the moment
  // it exists — a rep should never hit "no price for this tier" on a brand-new item.
  await db.insert(priceLists).values(
    (['bronze', 'silver', 'gold'] as Tier[]).map((tier) => ({
      productId: created.id,
      tier,
      currency: DEFAULT_CURRENCY,
      price: money(tierPrice(input.basePrice, tier)),
    })),
  );

  await audit({
    entityType: 'product',
    entityId: created.id,
    action: `Product created: ${created.name}`,
    actor,
    meta: { sku: created.sku, category: created.category, basePrice: input.basePrice },
  });

  return getProduct(created.id);
}

export async function updateProduct(actor: AuditActor, id: string, input: UpdateProductInput) {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Product not found');

  await db
    .update(products)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.basePrice !== undefined ? { basePrice: money(input.basePrice) } : {}),
      ...(input.costPrice !== undefined ? { costPrice: money(input.costPrice) } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.taxPct !== undefined ? { taxPct: pct(input.taxPct) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(products.id, id));

  // Replaced wholesale rather than diffed: the client sends the complete variant set,
  // and matching them up by attribute/value would guess at an identity the API does
  // not expose.
  if (input.variants !== undefined) {
    await db.delete(productVariants).where(eq(productVariants.productId, id));
    if (input.variants.length > 0) {
      await db.insert(productVariants).values(
        input.variants.map((variant) => ({
          productId: id,
          attribute: variant.attribute,
          value: variant.value,
          extraPrice: money(variant.extraPrice),
        })),
      );
    }
  }

  await audit({
    entityType: 'product',
    entityId: id,
    action: `Product updated: ${input.name ?? existing.name}`,
    actor,
    meta: { changed: Object.keys(input) },
  });

  return getProduct(id);
}

/**
 * Archive or restore. Never a delete: a product on a historical quotation must keep
 * resolving, and a hard delete would either orphan those lines or cascade away an
 * approved order.
 */
export async function setProductActive(actor: AuditActor, id: string, active: boolean) {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Product not found');

  await db.update(products).set({ active, updatedAt: new Date() }).where(eq(products.id, id));

  await audit({
    entityType: 'product',
    entityId: id,
    action: active ? `Product restored: ${existing.name}` : `Product archived: ${existing.name}`,
    actor,
  });

  return getProduct(id);
}

/** Copies a product, its variants and its prices under a new SKU. */
export async function duplicateProduct(actor: AuditActor, id: string) {
  const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Product not found');

  const sku = await freeSku(existing.sku);

  const [created] = await db
    .insert(products)
    .values({
      name: `${existing.name} (copy)`,
      sku,
      category: existing.category,
      basePrice: existing.basePrice,
      costPrice: existing.costPrice,
      unit: existing.unit,
      taxPct: existing.taxPct,
      description: existing.description,
      // A duplicate starts archived. It is a draft of a product, and an accidental
      // copy appearing in the rep's picker alongside the original is a real hazard.
      active: false,
    })
    .returning();

  if (!created) throw ApiError.notFound('Product not found');

  const [variants, prices] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)),
    db.select().from(priceLists).where(eq(priceLists.productId, id)),
  ]);

  if (variants.length > 0) {
    await db.insert(productVariants).values(
      variants.map((variant) => ({
        productId: created.id,
        attribute: variant.attribute,
        value: variant.value,
        extraPrice: variant.extraPrice,
      })),
    );
  }

  if (prices.length > 0) {
    await db.insert(priceLists).values(
      prices.map((price) => ({
        productId: created.id,
        tier: price.tier,
        currency: price.currency,
        price: price.price,
      })),
    );
  }

  await audit({
    entityType: 'product',
    entityId: created.id,
    action: `Product duplicated from ${existing.sku}`,
    actor,
    meta: { from: existing.id, sku },
  });

  return getProduct(created.id);
}

/** `HW-LP14` -> `HW-LP14-COPY`, then `-COPY2`, until one is free. */
async function freeSku(base: string): Promise<string> {
  for (let i = 1; i <= 50; i += 1) {
    const candidate = i === 1 ? `${base}-COPY` : `${base}-COPY${i}`;
    if (candidate.length > 40) break;

    const [clash] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, candidate))
      .limit(1);

    if (!clash) return candidate;
  }
  throw ApiError.conflict('SKU_TAKEN', 'Could not derive a free SKU for the duplicate');
}

export async function listPrices(query: PriceListQuery) {
  const filters: SQL[] = [];
  if (query.productId) filters.push(eq(priceLists.productId, query.productId));
  if (query.tier) filters.push(eq(priceLists.tier, query.tier));
  if (query.currency) filters.push(eq(priceLists.currency, query.currency.toUpperCase()));

  const rows = await db
    .select({
      productId: priceLists.productId,
      productName: products.name,
      sku: products.sku,
      tier: priceLists.tier,
      currency: priceLists.currency,
      price: priceLists.price,
      updatedAt: priceLists.updatedAt,
    })
    .from(priceLists)
    .innerJoin(products, eq(products.id, priceLists.productId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(products.name), asc(priceLists.tier));

  return rows.map((row) => ({
    productId: row.productId,
    productName: row.productName,
    sku: row.sku,
    tier: row.tier,
    currency: row.currency,
    price: num(row.price),
    updatedAt: row.updatedAt,
  }));
}

export async function upsertPrice(actor: AuditActor, input: UpsertPriceInput) {
  const [product] = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(eq(products.id, input.productId))
    .limit(1);

  if (!product) throw ApiError.notFound('Product not found');

  const [before] = await db
    .select({ price: priceLists.price })
    .from(priceLists)
    .where(
      and(
        eq(priceLists.productId, input.productId),
        eq(priceLists.tier, input.tier),
        eq(priceLists.currency, input.currency),
      ),
    )
    .limit(1);

  await db
    .insert(priceLists)
    .values({
      productId: input.productId,
      tier: input.tier,
      currency: input.currency,
      price: money(input.price),
    })
    .onConflictDoUpdate({
      target: [priceLists.productId, priceLists.tier, priceLists.currency],
      set: { price: money(input.price), updatedAt: new Date() },
    });

  await audit({
    entityType: 'price_list',
    entityId: input.productId,
    action: `Price set for ${product.name} (${input.tier}, ${input.currency})`,
    actor,
    meta: { from: before ? num(before.price) : null, to: input.price },
  });

  return listPrices({ productId: input.productId });
}

/**
 * The price a specific customer pays for a product, before any discount.
 *
 * Falls back to the product's base price when no row exists for the tier and currency.
 * That is deliberate: a missing price list row should not block a quotation — it
 * should quote at list, which is the conservative direction.
 */
export async function resolveUnitPrice(
  productId: string,
  tier: Tier,
  currency: string,
): Promise<number> {
  const [row] = await db
    .select({ price: priceLists.price })
    .from(priceLists)
    .where(
      and(
        eq(priceLists.productId, productId),
        eq(priceLists.tier, tier),
        eq(priceLists.currency, currency),
      ),
    )
    .limit(1);

  if (row) return num(row.price);

  const [product] = await db
    .select({ basePrice: products.basePrice })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) throw ApiError.notFound('Product not found');
  return num(product.basePrice);
}

async function variantsFor(productIds: string[]) {
  const map = new Map<string, { attribute: string; value: string; extraPrice: number }[]>();
  if (productIds.length === 0) return map;

  const rows = await db
    .select()
    .from(productVariants)
    .where(inArray(productVariants.productId, productIds));

  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({ attribute: row.attribute, value: row.value, extraPrice: num(row.extraPrice) });
    map.set(row.productId, list);
  }

  return map;
}

/**
 * The single product shape every staff endpoint returns. Listed explicitly rather than
 * spread so a column added later cannot leak into the response — which matters more
 * here than elsewhere, because `costPrice` lives on this row.
 */
function present(
  row: {
    id: string;
    name: string;
    sku: string;
    category: Category;
    basePrice: string;
    costPrice: string;
    unit: string;
    taxPct: string;
    description: string | null;
    active: boolean;
    createdAt: Date;
  },
  variants: { attribute: string; value: string; extraPrice: number }[],
) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    basePrice: num(row.basePrice),
    costPrice: num(row.costPrice),
    unit: row.unit,
    taxPct: num(row.taxPct),
    description: row.description,
    variants,
    active: row.active,
    createdAt: row.createdAt,
  };
}
