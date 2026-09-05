import { z } from 'zod';
import { TIERS } from '../catalog/catalog.schemas.js';

export const createUpsellRuleSchema = z
  .object({
    triggerProductId: z.string().uuid(),
    suggestedProductId: z.string().uuid(),
    coPurchaseScore: z.number().min(0).max(100).default(0),
    promoted: z.boolean().default(false),
    minMarginPct: z.number().min(0).max(100).default(0),
  })
  .strict()
  .refine((rule) => rule.triggerProductId !== rule.suggestedProductId, {
    message: 'A product cannot suggest itself',
    path: ['suggestedProductId'],
  });

export const updateUpsellRuleSchema = z
  .object({
    coPurchaseScore: z.number().min(0).max(100).optional(),
    promoted: z.boolean().optional(),
    minMarginPct: z.number().min(0).max(100).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

export const suggestSchema = z
  .object({
    productIds: z.array(z.string().uuid()).min(1).max(100),
    tier: z.enum(TIERS),
    currency: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .pipe(z.string().length(3))
      .default('INR'),
    excludeProductIds: z.array(z.string().uuid()).max(100).default([]),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();

export type CreateUpsellRuleInput = z.infer<typeof createUpsellRuleSchema>;
export type UpdateUpsellRuleInput = z.infer<typeof updateUpsellRuleSchema>;
export type SuggestInput = z.infer<typeof suggestSchema>;
