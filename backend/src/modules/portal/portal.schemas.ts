import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

export const portalCommentSchema = z
  .object({
    message: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(1, 'Message cannot be empty').max(2000)),
  })
  .strict();

/**
 * Either field may be omitted, but not both — a request with neither a number nor a
 * sentence gives the rep nothing to act on.
 */
export const counterRequestSchema = z
  .object({
    counterDiscountPct: z.number().min(0).max(100).nullable().default(null),
    justification: z
      .string()
      .transform(cleanText)
      .pipe(z.string().max(2000))
      .nullable()
      .default(null),
  })
  .strict()
  .refine((body) => body.counterDiscountPct !== null || (body.justification ?? '').length > 0, {
    message: 'Give a discount figure, a justification, or both',
  });

export type CounterRequestInput = z.infer<typeof counterRequestSchema>;
