import { z } from 'zod';

export const overrideSchema = z
  .object({
    allocations: z
      .array(
        z
          .object({
            lineId: z.string().uuid(),
            warehouseId: z.string().uuid(),
            qty: z.number().int().min(0).max(1_000_000),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const backorderPolicySchema = z
  .object({
    policy: z.enum(['ship_available', 'hold_until_complete']),
  })
  .strict();

export type OverrideInput = z.infer<typeof overrideSchema>;
