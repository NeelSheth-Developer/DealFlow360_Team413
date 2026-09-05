import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

/**
 * `role` is the only field here that grants anything, which is why the whole module
 * is admin-gated. Note there is deliberately no create schema: staff accounts come
 * from `POST /auth/signup` only, so every account has proved its own email and set
 * its own password.
 */
/**
 * Assignable through the API. `admin` is deliberately absent: it is granted only by
 * `npm run seed:admin`, from the backend, by someone with database access. Because
 * the schema is `.strict()` on an enum, `role: "admin"` is rejected at the edge with
 * 400 — the service never sees it.
 */
export const ASSIGNABLE_ROLES = ['sales_rep', 'sales_manager', 'finance'] as const;

export const updateUserSchema = z
  .object({
    role: z.enum(ASSIGNABLE_ROLES).optional(),
    name: z.string().transform(cleanText).pipe(z.string().min(1).max(120)).optional(),
    active: z.boolean().optional(),
    /**
     * Sales territory. Nullable — clearing it returns the rep to "Unassigned", which
     * is a legitimate state, not a gap to be avoided.
     *
     * A rep never sets this themselves: it is absent from the signup schema entirely,
     * so team placement is assigned by an admin or manager from the directory. That
     * keeps the reporting rollup trustworthy without an extra field on signup that a
     * new hire could not answer correctly anyway.
     */
    teamId: z.string().uuid().nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

export const listUsersQuerySchema = z
  .object({
    // Filtering by `admin` is allowed — an admin must be able to see who the other
    // admins are. Only *assigning* the role is blocked.
    role: z.enum(['sales_rep', 'sales_manager', 'finance', 'admin']).optional(),
    active: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    teamId: z.string().uuid().optional(),
    q: z.string().max(255).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
