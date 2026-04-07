import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Auth
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('30m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),

  // CORS – comma-separated list, e.g. "http://localhost:8080,http://localhost:5173"
  FRONTEND_URLS: z
    .string()
    .default('http://localhost:5173,http://localhost:8080')
    .transform((v) => v.split(',').map((u) => u.trim())),

  // Storage (S3 / Railway Buckets)
  S3_ENDPOINT_URL: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().default('mutiny-uploads'),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'azure']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2023-05-15'),

  // Payments — Cashfree
  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_DEFAULT_PHONE: z.string().optional(), // Optional override for Cashfree order customer_phone

  // Backend public URL (used for Cashfree notify_url webhook)
  BACKEND_URL: z.string().optional(),

  // Email (Resend API preferred; SMTP as fallback)
  SMTP_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Proxy trust (Express "trust proxy" value): true/false or hop count (e.g. "1", "2")
  TRUST_PROXY: z.string().optional(),

  // Auth cookie behavior for web clients
  AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  AUTH_COOKIE_DOMAIN: z.string().optional(),

  // Firebase / FCM (all optional; push notifications disabled if missing)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v22.0'),
  WHATSAPP_OTP_TEMPLATE_NAME: z.string().default('otp_verification'),

  // App Store / Play Store review account (fixed OTP bypass)
  REVIEW_ACCOUNT_PHONE: z.string().default('+911234567890'),
  REVIEW_ACCOUNT_OTP: z.string().default('000000'),

  // Meta / Facebook (Instagram Connect)
  META_APP_ID: z.string().min(1, 'META_APP_ID is required'),
  META_APP_SECRET: z.string().min(1, 'META_APP_SECRET is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .length(64, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('\n❌ Environment Validation Failed:');
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
