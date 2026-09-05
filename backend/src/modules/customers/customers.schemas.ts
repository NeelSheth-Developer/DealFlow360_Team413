import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

/**
 * `q` is required. Without it this endpoint would list every customer in the
 * business to anyone who can sign in — a rep needs the customer in front of them,
 * not the whole book.
 */
export const findCustomersQuerySchema = z
  .object({
    q: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(1, 'A search term is required').max(255)),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const tierParamSchema = z.enum(['bronze', 'silver', 'gold']);

/**
 * The ceiling attached to a tier. `0` is legitimate — it means that tier gets no
 * discretionary discount at all — so the floor is 0, not 1.
 */
export const updateTierCeilingSchema = z
  .object({
    maxDiscountPct: z
      .number()
      .min(0, 'Cannot be negative')
      .max(100, 'Cannot exceed 100'),
  })
  .strict();

export type FindCustomersQuery = z.infer<typeof findCustomersQuerySchema>;
export type UpdateTierCeilingInput = z.infer<typeof updateTierCeilingSchema>;
