import { z } from 'zod';
import { cleanText, digitsOnly, normalizeEmail } from '../../lib/sanitize.js';

/**
 * Every schema is `.strict()`. Unknown keys are rejected rather than stripped, which
 * is what enforces the rule that `role`, `team`, `tier` and `currency` can never be
 * set by the client: they are server-assigned. Silently dropping them would work
 * today and quietly become privilege escalation the day someone spreads the body
 * into an insert.
 */

const email = z
  .string()
  .trim()
  .min(3)
  .max(255)
  .transform(normalizeEmail)
  .pipe(z.string().email('Must be a valid email address'));

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  // Bounded because the hash function's cost scales with input length.
  .max(200, 'Password must be at most 200 characters');

const otp = z
  .string()
  .transform(digitsOnly)
  .pipe(z.string().regex(/^\d{6}$/, 'Code must be 6 digits'));

const personName = z
  .string()
  .transform(cleanText)
  .pipe(z.string().min(1, 'Name is required').max(120));

const companyName = z
  .string()
  .transform(cleanText)
  .pipe(z.string().min(1, 'Name is required').max(200));

export const signupSchema = z
  .discriminatedUnion('type', [
    z.object({ type: z.literal('internal'), name: personName, email, password }).strict(),
    z.object({ type: z.literal('customer'), name: companyName, email, password }).strict(),
  ])
  .describe('signup');

export const loginSchema = z
  .object({
    email,
    password,
    type: z.enum(['internal', 'customer']),
  })
  .strict();

export const verifyOtpSchema = z
  .object({
    email,
    otp,
    type: z.enum(['internal', 'customer']),
  })
  .strict();

export const resendOtpSchema = z
  .object({
    email,
    type: z.enum(['internal', 'customer']),
    purpose: z.enum(['signup', 'password_reset']),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email,
    type: z.enum(['internal', 'customer']),
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    email,
    otp,
    newPassword: password,
    type: z.enum(['internal', 'customer']),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: password,
  })
  .strict();

export const refreshSchema = z.object({ refreshToken: z.string().min(1).max(200) }).strict();

export const logoutSchema = refreshSchema;

export const switchRoleSchema = z
  .object({ role: z.enum(['sales_rep', 'sales_manager', 'finance', 'admin']) })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
