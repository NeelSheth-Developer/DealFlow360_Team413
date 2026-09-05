import { z } from 'zod';
import { CATEGORIES } from '../catalog/catalog.schemas.js';
import { STAGES } from '../quotations/quotations.schemas.js';

/** Comma-separated list in a query string -> array. `?repIds=a,b,c` */
const csv = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)))
    .optional();

const csvUuid = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().uuid()))
  .optional();

/**
 * The four filters the problem statement names: Period, Sales Team / Rep, Approval
 * Status, and Product / Category.
 *
 * `teamIds` is the one that is easy to leave out and should not be — the brief asks
 * for reporting by responsible rep OR TEAM, and a rep-only filter cannot answer
 * "is North discounting harder than West?".
 */
export const reportQuerySchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    repIds: csvUuid,
    teamIds: csvUuid,
    stages: csv(STAGES),
    category: z.enum(CATEGORIES).optional(),
  })
  .strict();

export type ReportQuery = z.infer<typeof reportQuerySchema>;
