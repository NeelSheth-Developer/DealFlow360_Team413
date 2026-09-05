import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind, requireRole } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  applySubscriptionChangeSchema,
  creditNoteSchema,
  prorationPreviewSchema,
} from './billing.schemas.js';
import {
  applySubscriptionChange,
  buildBilling,
  cancelSubscription,
  getBilling,
  issueCreditNote,
  listCreditNotes,
  previewCancellation,
  previewProration,
} from './billing.service.js';

export const billingRouter = Router({ mergeParams: true });

/**
 * Billing, mounted under `/quotations/:id`. `mergeParams` carries `:id` through.
 *
 * The preview endpoints deliberately do not mutate. A proration or a cancellation
 * figure is shown to the customer before anything is committed, and a preview that
 * quietly applied the change would make that promise a lie.
 */
billingRouter.use(requireAuth, requireKind('staff'));

const canSettle = requireRole('finance', 'admin');
const idParam = z.string().uuid('Invalid quotation id');
const lineParam = z.string().uuid('Invalid line id');

function quotationId(req: Request): string {
  return idParam.parse(req.params.id);
}

function lineId(req: Request): string {
  return lineParam.parse(req.params.lineId);
}

billingRouter.get(
  '/billing',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getBilling(quotationId(req)) });
  }),
);

/** Generates the invoice for one-time lines and the schedules for recurring ones. */
billingRouter.post(
  '/billing/build',
  asyncHandler(async (req, res) => {
    const actor = await resolveActor(req);
    res.json({ success: true, data: await buildBilling(actor, quotationId(req)) });
  }),
);

billingRouter.post(
  '/lines/:lineId/proration-preview',
  asyncHandler(async (req, res) => {
    const { newQty } = prorationPreviewSchema.parse(req.body);
    res.json({
      success: true,
      data: await previewProration(quotationId(req), lineId(req), newQty),
    });
  }),
);

billingRouter.patch(
  '/lines/:lineId/subscription',
  asyncHandler(async (req, res) => {
    const { qty } = applySubscriptionChangeSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({
      success: true,
      data: await applySubscriptionChange(actor, quotationId(req), lineId(req), qty),
    });
  }),
);

billingRouter.get(
  '/lines/:lineId/cancellation-preview',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await previewCancellation(quotationId(req), lineId(req)) });
  }),
);

billingRouter.delete(
  '/lines/:lineId/subscription',
  asyncHandler(async (req, res) => {
    const actor = await resolveActor(req);
    res.json({
      success: true,
      data: await cancelSubscription(actor, quotationId(req), lineId(req)),
    });
  }),
);

billingRouter.get(
  '/credit-notes',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listCreditNotes(quotationId(req)) });
  }),
);

/** Issuing money back is finance and admin only, like every other money action. */
billingRouter.post(
  '/credit-notes',
  canSettle,
  asyncHandler(async (req, res) => {
    const input = creditNoteSchema.parse(req.body);
    const actor = await resolveActor(req);
    res
      .status(201)
      .json({ success: true, data: await issueCreditNote(actor, quotationId(req), input) });
  }),
);
