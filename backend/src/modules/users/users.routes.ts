import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { listUsersQuerySchema, updateUserSchema } from './users.schemas.js';
import { getUser, listUsers, updateUser } from './users.service.js';

export const usersRouter = Router();

/**
 * The staff directory.
 *
 * Reads are open to every staff role — assigning a quotation to a colleague needs the
 * list, and the directory carries no credential material of any kind.
 *
 * Writes are admin and sales_manager, with the sharper split enforced in the service:
 * a manager may rename someone or move them between teams, but only an admin can
 * change a `role` or deactivate an account.
 *
 * There is no `POST` here on purpose. Staff accounts are created exclusively by
 * `POST /auth/signup`, so every account has proved its own email and chosen its own
 * password — an admin-created account would need an invite flow to do either.
 *
 * The FIRST admin cannot come from this API at all: signup always produces a
 * `sales_rep`, and promoting requires an existing admin. It is seeded from the
 * backend with `npm run seed:admin`. That is what makes admin unreachable from
 * outside.
 */
usersRouter.use(requireAuth, requireKind('staff'));

const idParam = z.string().uuid('Invalid user id');

/** The staff list an admin uses to see who holds which role. */
usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listUsersQuerySchema.parse(req.query);
    const { data, meta } = await listUsers(query);
    res.json({ success: true, data, meta });
  }),
);

usersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getUser(id) });
  }),
);

/**
 * Promote, demote, rename, reassign a team, or deactivate. The only path to a non-rep
 * role. Which of those a caller may actually do depends on their role — see the
 * service.
 */
usersRouter.patch(
  '/:id',
  requireRole('admin', 'sales_manager'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const patch = updateUserSchema.parse(req.body);
    if (!req.auth) throw ApiError.unauthorized();

    res.json({
      success: true,
      data: await updateUser(req.auth.id, req.auth.role ?? 'sales_rep', id, patch),
    });
  }),
);
