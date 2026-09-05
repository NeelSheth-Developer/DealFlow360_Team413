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
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

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

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_FOLDER: z.string().default('team413'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(10),

  // Auth / security
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  console.error(`\nInvalid environment variables:\n${issues}\n\nCheck .env against .env.example.\n`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
