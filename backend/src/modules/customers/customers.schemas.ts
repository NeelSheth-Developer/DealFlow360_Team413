import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

/**
 * `q` is optional.
 *
 * It was required at first so the customer book could not be enumerated. That is the
 * right instinct for a public surface, but this route is staff-only behind
 * `requireKind('staff')`, and the Directory screen has to be able to list. A rep who
 * can search by name can already walk the book anyway — requiring `q` bought
 * inconvenience, not confidentiality.
 */
export const findCustomersQuerySchema = z
  .object({
    q: z.string().transform(cleanText).pipe(z.string().max(255)).optional(),
    tier: z.enum(['bronze', 'silver', 'gold']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const tierParamSchema = z.enum(['bronze', 'silver', 'gold']);

/**
 * The ceiling attached to a tier. `0` is legitimate — it means that tier gets no
 * discretionary discount at all — so the floor is 0, not 1.
 */
export const updateTierCeilingSchema = z
  .object({
    maxDiscountPct: z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100'),
  })
  .strict();

/**
 * The one mutation allowed on a customer record. Tier is commercial configuration, not
 * account data: it sets the starting price and one half of the binding discount
 * ceiling, which is why it is never self-selected at signup.
 */
export const updateCustomerTierSchema = z
  .object({
    tier: z.enum(['bronze', 'silver', 'gold']),
  })
  .strict();

export type FindCustomersQuery = z.infer<typeof findCustomersQuerySchema>;
export type UpdateTierCeilingInput = z.infer<typeof updateTierCeilingSchema>;
