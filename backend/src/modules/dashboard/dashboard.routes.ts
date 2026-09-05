import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { dealHealth, escalateAlert, listAlerts, nudgeAlert } from './dashboard.service.js';

export const dashboardRouter = Router();

/**
 * Deal health.
 *
 * Reads are open to staff — a rep should be able to see their own stalled deals before
 * a manager has to point them out. Nudging and escalating are manager and admin: both
 * put a message in someone else's inbox with implied authority behind it.
 */
dashboardRouter.use(requireAuth, requireKind('staff'));

const canAct = requireRole('sales_manager', 'admin');

const alertQuerySchema = z
  .object({
    type: z
      .enum(['stalled', 'discount_anomaly', 'delivery_slippage', 'approval_bottleneck'])
      .optional(),
    severity: z.enum(['low', 'medium', 'high']).optional(),
  })
  .strict();

/** Alert ids are synthetic (`disc-<uuid>`), not database rows — see the service. */
const alertIdParam = z.string().min(3).max(80);

dashboardRouter.get(
  '/deal-health',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await dealHealth() });
  }),
);

dashboardRouter.get(
  '/alerts',
  asyncHandler(async (req, res) => {
    const filter = alertQuerySchema.parse(req.query);
    res.json({ success: true, data: await listAlerts(filter) });
  }),
);

dashboardRouter.post(
  '/alerts/:id/nudge',
  canAct,
  asyncHandler(async (req, res) => {
    const id = alertIdParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await nudgeAlert(actor, id) });
  }),
);

dashboardRouter.post(
  '/alerts/:id/escalate',
  canAct,
  asyncHandler(async (req, res) => {
    const id = alertIdParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await escalateAlert(actor, id) });
  }),
);
