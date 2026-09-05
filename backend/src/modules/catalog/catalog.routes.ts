import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  priceListQuerySchema,
  setActiveSchema,
  updateProductSchema,
  upsertPriceSchema,
} from './catalog.schemas.js';
import {
  createProduct,
  duplicateProduct,
  getProduct,
  listPrices,
  listProducts,
  setProductActive,
  updateProduct,
  upsertPrice,
} from './catalog.service.js';

export const productsRouter = Router();
export const priceListsRouter = Router();

/**
 * The catalogue.
 *
 * Every response here carries `costPrice`, so the whole module is staff-only — a
 * customer token gets 403 at the router, before any handler runs. Reads are open to
 * all staff (a rep cannot quote what they cannot see); writes are admin only, matching
 * the brief's description of the admin as the owner of backend setup.
 */
productsRouter.use(requireAuth, requireKind('staff'));
priceListsRouter.use(requireAuth, requireKind('staff'));

const canWrite = requireRole('admin');
const idParam = z.string().uuid('Invalid product id');

productsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listProductsQuerySchema.parse(req.query);
    const { data, meta } = await listProducts(query);
    res.json({ success: true, data, meta });
  }),
);

productsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getProduct(id) });
  }),
);

productsRouter.post(
  '/',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = createProductSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await createProduct(actor, input) });
  }),
);

productsRouter.put(
  '/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateProductSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateProduct(actor, id, input) });
  }),
);

/** Archive or restore. There is no delete — see the service for why. */
productsRouter.patch(
  '/:id/active',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { active } = setActiveSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await setProductActive(actor, id, active) });
  }),
);

productsRouter.post(
  '/:id/duplicate',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await duplicateProduct(actor, id) });
  }),
);

/**
 * Tier pricing is not a discount — it is the starting price for that customer, and a
 * rep's discount applies on top of it and is measured against the ceilings.
 */
priceListsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = priceListQuerySchema.parse(req.query);
    res.json({ success: true, data: await listPrices(query) });
  }),
);

priceListsRouter.put(
  '/',
  requireRole('admin', 'sales_manager'),
  asyncHandler(async (req, res) => {
    const input = upsertPriceSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await upsertPrice(actor, input) });
  }),
);
