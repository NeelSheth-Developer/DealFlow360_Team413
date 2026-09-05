import { Router } from 'express';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { approvalQueue } from './approvals.service.js';

export const approvalsRouter = Router();

/**
 * The approver's work list.
 *
 * The per-quotation approval actions live on `/quotations/:id/...` because they are
 * addressed by quotation; this is the one approval route that is not.
 */
approvalsRouter.use(requireAuth, requireKind('staff'));

/**
 * Quotations whose CURRENT step matches the caller's role. A rep has no queue — they
 * approve nothing — so the route is restricted to the three roles that can act.
 */
approvalsRouter.get(
  '/queue',
  requireRole('sales_manager', 'finance', 'admin'),
  asyncHandler(async (req, res) => {
    const actor = await resolveActor(req);
    res.json({ success: true, data: await approvalQueue(actor) });
  }),
);
