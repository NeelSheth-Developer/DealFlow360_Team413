import { z } from 'zod';
import { cleanText } from '../../lib/sanitize.js';

const percentage = z.number().min(0, 'Cannot be negative').max(100, 'Cannot exceed 100');

/**
 * All three tiers at once, not one at a time. Ceilings are read together by the risk
 * engine, so setting them together is what lets an admin keep them ordered — a UI that
 * saves bronze alone can leave bronze above gold between two requests.
 */
export const tierCeilingsSchema = z
  .object({
    bronze: percentage,
    silver: percentage,
    gold: percentage,
  })
  .strict();

export const patchTierCeilingsSchema = z
  .object({
    bronze: percentage.optional(),
    silver: percentage.optional(),
    gold: percentage.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one tier must be provided' });

export const categoryCeilingsSchema = z
  .object({
    hardware: percentage,
    service: percentage,
    subscription: percentage,
    accessories: percentage,
  })
  .strict();

export const patchCategoryCeilingsSchema = z
  .object({
    hardware: percentage.optional(),
    service: percentage.optional(),
    subscription: percentage.optional(),
    accessories: percentage.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one category must be provided' });

const APPROVER_ROLES = ['sales_manager', 'finance', 'admin'] as const;

/**
 * One band in the approval chain.
 *
 * `maxScore` is nullable and means "unbounded" — the top rule has to catch everything
 * above it, or a very bad quotation would match no rule at all.
 */
export const approvalRuleSchema = z
  .object({
    minScore: z.number().min(-1).max(1000),
    maxScore: z.number().min(-1).max(1000).nullable().default(null),
    // A rep cannot approve; `sales_rep` is deliberately not assignable here.
    approvers: z.array(z.enum(APPROVER_ROLES)).max(4),
    singleLineTrip: z.number().min(0).max(100).nullable().default(null),
    note: z.string().transform(cleanText).pipe(z.string().max(300)).nullable().default(null),
  })
  .strict()
  .refine((rule) => rule.maxScore === null || rule.maxScore > rule.minScore, {
    message: 'maxScore must be greater than minScore',
    path: ['maxScore'],
  });

export const reorderChainSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
  })
  .strict();

export const dashboardConfigSchema = z
  .object({
    stallThresholdDays: z.number().int().min(1).max(365),
    anomalySensitivity: z.number().min(1).max(10),
    approvalSlaHours: z.number().int().min(1).max(720),
  })
  .strict();

export type TierCeilingsInput = z.infer<typeof tierCeilingsSchema>;
export type PatchTierCeilingsInput = z.infer<typeof patchTierCeilingsSchema>;
export type CategoryCeilingsInput = z.infer<typeof categoryCeilingsSchema>;
export type PatchCategoryCeilingsInput = z.infer<typeof patchCategoryCeilingsSchema>;
export type ApprovalRuleInput = z.infer<typeof approvalRuleSchema>;
export type DashboardConfigInput = z.infer<typeof dashboardConfigSchema>;
