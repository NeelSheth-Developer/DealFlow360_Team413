import 'dotenv/config';
import { z } from 'zod';

const csv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * An optional string where a blank value means "not set".
 *
 * `FOO=` in a .env file arrives as `''`, not undefined — so `env.FOO ?? fallback`
 * silently keeps the empty string and the fallback never runs. Every optional here
 * goes through this instead, so a commented-out or emptied variable behaves the way
 * the file looks like it behaves.
 */
const optionalText = () =>
  z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    });

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_URL: z.url().default('http://localhost:5000'),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default('*').transform(csv),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Neon Postgres
  DATABASE_URL: z.string().startsWith('postgres'),

  // Upstash Redis (REST)
  UPSTASH_REDIS_REST_URL: z.url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
  REDIS_PREFIX: z.string().default('team413'),
  REDIS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

  // Resend — the primary sender
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  /**
   * Brevo — a second HTTP sender.
   *
   * Picked over an SMTP relay deliberately: most hosting platforms block outbound
   * SMTP to stop spam, so an SMTP fallback works locally and then hangs in
   * production. Brevo posts over HTTPS on 443, like Resend, so it is unaffected.
   *
   * The sender is EMAIL_FROM, so both transports present the same From and a
   * fallback is invisible to the recipient. That address must be verified in Brevo,
   * otherwise it refuses the send.
   */
  BREVO_API_KEY: optionalText(),

  /**
   * Force a transport, or let `auto` walk the chain.
   *
   * `auto` tries resend, then brevo, skipping either if it is not configured. Both
   * post over HTTPS, so neither is affected by the outbound-SMTP blocking that most
   * hosting platforms apply.
   */
  EMAIL_TRANSPORT: z.enum(['auto', 'resend', 'brevo']).default('auto'),

  /**
   * Cloudinary — where generated quotation and invoice PDFs are stored.
   *
   * Optional as a group: with none of the three set, the PDF endpoints stream the file
   * back directly instead of returning a hosted URL. That keeps the whole API usable
   * on a machine with no Cloudinary account, and `cloudinaryConfigured` below is the
   * single place that decides which path is taken.
   */
  CLOUDINARY_CLOUD_NAME: optionalText(),
  CLOUDINARY_API_KEY: optionalText(),
  CLOUDINARY_API_SECRET: optionalText(),
  CLOUDINARY_FOLDER: z.string().default('dealflow360'),

  // Auth / security
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  // Access tokens cannot be revoked, so keep this short (15 min).
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Refresh tokens are looked up and revocable, so they can live longer (7 days).
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  // One-time passwords
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  // Tighter bucket for credential endpoints, which are what gets brute-forced.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  // Returns the OTP in the API response so the flow can be exercised without a
  // working email provider. Double-gated: this flag AND a non-production NODE_ENV.
  EXPOSE_DEV_OTP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  process.stderr.write(
    `\nInvalid environment variables:\n${issues}\n\nCheck .env against .env.example.\n`,
  );
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

export const brevoConfigured = Boolean(env.BREVO_API_KEY);

export type EmailTransport = 'resend' | 'brevo';

/**
 * The transports to try, in order, filtered to those actually configured.
 *
 * Forcing a transport that has no credentials would fail every send, so a forced
 * choice still has to be configured to be honoured — otherwise the chain is used and
 * a warning explains why.
 */
export const emailChain: EmailTransport[] = (() => {
  const available: Record<EmailTransport, boolean> = {
    resend: true, // RESEND_API_KEY is required, so this is always present
    brevo: brevoConfigured,
  };

  if (env.EMAIL_TRANSPORT !== 'auto') {
    if (available[env.EMAIL_TRANSPORT]) return [env.EMAIL_TRANSPORT];
    process.stderr.write(
      `\nWARNING: EMAIL_TRANSPORT=${env.EMAIL_TRANSPORT} but it is not configured.\n` +
        '         Falling back to whichever transports are.\n\n',
    );
  }

  return (['resend', 'brevo'] as EmailTransport[]).filter((t) => available[t]);
})();

/** All three credentials present. Checked once, so no caller has to re-derive it. */
export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
export const isDevelopment = env.NODE_ENV === 'development';
