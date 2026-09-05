import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

export const CADENCES = ['monthly', 'quarterly', 'yearly'] as const;
export const PRORATION_RULES = ['daily_prorate', 'full_period', 'next_cycle_adjust'] as const;
export const CANCELLATION_RULES = ['refund_unused', 'no_refund', 'credit_note_only'] as const;

export const createPlanSchema = z
  .object({
    name: z.string().transform(cleanText).pipe(z.string().min(1).max(160)),
    cadence: z.enum(CADENCES),
    prorationRule: z.enum(PRORATION_RULES).default('daily_prorate'),
    cancellationRule: z.enum(CANCELLATION_RULES).default('refund_unused'),
    minCommitmentMonths: z.number().int().min(0).max(120).default(0),
    trialDays: z.number().int().min(0).max(365).default(0),
    // 28 rather than 31: a plan billing on the 30th would skip February entirely.
    billingDayOfCycle: z.number().int().min(1).max(28).default(1),
    productIds: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();

export const updatePlanSchema = createPlanSchema
  .partial()
  .extend({ active: z.boolean().optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
