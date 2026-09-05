import { Router } from 'express';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  findCustomersQuerySchema,
  tierParamSchema,
  updateTierCeilingSchema,
} from './customers.schemas.js';
import { findCustomers, updateTierCeiling } from './customers.service.js';

export const customersRouter = Router();
export const customerTiersRouter = Router();

/**
 * Internal staff only. A customer token gets 403 — the portal is a separate surface
 * with its own, much narrower shape.
 *
 * One endpoint here, deliberately. There is no `POST`: customers self-register at
 * `POST /auth/signup` with `type: "customer"`. And there is no browse-all list: `q`
 * is required, so the customer book cannot be enumerated by anyone who can sign in.
 */
customersRouter.use(requireAuth, requireKind('staff'));

/** Look up by the `CUST-0001` code the customer read out, or by name or email. */
customersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = findCustomersQuerySchema.parse(req.query);
    res.json({ success: true, data: await findCustomers(query) });
  }),
);

/**
 * The discount ceiling for a whole tier — not for one customer.
 *
 * Admin and sales_manager only: this number is one half of what bounds every
 * discount in the system, and moving it changes what the blended risk score will
 * flag on every future quotation.
 */
customerTiersRouter.patch(
  '/:tier',
  requireAuth,
  requireKind('staff'),
  requireRole('admin', 'sales_manager'),
  asyncHandler(async (req, res) => {
    const tier = tierParamSchema.parse(req.params.tier);
    const { maxDiscountPct } = updateTierCeilingSchema.parse(req.body);
    res.json({ success: true, data: await updateTierCeiling(tier, maxDiscountPct) });
  }),
);
