import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/**
 * All API configuration, validated at boot. Secrets come from the environment only
 * (git-ignored .env locally, the host's secret store in production).
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_VERSION: z.string().default('0.0.0-dev'),
  /** Monitoring alerts (L13): an email address and/or a webhook (ntfy, Slack, …). */
  ALERT_EMAIL: z.string().optional(),
  ALERT_WEBHOOK_URL: z.url().optional(),
  /** Bearer token for GET /api/v1/internal/metrics (Prometheus). Unset = endpoint disabled. */
  METRICS_TOKEN: z.string().min(24).optional(),
  /** Alert when the nightly backup (infra/production) hasn't reported for this long. Unset = off. */
  BACKUP_MAX_AGE_HOURS: z.coerce.number().positive().optional(),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  /** Redis used only for runner jobs; runner hosts get a restricted user on this instance. */
  RUNNER_REDIS_URL: z.string().min(1).optional(),
  /** 32+ byte secret for HMAC of sessions, CSRF, flags. */
  APP_SECRET: z.string().min(32),
  /** base64 32-byte key for AES-256-GCM encryption of TOTP secrets. */
  ENCRYPTION_KEY: z.string().min(40),
  COOKIE_SECURE: bool.default(true),
  TRUST_PROXY: bool.default(false),
  /**
   * Proxies in front of the API that append to X-Forwarded-For. Production: Caddy and the Next.js
   * /api/v1 rewrite, so 2. Too high lets clients spoof their IP; too low rate-limits by proxy IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  RATE_LIMITS_ENABLED: bool.default(true),
  HIBP_CHECK_ENABLED: bool.default(false),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  EMAIL_FROM: z.string().default('Forge <no-reply@forge.local>'),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RUNNER_JOB_SIGNING_KEYS: z.string().optional(),
  RUNNER_CALLBACK_KEYS: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('eu-central-1'),
  S3_BUCKET: z.string().default('forge-private'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),
  /** Regional (reduced) prices, spec 10. */
  STRIPE_PRICE_PRO_MONTHLY_REDUCED: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY_REDUCED: z.string().optional(),
});

const DEV_MARKER = /change-me|dev-.*-secret/i;

/**
 * Production refuses to boot with development defaults or without the settings that keep it safe
 * and observable (spec L13). Each issue names the variable so the log says exactly what to fix.
 */
export const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;
  const fail = (key: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [key], message });
  for (const key of [
    'APP_SECRET',
    'ENCRYPTION_KEY',
    'RUNNER_JOB_SIGNING_KEYS',
    'RUNNER_CALLBACK_KEYS',
  ] as const) {
    if (env[key] && DEV_MARKER.test(env[key])) fail(key, 'is still the development value');
  }
  for (const key of [
    'RUNNER_REDIS_URL',
    'RUNNER_JOB_SIGNING_KEYS',
    'RUNNER_CALLBACK_KEYS',
  ] as const) {
    if (!env[key]) fail(key, 'is required in production');
  }
  if (!env.COOKIE_SECURE) fail('COOKIE_SECURE', 'must be true in production');
  for (const key of ['WEB_ORIGIN', 'API_PUBLIC_URL'] as const) {
    if (!env[key].startsWith('https://')) fail(key, 'must be an https:// URL in production');
  }
  if (/localhost|127\.0\.0\.1|mailpit/.test(env.SMTP_URL)) {
    fail('SMTP_URL', 'points at a development mail server');
  }
  if (!env.ALERT_EMAIL && !env.ALERT_WEBHOOK_URL) {
    fail('ALERT_EMAIL', 'or ALERT_WEBHOOK_URL is required in production so alerts reach someone');
  }
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
