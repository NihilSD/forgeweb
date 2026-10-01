import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://forge:x@postgres:5432/forge',
  APP_SECRET: 'a'.repeat(64),
  ENCRYPTION_KEY: 'b'.repeat(44),
  WEB_ORIGIN: 'https://forge.example',
  API_PUBLIC_URL: 'https://forge.example',
  SMTP_URL: 'smtps://user:pass@smtp.provider.example:465',
  EMAIL_FROM: 'Forge <no-reply@forge.example>',
  RUNNER_REDIS_URL: 'redis://api:pw@runner-redis:6379/0',
  RUNNER_JOB_SIGNING_KEYS: `k1:${'c'.repeat(40)}`,
  RUNNER_CALLBACK_KEYS: `k1:${'d'.repeat(40)}`,
  ALERT_EMAIL: 'ops@forge.example',
};

describe('production configuration guard', () => {
  it('accepts a complete production configuration', () => {
    expect(loadEnv(PROD).NODE_ENV).toBe('production');
  });

  it.each([
    ['APP_SECRET', 'change-me-change-me-change-me-change-me'],
    ['ENCRYPTION_KEY', 'change-me-base64-32-bytes-change-me-00000='],
    ['RUNNER_JOB_SIGNING_KEYS', 'k1:dev-job-signing-secret-change-me-000000'],
    ['COOKIE_SECURE', 'false'],
    ['WEB_ORIGIN', 'http://forge.example'],
    ['SMTP_URL', 'smtp://localhost:1025'],
  ])('refuses %s=%s', (key, value) => {
    expect(() => loadEnv({ ...PROD, [key]: value })).toThrow(new RegExp(key));
  });

  it.each(['RUNNER_REDIS_URL', 'RUNNER_JOB_SIGNING_KEYS', 'RUNNER_CALLBACK_KEYS'])(
    'requires %s',
    (key) => {
      const env: Record<string, string> = { ...PROD };
      delete env[key];
      expect(() => loadEnv(env)).toThrow(new RegExp(key));
    },
  );

  it('requires at least one alert channel', () => {
    const { ALERT_EMAIL: _a, ...rest } = PROD;
    expect(() => loadEnv(rest)).toThrow(/ALERT_EMAIL/);
    expect(loadEnv({ ...rest, ALERT_WEBHOOK_URL: 'https://ntfy.sh/x' }).ALERT_WEBHOOK_URL).toBe(
      'https://ntfy.sh/x',
    );
  });

  it('does not apply in development', () => {
    expect(() =>
      loadEnv({
        DATABASE_URL: 'x',
        APP_SECRET: 'change-me-'.repeat(4),
        ENCRYPTION_KEY: 'x'.repeat(40),
      }),
    ).not.toThrow();
  });
});
