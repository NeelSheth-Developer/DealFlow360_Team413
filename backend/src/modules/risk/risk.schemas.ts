import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';
import { CATEGORIES, TIERS } from '../catalog/catalog.schemas.js';

const riskLineSchema = z
  .object({
    id: z.string().nullable().default(null),
    productId: z.string().optional(),
    productName: z.string().transform(cleanText).pipe(z.string().max(200)).default(''),
    category: z.enum(CATEGORIES),
    qty: z.number().min(0).max(1_000_000),
    unitPrice: z.number().min(0).max(99_999_999_999),
    discountPct: z.number().min(0).max(100),
  })
  .strict();

/**
 * `quotationId` is null when the request comes from the admin risk sandbox, which
 * scores hypothetical lines that are not a saved quotation. It is a free-form string
 * rather than a uuid for the same reason — the sandbox may label a scenario.
 *
 * `tierCeiling` and `categoryCeilings` are optional OVERRIDES, and only the sandbox
 * sends them. Every real routing path omits them and gets stored config, so a client
 * can never widen its own ceiling on the path that decides approvals.
 */
export const scoreSchema = z
  .object({
    quotationId: z.string().max(64).nullable().default(null),
    tier: z.enum(TIERS),
    orderDiscountPct: z.number().min(0).max(100).default(0),
    lines: z.array(riskLineSchema).max(200).default([]),
    tierCeiling: z.number().min(0).max(100).optional(),
    categoryCeilings: z
      .object({
        hardware: z.number().min(0).max(100).optional(),
        service: z.number().min(0).max(100).optional(),
        subscription: z.number().min(0).max(100).optional(),
        accessories: z.number().min(0).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const scoreBatchSchema = z
  .object({
    quotations: z.array(scoreSchema).min(1).max(50),
  })
  .strict();

const blendedScoreLineSchema = z
  .object({
    lineId: z.string(),
    category: z.enum(CATEGORIES),
    discountPct: z.number().min(0).max(100),
    lineTotal: z.number().min(0),
  })
  .strict();

export const blendedScoreSchema = z
  .object({
    customerTier: z.enum(TIERS),
    lines: z.array(blendedScoreLineSchema).min(1).max(200),
  })
  .strict();

export type ScoreInput = z.infer<typeof scoreSchema>;
export type ScoreBatchInput = z.infer<typeof scoreBatchSchema>;
export type BlendedScoreSchemaInput = z.infer<typeof blendedScoreSchema>;
