import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { listInvoicesQuerySchema, recordPaymentSchema } from '../billing/billing.schemas.js';
import { getInvoice, listInvoices, recordPayment, sendInvoice } from './invoices.service.js';

export const invoicesRouter = Router();

/**
 * Invoices and payments.
 *
 * Reads are open to staff — a rep needs to answer "has that been paid?". Issuing an
 * invoice and recording a payment are finance and admin ONLY. That is separation of
 * duties: the person who sold the deal must not be the one who confirms the money
 * arrived, and no amount of convenience justifies collapsing the two.
 */
invoicesRouter.use(requireAuth, requireKind('staff'));

const canSettle = requireRole('finance', 'admin');
const idParam = z.string().uuid('Invalid invoice id');

/** At most 200 chars — a key longer than that is not an idempotency key. */
const idempotencyKeySchema = z.string().min(1).max(120).optional();

invoicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listInvoicesQuerySchema.parse(req.query);
    const { data, meta } = await listInvoices(query);
    res.json({ success: true, data, meta });
  }),
);

invoicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getInvoice(id) });
  }),
);

invoicesRouter.post(
  '/:id/send',
  canSettle,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await sendInvoice(actor, id) });
  }),
);

/**
 * Recording a payment. Send an `Idempotency-Key` header so a double-click or a network
 * retry cannot write the same payment twice — a replayed key returns the original
 * payment unchanged rather than creating a second one.
 */
invoicesRouter.post(
  '/:id/payments',
  canSettle,
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = recordPaymentSchema.parse(req.body);
    const key = idempotencyKeySchema.parse(req.header('idempotency-key') ?? undefined) ?? null;
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await recordPayment(actor, id, input, key) });
  }),
);
