import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { approveSchema, rejectSchema } from '../approvals/approvals.schemas.js';
import {
  approveStep,
  rejectStep,
  returnStep,
  submitForApproval,
} from '../approvals/approvals.service.js';
import {
  addLineSchema,
  commentSchema,
  createQuotationSchema,
  listQuotationsQuerySchema,
  markLostSchema,
  moveStageSchema,
  reassignOwnerSchema,
  updateLineSchema,
  updateQuotationSchema,
} from './quotations.schemas.js';
import {
  addLine,
  addRepComment,
  applyCounter,
  createQuotation,
  dismissSuggestion,
  getQuotation,
  listQuotations,
  markLost,
  moveStage,
  reassignOwner,
  removeLine,
  shareQuotation,
  updateLine,
  updateQuotation,
} from './quotations.service.js';

export const quotationsRouter = Router();

/**
 * Quotations and the approval actions that operate on one.
 *
 * The approval endpoints live on this router rather than their own because they are
 * addressed by quotation (`/quotations/:id/approve`); `/approvals/queue` is the only
 * approval route that is not, and it has its own router.
 *
 * Staff only. The customer's view of a quotation comes from `/customer/quotations`,
 * which is a different module with a different, allow-listed shape.
 */
quotationsRouter.use(requireAuth, requireKind('staff'));

const idParam = z.string().uuid('Invalid quotation id');
const lineParam = z.string().uuid('Invalid line id');
const dismissSchema = z.object({ productId: z.string().uuid() }).strict();

// --- Reading ---------------------------------------------------------------

quotationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = listQuotationsQuerySchema.parse(req.query);
    const actor = await resolveActor(req);
    const { data, meta } = await listQuotations(actor, query);
    res.json({ success: true, data, meta });
  }),
);

quotationsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await getQuotation(actor, id) });
  }),
);

// --- Creating and editing --------------------------------------------------

quotationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createQuotationSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await createQuotation(actor, input) });
  }),
);

quotationsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateQuotationSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateQuotation(actor, id, input) });
  }),
);

/** Returns the full quotation so the UI re-renders totals in one round trip. */
quotationsRouter.post(
  '/:id/lines',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = addLineSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await addLine(actor, id, input) });
  }),
);

quotationsRouter.patch(
  '/:id/lines/:lineId',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const lineId = lineParam.parse(req.params.lineId);
    const input = updateLineSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await updateLine(actor, id, lineId, input) });
  }),
);

quotationsRouter.delete(
  '/:id/lines/:lineId',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const lineId = lineParam.parse(req.params.lineId);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await removeLine(actor, id, lineId) });
  }),
);

/** A rep's reply on a line. Clears `awaitingSeller` and emails the customer. */
quotationsRouter.post(
  '/:id/lines/:lineId/comments',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const lineId = lineParam.parse(req.params.lineId);
    const { message } = commentSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({ success: true, data: await addRepComment(actor, id, lineId, message) });
  }),
);

// --- Workflow --------------------------------------------------------------

quotationsRouter.patch(
  '/:id/owner',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { ownerId } = reassignOwnerSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await reassignOwner(actor, id, ownerId) });
  }),
);

quotationsRouter.post(
  '/:id/share',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await shareQuotation(actor, id) });
  }),
);

quotationsRouter.post(
  '/:id/stage',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { toStage } = moveStageSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await moveStage(actor, id, toStage) });
  }),
);

quotationsRouter.post(
  '/:id/lost',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { reason } = markLostSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await markLost(actor, id, reason) });
  }),
);

/** Applies the customer's counter to every line, then re-scores and returns both. */
quotationsRouter.post(
  '/:id/apply-counter',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await applyCounter(actor, id) });
  }),
);

quotationsRouter.post(
  '/:id/dismiss-suggestion',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { productId } = dismissSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await dismissSuggestion(actor, id, productId) });
  }),
);

// --- Approvals -------------------------------------------------------------

/**
 * The server decides the route. The rep never chooses it and never gets to skip it —
 * the body is empty precisely so there is nothing to influence.
 */
quotationsRouter.post(
  '/:id/submit-approval',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await submitForApproval(actor, id) });
  }),
);

quotationsRouter.post(
  '/:id/approve',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { comment } = approveSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await approveStep(actor, id, comment) });
  }),
);

quotationsRouter.post(
  '/:id/reject',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { reason } = rejectSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await rejectStep(actor, id, reason) });
  }),
);

quotationsRouter.post(
  '/:id/return',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const { reason } = rejectSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await returnStep(actor, id, reason) });
  }),
);
