// Integration tests run against real PostgreSQL and Redis (see docs/testing.md).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://forge:forge@localhost:5432/forge_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/1';
process.env.APP_SECRET ??= 'test-secret-test-secret-test-secret-000';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.COOKIE_SECURE ??= 'true';
process.env.RUNNER_REDIS_URL ??= 'redis://localhost:6379/4';
process.env.RUNNER_JOB_SIGNING_KEYS ??= 'k1:test-job-signing-secret-000000000000000';
process.env.RUNNER_CALLBACK_KEYS ??= 'c1:test-callback-secret-00000000000000000000';
process.env.STRIPE_WEBHOOK_SECRET ??= 'whsec_test_forge_webhook_secret_0000000000';
process.env.STRIPE_PRICE_PRO_MONTHLY ??= 'price_test_monthly';
process.env.STRIPE_PRICE_PRO_YEARLY ??= 'price_test_yearly';
process.env.STRIPE_PRICE_PRO_MONTHLY_REDUCED ??= 'price_test_monthly_reduced';
process.env.STRIPE_PRICE_PRO_YEARLY_REDUCED ??= 'price_test_yearly_reduced';
process.env.ALERT_EMAIL ??= 'ops@example.com';
process.env.BACKUP_MAX_AGE_HOURS ??= '26';
process.env.METRICS_TOKEN ??= 'test-metrics-token-0000000000000000';
