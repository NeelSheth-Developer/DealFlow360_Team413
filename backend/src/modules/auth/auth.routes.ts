import { Router } from 'express';
import { env } from '../../config/env.js';
import { clampHeader } from '../../lib/sanitize.js';
import { requireAuth } from '../../middleware/auth.js';
import { authRateLimit } from '../../middleware/rate-limit.js';
import { ApiError } from '../../utils/api-error.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signupSchema,
  verifyOtpSchema,
} from './auth.schemas.js';
import {
  changePassword,
  devOtp,
  forgotPassword,
  login,
  logout,
  me,
  publicAccount,
  refresh,
  resendOtp,
  resetPassword,
  signup,
  verifyOtpAndSignIn,
} from './auth.service.js';
import type { Request } from 'express';

export const authRouter = Router();

/** Recorded against each refresh token so a session list can show where it came from. */
function meta(req: Request) {
  return {
    userAgent: clampHeader(req.header('user-agent'), 255),
    ip: clampHeader(req.ip, 45),
  };
}

/**
 * Credential endpoints get their own, much tighter rate limit than the global one —
 * these are what gets brute-forced.
 */
const credentialLimit = authRateLimit();

authRouter.post(
  '/signup',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body);
    const result = await signup(
      body.type,
      { name: body.name, email: body.email, password: body.password },
      meta(req),
    );

    if (result.status === 'otp_sent') {
      res.status(201).json({
        success: true,
        message: 'OTP sent successfully',
        ...devOtp(result.code),
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { ...publicAccount(body.type, result.account), ...result.session },
    });
  }),
);

authRouter.post(
  '/verify-otp',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = verifyOtpSchema.parse(req.body);
    const { account, session } = await verifyOtpAndSignIn(
      body.type,
      body.email,
      body.otp,
      meta(req),
    );

    res.json({
      success: true,
      data: { ...publicAccount(body.type, account), ...session },
    });
  }),
);

authRouter.post(
  '/resend-otp',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = resendOtpSchema.parse(req.body);
    const code = await resendOtp(body.type, body.email, body.purpose);

    // Always the same answer, so this cannot be used to test which emails exist.
    res.json({
      success: true,
      data: {
        message: 'If that address needs a code, one has been sent.',
        retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
        ...(code ? devOtp(code) : {}),
      },
    });
  }),
);

authRouter.post(
  '/login',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const { account, session } = await login(
      body.type,
      body.email,
      body.password,
      meta(req),
    );

    res.json({
      success: true,
      data: { ...publicAccount(body.type, account), ...session },
    });
  }),
);

authRouter.post(
  '/forgot-password',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = forgotPasswordSchema.parse(req.body);
    const code = await forgotPassword(body.type, body.email);

    res.json({
      success: true,
      data: {
        message: 'If that address matches an account, a reset code has been sent.',
        retryAfterSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
        ...(code ? devOtp(code) : {}),
      },
    });
  }),
);

authRouter.post(
  '/reset-password',
  credentialLimit,
  asyncHandler(async (req, res) => {
    const body = resetPasswordSchema.parse(req.body);
    const { sessionsRevoked } = await resetPassword(
      body.type,
      body.email,
      body.otp,
      body.newPassword,
    );

    res.json({
      success: true,
      data: {
        message: 'Password updated. Please sign in with your new password.',
        sessionsRevoked,
      },
    });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = changePasswordSchema.parse(req.body);
    if (!req.auth) throw ApiError.unauthorized();

    // Optional: when the client sends its refresh token, that one session survives.
    const keep = refreshSchema.partial().safeParse(req.body);
    const { sessionsRevoked } = await changePassword(
      req.auth.kind,
      req.auth.id,
      body.currentPassword,
      body.newPassword,
      keep.success ? (keep.data.refreshToken ?? null) : null,
    );

    res.json({
      success: true,
      data: { message: 'Password updated.', sessionsRevoked, currentSessionKept: true },
    });
  }),
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = refreshSchema.parse(req.body);
    const session = await refresh(body.refreshToken, meta(req));
    res.json({ success: true, data: session });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = logoutSchema.parse(req.body);
    await logout(body.refreshToken);
    res.status(204).send();
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth) throw ApiError.unauthorized();
    const profile = await me(req.auth.kind, req.auth.id);
    res.json({ success: true, data: profile });
  }),
);
