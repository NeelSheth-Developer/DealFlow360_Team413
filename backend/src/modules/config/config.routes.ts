import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { actorFrom } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  approvalRuleSchema,
  categoryCeilingsSchema,
  dashboardConfigSchema,
  patchCategoryCeilingsSchema,
  patchDashboardConfigSchema,
  patchTierCeilingsSchema,
  reorderChainSchema,
  tierCeilingsSchema,
} from './config.schemas.js';
import {
  addRule,
  deleteRule,
  getDashboardConfig,
  getDiscountConfig,
  listChain,
  patchCategoryCeilings,
  patchDashboardConfig,
  patchTierCeilings,
  reorderChain,
  setCategoryCeilings,
  setDashboardConfig,
  setTierCeilings,
  updateRule,
} from './config.service.js';

export const configRouter = Router();

/**
 * Governance configuration.
 *
 * Reads are open to the three roles that need to understand why a quotation routed the
 * way it did; writes are admin and sales_manager only. A sales_rep can see neither —
 * knowing the exact ceilings makes it trivial to price a quote to sit one basis point
 * under the trip, which is the behaviour the governance rules exist to prevent.
 */
configRouter.use(requireAuth, requireKind('staff'));

const canRead = requireRole('admin', 'sales_manager', 'finance');
const canWrite = requireRole('admin', 'sales_manager');

const idParam = z.string().uuid('Invalid rule id');

/** Tier ceilings, category ceilings and the approval chain together. */
configRouter.get(
  '/discount',
  canRead,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getDiscountConfig() });
  }),
);

configRouter.put(
  '/discount/tier-ceilings',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = tierCeilingsSchema.parse(req.body);
    res.json({ success: true, data: await setTierCeilings(actorFrom(req), input) });
  }),
);

configRouter.patch(
  '/discount/tier-ceilings',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = patchTierCeilingsSchema.parse(req.body);
    res.json({ success: true, data: await patchTierCeilings(actorFrom(req), input) });
  }),
);

configRouter.put(
  '/discount/category-ceilings',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = categoryCeilingsSchema.parse(req.body);
    res.json({ success: true, data: await setCategoryCeilings(actorFrom(req), input) });
  }),
);

configRouter.patch(
  '/discount/category-ceilings',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = patchCategoryCeilingsSchema.parse(req.body);
    res.json({ success: true, data: await patchCategoryCeilings(actorFrom(req), input) });
  }),
);

configRouter.get(
  '/approval-chain',
  canRead,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listChain() });
  }),
);

configRouter.post(
  '/approval-chain',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = approvalRuleSchema.parse(req.body);
    res.status(201).json({ success: true, data: await addRule(actorFrom(req), input) });
  }),
);

/**
 * Registered before `/:id` so the literal path is not swallowed by the parameter —
 * Express matches in declaration order, and `order` is a valid-looking `:id`.
 */
configRouter.put(
  '/approval-chain/order',
  canWrite,
  asyncHandler(async (req, res) => {
    const { ids } = reorderChainSchema.parse(req.body);
    res.json({ success: true, data: await reorderChain(actorFrom(req), ids) });
  }),
);

configRouter.put(
  '/approval-chain/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = approvalRuleSchema.parse(req.body);
    res.json({ success: true, data: await updateRule(actorFrom(req), id, input) });
  }),
);

configRouter.delete(
  '/approval-chain/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await deleteRule(actorFrom(req), id) });
  }),
);

configRouter.get(
  '/dashboard',
  canRead,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await getDashboardConfig() });
  }),
);

configRouter.put(
  '/dashboard',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = dashboardConfigSchema.parse(req.body);
    res.json({ success: true, data: await setDashboardConfig(actorFrom(req), input) });
  }),
);

configRouter.patch(
  '/dashboard',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = patchDashboardConfigSchema.parse(req.body);
    res.json({ success: true, data: await patchDashboardConfig(actorFrom(req), input) });
  }),
);
