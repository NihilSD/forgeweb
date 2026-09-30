// Integration tests run against real PostgreSQL and Redis (see docs/testing.md).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://forge:forge@localhost:5432/forge_test';
process.env.REDIS_URL ??= 'redis://localhost:6379/1';
process.env.APP_SECRET ??= 'test-secret-test-secret-test-secret-000';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');
process.env.COOKIE_SECURE ??= 'true';
