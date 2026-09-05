import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { counterRequestSchema, portalCommentSchema } from './portal.schemas.js';
import {
  confirmQuotation,
  getForCustomer,
  listForCustomer,
  postComment,
  requestTerms,
} from './portal.service.js';

export const portalRouter = Router();

/**
 * The customer namespace.
 *
 * `requireKind('customer')` is the wall. A staff token reaching any route here gets
 * 403, and a customer token reaching `/quotations`, `/config`, `/warehouses`,
 * `/invoices`, `/reports` or `/audit-log` gets 403 at those routers in the same way.
 * Two identity spaces, enforced server-side on every request.
 *
 * Every handler passes the session's own customer id into the service, which scopes
 * the query by it. A customer id is never taken from the path or the body.
 */
portalRouter.use(requireAuth, requireKind('customer'));

const idParam = z.string().uuid('Invalid quotation id');
const lineParam = z.string().uuid('Invalid line id');

/** The signed-in customer's id. Never read from the request body. */
function sessionCustomerId(req: Parameters<typeof resolveActor>[0]): string {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth.id;
}

portalRouter.get(
  '/quotations',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listForCustomer(sessionCustomerId(req)) });
  }),
);

/** 404, not 403, when the quotation belongs to someone else. See the service. */
portalRouter.get(
  '/quotations/:id',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json({ success: true, data: await getForCustomer(sessionCustomerId(req), id) });
  }),
);

portalRouter.post(
  '/quotations/:id/lines/:lineId/comments',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const lineId = lineParam.parse(req.params.lineId);
    const { message } = portalCommentSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.status(201).json({
      success: true,
      data: await postComment(actor, sessionCustomerId(req), id, lineId, message),
    });
  }),
);

portalRouter.post(
  '/quotations/:id/request',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = counterRequestSchema.parse(req.body);
    const actor = await resolveActor(req);
    res.json({
      success: true,
      data: await requestTerms(actor, sessionCustomerId(req), id, input),
    });
  }),
);

/**
 * Confirms the quotation.
 *
 * The server re-scores the final terms and, when they breach a ceiling, puts the
 * quotation back into the approval chain automatically — no rep action required. The
 * score is never returned in the response; it is internal governance data.
 */
portalRouter.post(
  '/quotations/:id/confirm',
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    res.json({ success: true, data: await confirmQuotation(actor, sessionCustomerId(req), id) });
  }),
);
