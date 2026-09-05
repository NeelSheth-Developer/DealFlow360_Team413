import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireKind } from '../../middleware/auth.js';
import { resolveActor } from '../../lib/actor.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { invoicePdf, quotationPdf, type DocumentResult } from './documents.service.js';
import { loadQuotation } from '../quotations/quotations.repo.js';
import { getInvoice } from '../invoices/invoices.service.js';

export const quotationPdfRouter = Router({ mergeParams: true });
export const invoicePdfRouter = Router({ mergeParams: true });
export const portalPdfRouter = Router({ mergeParams: true });

const idParam = z.string().uuid('Invalid id');

/**
 * Sends either the hosted URL or the file itself, depending on whether the upload
 * succeeded. The response shape tells the client which it got, so the frontend can
 * link to `data.url` when present and fall back to triggering a download otherwise.
 */
function send(res: Response, result: DocumentResult) {
  if (result.hosted) {
    res.json({
      success: true,
      data: {
        reference: result.reference,
        url: result.url,
        publicId: result.publicId,
        bytes: result.bytes,
        hosted: true,
      },
    });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
  res.setHeader('X-Document-Reference', result.reference);
  res.send(result.buffer);
}

/** Staff: `GET /quotations/:id/pdf`. */
quotationPdfRouter.get(
  '/',
  requireAuth,
  requireKind('staff'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    send(res, await quotationPdf(actor, id));
  }),
);

/** Staff: `GET /invoices/:id/pdf`. */
invoicePdfRouter.get(
  '/',
  requireAuth,
  requireKind('staff'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    const actor = await resolveActor(req);
    send(res, await invoicePdf(actor, id));
  }),
);

/**
 * Customer: `GET /customer/quotations/:id/pdf` and `/customer/invoices/:id/pdf`.
 *
 * Ownership is re-checked here against the session's own customer id before anything
 * is rendered — a customer downloading someone else's quotation would be the worst
 * kind of leak, and the PDF path must not become the one route that skips the scoping
 * every other portal endpoint applies. A mismatch is a 404, matching the rest of the
 * namespace: a 403 would confirm the document exists.
 */
portalPdfRouter.get(
  '/quotations/:id/pdf',
  requireAuth,
  requireKind('customer'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    if (!req.auth) throw ApiError.unauthorized();

    const loaded = await loadQuotation(id);
    if (loaded.customerId !== req.auth.id || loaded.stage === 'draft') {
      throw ApiError.notFound('Quotation not found');
    }

    const actor = await resolveActor(req);
    send(res, await quotationPdf(actor, id));
  }),
);

portalPdfRouter.get(
  '/invoices/:id/pdf',
  requireAuth,
  requireKind('customer'),
  asyncHandler(async (req, res) => {
    const id = idParam.parse(req.params.id);
    if (!req.auth) throw ApiError.unauthorized();

    const invoice = await getInvoice(id);
    if (invoice.customerId !== req.auth.id) throw ApiError.notFound('Invoice not found');
    // A draft invoice has not been issued to the customer, so it does not exist to them.
    if (invoice.status === 'draft') throw ApiError.notFound('Invoice not found');

    const actor = await resolveActor(req);
    send(res, await invoicePdf(actor, id));
  }),
);
