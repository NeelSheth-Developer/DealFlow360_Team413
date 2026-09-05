import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createPlanSchema, updatePlanSchema } from './subscriptions.schemas.js';
import { createPlan, getPlan, listPlans, updatePlan } from './subscriptions.service.js';

export const subscriptionPlansRouter = Router();

/**
 * Recurring plan configuration. Reads open to staff (a rep picks a plan when adding a
 * subscription line); writes admin and finance, who own billing terms.
 */
subscriptionPlansRouter.use(requireAuth, requireKind('staff'));

const canWrite = requireRole('admin', 'finance');
const idParam = z.string().uuid('Invalid plan id');

subscriptionPlansRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listPlans() });
  }),
);

subscriptionPlansRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getPlan(id) });
  }),
);

subscriptionPlansRouter.post(
  '/',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = createPlanSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await createPlan(actor, input) });
  }),
);

subscriptionPlansRouter.put(
  '/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updatePlanSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updatePlan(actor, id, input) });
  }),
);
