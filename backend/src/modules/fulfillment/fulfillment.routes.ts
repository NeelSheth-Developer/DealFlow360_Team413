import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { backorderPolicySchema, overrideSchema } from './fulfillment.schemas.js';
import {
  acceptPlan,
  consolidate,
  getPlan,
  overridePlan,
  setBackorderPolicy,
} from './fulfillment.service.js';

export const fulfillmentRouter = Router({ mergeParams: true });

/**
 * Fulfillment, mounted under `/quotations/:id/fulfillment`.
 *
 * `mergeParams` is what makes `:id` from the parent path visible here — without it the
 * quotation id would be undefined and every handler would 404.
 *
 * Reads are open to staff so a rep can explain a delivery date. Writes are the owning
 * roles plus finance, who the brief puts in charge of fulfillment splits and backorder
 * decisions.
 */
fulfillmentRouter.use(requireAuth, requireKind('staff'));

const canWrite = requireRole('sales_rep', 'sales_manager', 'finance', 'admin');
const idParam = z.string().uuid('Invalid quotation id');

/**
 * Express types a merged param as `string | string[]` — a repeated `:id` in the path
 * would produce an array. Parsing through zod rejects that rather than quietly
 * stringifying it into a lookup that can never match.
 */
function quotationId(req: Request): string {
  return idParam.parse(req.params.id);
}

/** Recomputed from live stock unless a plan was accepted or overridden. */
fulfillmentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getPlan(quotationId(req)) });
  }),
);

fulfillmentRouter.post(
  '/accept',
  canWrite,
  asyncHandler(async (req, res) => {
    const actor = await resolveActor(req);
    res.json({ success: true, data: await acceptPlan(actor, quotationId(req)) });
  }),
);

/** Returns per-cell errors on 422 so the UI can highlight the exact input. */
fulfillmentRouter.post(
  '/override',
  canWrite,
  asyncHandler(async (req, res) => {
    const { allocations } = overrideSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({
      success: true,
      data: await overridePlan(actor, quotationId(req), allocations),
    });
  }),
);

fulfillmentRouter.post(
  '/consolidate',
  canWrite,
  asyncHandler(async (req, res) => {
    const actor = await resolveActor(req);
    res.json({ success: true, data: await consolidate(actor, quotationId(req)) });
  }),
);

fulfillmentRouter.post(
  '/backorder-policy',
  canWrite,
  asyncHandler(async (req, res) => {
    const { policy } = backorderPolicySchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({
      success: true,
      data: await setBackorderPolicy(actor, quotationId(req), policy),
    });
  }),
);
