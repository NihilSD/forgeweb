import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module.js';
import { securityHeaders } from './common/security-headers.js';
import { loadEnv } from './config/env.js';

export const API_PREFIX = 'api/v1';

/** Builds the Nest app. Shared by main.ts and integration tests. */
export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: opts.logger === false ? false : ['error', 'warn', 'log'],
  });
  app.set('trust proxy', env.TRUST_PROXY ? env.TRUST_PROXY_HOPS : false);
  app.disable('x-powered-by');
  app.use(securityHeaders(env.NODE_ENV === 'production'));
  // Stripe webhooks need the raw body for signature verification.
  app.use('/api/v1/billing/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
  // Runner callbacks are HMAC-signed over the exact bytes sent.
  app.use(
    '/api/v1/internal/runner/callback',
    express.raw({ type: 'application/json', limit: '8mb' }),
  );
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
