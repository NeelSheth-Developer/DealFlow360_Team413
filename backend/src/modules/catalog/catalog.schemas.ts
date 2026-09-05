import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

export const CATEGORIES = ['hardware', 'service', 'subscription', 'accessories'] as const;
export const TIERS = ['bronze', 'silver', 'gold'] as const;

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

const moneyValue = z
  .number()
  .min(0, 'Cannot be negative')
  .max(99_999_999_999.99, 'Value is too large')
  // Guards the numeric(14,2) column: a third decimal would be silently rounded by
  // Postgres, so the price stored would not be the price sent.
  .refine((value) => Number.isFinite(value) && Math.round(value * 100) === value * 100, {
    message: 'At most 2 decimal places',
  });

const variantSchema = z
  .object({
    attribute: text(60),
    value: text(60),
    extraPrice: moneyValue.default(0),
  })
  .strict();

/**
 * `costPrice` is required. Margin is derived from it, the upsell panel refuses to rank
 * a product without it, and a nullable cost would make every margin figure downstream
 * quietly optional.
 */
export const createProductSchema = z
  .object({
    name: text(200),
    sku: z
      .string()
      .transform((value) => cleanText(value).toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9-]{2,40}$/, 'Letters, digits and dashes only')),
    category: z.enum(CATEGORIES),
    basePrice: moneyValue,
    costPrice: moneyValue,
    unit: text(24).default('unit'),
    taxPct: z.number().min(0).max(100).default(0),
    description: z
      .string()
      .transform(cleanText)
      .pipe(z.string().max(2000))
      .nullable()
      .default(null),
    variants: z.array(variantSchema).max(50).default([]),
  })
  .strict();

/** Same shape, every field optional. `sku` cannot be changed once quotations reference it. */
export const updateProductSchema = createProductSchema
  .omit({ sku: true })
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

export const setActiveSchema = z.object({ active: z.boolean() }).strict();

export const listProductsQuerySchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    search: z.string().max(255).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export const priceListQuerySchema = z
  .object({
    productId: z.string().uuid().optional(),
    tier: z.enum(TIERS).optional(),
    currency: z.string().length(3).optional(),
  })
  .strict();

export const upsertPriceSchema = z
  .object({
    productId: z.string().uuid(),
    tier: z.enum(TIERS),
    currency: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .pipe(z.string().length(3, 'Use a 3-letter ISO 4217 code')),
    price: moneyValue,
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type PriceListQuery = z.infer<typeof priceListQuerySchema>;
export type UpsertPriceInput = z.infer<typeof upsertPriceSchema>;
