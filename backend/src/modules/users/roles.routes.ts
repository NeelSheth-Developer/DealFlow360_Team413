import { Router } from 'express';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { listAssignableRoles } from './users.service.js';

export const rolesRouter = Router();

/**
 * The roles an admin may assign, for the role picker on the team screen.
 *
 * `admin` is NOT in this list. It is granted only by `npm run seed:admin`, run from
 * the backend by someone with database access — so the list here and the enum that
 * `PATCH /users/:id` accepts are the same three values. Driving the picker from the
 * server keeps them from drifting apart.
 */
rolesRouter.get(
  '/',
  requireAuth,
  requireKind('staff'),
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listAssignableRoles() });
  }),
);
