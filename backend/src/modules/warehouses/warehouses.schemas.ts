import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

export const createWarehouseSchema = z
  .object({
    name: text(120),
    location: z.string().transform(cleanText).pipe(z.string().max(200)).nullable().default(null),
    /**
     * The split algorithm's cost tie-breaker. A floor of 0.1 rather than 0: a weight
     * of zero makes a warehouse free to ship from, which would collapse the whole
     * ordering onto that one site.
     */
    shippingCostWeight: z.number().min(0.1).max(100).default(1),
    baseShipCost: z.number().min(0).max(9_999_999).default(0),
    replenishThreshold: z.number().int().min(0).max(1_000_000).default(0),
    replenishQty: z.number().int().min(0).max(1_000_000).default(0),
    replenishLeadDays: z.number().int().min(0).max(365).default(0),
  })
  .strict();

export const updateWarehouseSchema = createWarehouseSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

/**
 * A partial map — only the products being changed. Absent keys are left alone rather
 * than zeroed, so a client that knows about one product cannot wipe the rest.
 */
export const updateStockSchema = z
  .object({
    stock: z.record(z.string().uuid(), z.number().int().min(0).max(10_000_000)),
  })
  .strict();

export const splitOrderSchema = z
  .object({
    order_lines: z
      .array(
        z.object({
          product_id: z.string().uuid('Invalid product id'),
          qty: z.number().int().min(1),
        }),
      )
      .min(1),
  })
  .strict();

export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type UpdateStockInput = z.infer<typeof updateStockSchema>;
export type SplitOrderInput = z.infer<typeof splitOrderSchema>;
