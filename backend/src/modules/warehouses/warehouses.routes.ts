import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  createWarehouseSchema,
  updateStockSchema,
  updateWarehouseSchema,
} from './warehouses.schemas.js';
import {
  createWarehouse,
  getWarehouse,
  listWarehouses,
  restock,
  updateStock,
  updateWarehouse,
} from './warehouses.service.js';

export const warehousesRouter = Router();

/**
 * Warehouse configuration and stock.
 *
 * Reads are open to all staff — a rep needs to see where stock sits to explain a
 * delivery date. Writes are admin and finance: the brief puts warehouse setup with the
 * admin, and fulfillment and backorder decisions with finance/operations.
 */
warehousesRouter.use(requireAuth, requireKind('staff'));

const canWrite = requireRole('admin', 'finance');
const idParam = z.string().uuid('Invalid warehouse id');

warehousesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listWarehouses() });
  }),
);

warehousesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getWarehouse(id) });
  }),
);

warehousesRouter.post(
  '/',
  canWrite,
  asyncHandler(async (req, res) => {
    const input = createWarehouseSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await createWarehouse(actor, input) });
  }),
);

warehousesRouter.put(
  '/:id',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateWarehouseSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateWarehouse(actor, id, input) });
  }),
);

/**
 * Returns `affectedQuotationIds` — the open backorders this stock change could now
 * fill. Without it the consolidation prompt cannot fire.
 */
warehousesRouter.put(
  '/:id/stock',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateStockSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateStock(actor, id, input) });
  }),
);

warehousesRouter.post(
  '/:id/restock',
  canWrite,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await restock(actor, id) });
  }),
);
