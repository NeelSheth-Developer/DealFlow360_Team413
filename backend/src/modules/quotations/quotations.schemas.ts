import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';
import { TIERS } from '../catalog/catalog.schemas.js';

export const STAGES = [
  'draft',
  'sent',
  'under_negotiation',
  'pending_approval',
  'approved',
  'fulfillment',
  'billed',
  'confirmed',
  'lost',
] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-MM-dd')
  .nullable();

/**
 * The customer must already exist. Quotations are raised against a registered
 * organisation, so there is no create-customer-inline path — that would let a rep
 * fabricate a counterparty mid-quote and leave the customer book unusable.
 */
export const createQuotationSchema = z
  .object({
    customerId: z.string().uuid(),
    /** Absent means the caller owns it. A rep may only name themselves. */
    ownerId: z.string().uuid().optional(),
  })
  .strict();

export const updateQuotationSchema = z
  .object({
    orderDiscountPct: z.number().min(0).max(100).optional(),
    promisedDeliveryDate: isoDate.optional(),
    validUntil: isoDate.optional(),
    internalNotes: z.string().transform(cleanText).pipe(z.string().max(4000)).nullable().optional(),
    customerTerms: z.string().transform(cleanText).pipe(z.string().max(4000)).nullable().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

/**
 * No `unitPrice`. The server resolves it from the customer's tier price list, and the
 * cost, tax and category from the product — a client-supplied price is never trusted.
 */
export const addLineSchema = z
  .object({
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(1_000_000).default(1),
    planId: z.string().uuid().nullable().default(null),
  })
  .strict();

/**
 * `unitPrice` IS accepted here, unlike on create.
 *
 * A negotiated price is a real commercial act — a rep agrees a number on a call and
 * has to record it. It is bounded by the schema and every change is audited with the
 * before and after, which is the control that matters. What a client still cannot do
 * is invent the cost or the category, so margin and the binding ceiling stay honest.
 */
export const updateLineSchema = z
  .object({
    qty: z.number().int().min(1).max(1_000_000).optional(),
    discountPct: z.number().min(0).max(100).optional(),
    unitPrice: z.number().min(0).max(99_999_999_999).optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Provide at least one field to update',
  });

export const reassignOwnerSchema = z.object({ ownerId: z.string().uuid() }).strict();

export const moveStageSchema = z.object({ toStage: z.enum(STAGES) }).strict();

export const markLostSchema = z
  .object({
    reason: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(5, 'Give a reason of at least 5 characters').max(1000)),
  })
  .strict();

export const commentSchema = z
  .object({
    message: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(1, 'Message cannot be empty').max(2000)),
  })
  .strict();

export const listQuotationsQuerySchema = z
  .object({
    stage: z.enum(STAGES).optional(),
    ownerId: z.string().uuid().optional(),
    customerId: z.string().uuid().optional(),
    tier: z.enum(TIERS).optional(),
    search: z.string().max(255).optional(),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;
export type AddLineInput = z.infer<typeof addLineSchema>;
export type UpdateLineInput = z.infer<typeof updateLineSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
