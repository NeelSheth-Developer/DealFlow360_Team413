import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { createUpsellRuleSchema, suggestSchema, updateUpsellRuleSchema } from './upsell.schemas.js';
import { createRule, deleteRule, listRules, suggest, updateRule } from './upsell.service.js';

export const upsellRouter = Router();

/**
 * Upsell rules and live suggestions.
 *
 * `/suggest` is open to every staff role — it is what the rep sees beside the cart
 * while building a quotation. Rule management is admin and sales_manager, who own the
 * promotion and margin-floor policy behind it.
 */
upsellRouter.use(requireAuth, requireKind('staff'));

const canWrite = requireRole('admin', 'sales_manager');
const idParam = z.string().uuid('Invalid rule id');

upsellRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listRules() });
  }),
);

/**
 * Declared before `/:id` handlers that could shadow it. A POST to a literal path and a
 * POST to the collection do not collide, but keeping the literal first is the habit
 * that prevents the bug when a `POST /:id/...` is added later.
 */
upsellRouter.post(
  '/suggest',
  asyncHandler(async (req, res) => {
    const input = suggestSchema.parse(req.body);
    res.json({ success: true, data: await suggest(input) });
  }),
);

upsellRouter.post(
  '/',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = createUpsellRuleSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await createRule(actor, input) });
  }),
);

upsellRouter.put(
  '/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateUpsellRuleSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateRule(actor, id, input) });
  }),
);

upsellRouter.delete(
  '/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await deleteRule(actor, id) });
  }),
);
