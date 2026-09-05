import 'dotenv/config';
import { z } from 'zod';

const csv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

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

  // Resend
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),

  /**
   * Cloudinary — where generated quotation and invoice PDFs are stored.
   *
   * Optional as a group: with none of the three set, the PDF endpoints stream the file
   * back directly instead of returning a hosted URL. That keeps the whole API usable
   * on a machine with no Cloudinary account, and `cloudinaryConfigured` below is the
   * single place that decides which path is taken.
   */
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
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

/** All three credentials present. Checked once, so no caller has to re-derive it. */
export const cloudinaryConfigured = Boolean(
  env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
);
export const isDevelopment = env.NODE_ENV === 'development';
