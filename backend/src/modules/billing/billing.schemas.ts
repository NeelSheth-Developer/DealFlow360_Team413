import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

export const prorationPreviewSchema = z
  .object({ newQty: z.number().int().min(0).max(1_000_000) })
  .strict();

export const applySubscriptionChangeSchema = z
  .object({ qty: z.number().int().min(1).max(1_000_000) })
  .strict();

export const creditNoteSchema = z
  .object({
    lineId: z.string().uuid().nullable().default(null),
    amount: z.number().min(0.01).max(99_999_999_999),
    type: z.enum(['refund', 'credit_note']),
    reason: z
      .string()
      .transform(cleanText)
      .pipe(z.string().min(5, 'Give a reason of at least 5 characters').max(1000)),
  })
  .strict();

export const recordPaymentSchema = z
  .object({
    amount: z.number().min(0.01).max(99_999_999_999),
    method: z.enum(['card', 'bank_transfer', 'cheque', 'upi', 'other']),
    reference: z.string().transform(cleanText).pipe(z.string().max(120)).nullable().default(null),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use yyyy-MM-dd')
      .optional(),
    notes: z.string().transform(cleanText).pipe(z.string().max(1000)).nullable().default(null),
  })
  .strict();

export const listInvoicesQuerySchema = z
  .object({
    status: z.enum(['draft', 'sent', 'partially_paid', 'paid']).optional(),
    customerId: z.string().uuid().optional(),
    quotationId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type CreditNoteInput = z.infer<typeof creditNoteSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
