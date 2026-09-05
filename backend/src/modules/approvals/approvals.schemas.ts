import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

export const approveSchema = z
  .object({
    comment: z.string().transform(cleanText).pipe(z.string().max(1000)).nullable().default(null),
  })
  .strict();

/**
 * A reason is required on both reject and return, minimum 10 characters.
 *
 * The problem statement requires rejections to be logged with a reason, and a rep who
 * is told only "rejected" has to guess what to change. Ten characters is short enough
 * not to be an obstacle and long enough to rule out "no" and "nope".
 */
export const rejectSchema = z
  .object({
    reason: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(10, 'Give a reason of at least 10 characters').max(2000)),
  })
  .strict();

export type ApproveInput = z.infer<typeof approveSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
