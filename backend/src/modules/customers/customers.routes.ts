import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  findCustomersQuerySchema,
  tierParamSchema,
  updateCustomerTierSchema,
  updateTierCeilingSchema,
} from './customers.schemas.js';
import {
  findCustomers,
  getCustomer,
  getTierCeiling,
  updateCustomerTier,
  updateTierCeiling,
} from './customers.service.js';

export const customersRouter = Router();
export const customerTiersRouter = Router();

/**
 * The customer directory.
 *
 * Internal staff only — a customer token gets 403 here, because the portal is a
 * separate surface with its own much narrower shape.
 *
 * There is no `POST`: customers self-register at `POST /auth/signup` with
 * `type: "customer"`, so every record has proved its own email and set its own
 * password. And there is no `DELETE`: a customer with quotations against them must
 * keep resolving.
 */
customersRouter.use(requireAuth, requireKind('staff'));

const idParam = z.string().uuid('Invalid customer id');

/** Lists the directory, or looks one up by `DF-CMC827`, name, contact or email. */
customersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = findCustomersQuerySchema.parse(req.query);
    const { data, meta } = await findCustomers(query);
    res.json({ success: true, data, meta });
  }),
);

customersRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getCustomer(id) });
  }),
);

/**
 * Promote or demote the pricing tier. The only mutation allowed on a customer record,
 * and restricted to the roles that own commercial policy.
 */
customersRouter.patch(
  '/:id/tier',
  requireRole('admin', 'sales_manager'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { tier } = updateCustomerTierSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateCustomerTier(actor, id, tier) });
  }),
);

/**
 * The discount ceiling for a whole tier — not for one customer.
 *
 * Admin and sales_manager only: this number is one half of what bounds every discount
 * in the system, and moving it changes what the blended risk score will flag on every
 * future quotation.
 *
 * `GET /config/discount` returns all three tiers, the category ceilings and the
 * approval chain together; these two routes are the per-tier form.
 */
customerTiersRouter.use(requireAuth, requireKind('staff'), requireRole('admin', 'sales_manager'));

customerTiersRouter.get(
  '/:tier',
  asyncHandler(async (req, res) => {
    const tier = tierParamSchema.parse(req.params.tier);
    res.json({ success: true, data: await getTierCeiling(tier) });
  }),
);

customerTiersRouter.patch(
  '/:tier',
  asyncHandler(async (req, res) => {
    const tier = tierParamSchema.parse(req.params.tier);
    const { maxDiscountPct } = updateTierCeilingSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateTierCeiling(actor, tier, maxDiscountPct) });
  }),
);
