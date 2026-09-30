import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Session, User } from '@forge/db';
import type { Request } from 'express';
import type { Env } from '../config/env.js';

export interface AuthContext {
  user: User;
  session: Session;
}

export type ForgeRequest = Request & { auth?: AuthContext | null };

export const IS_PUBLIC = 'forge:public';
/** Route is reachable without a session. Anything not marked is authenticated by default. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_PENDING_2FA = 'forge:allow-pending-2fa';
/** Route is reachable by a session that has passed the password step but not yet TOTP. */
export const AllowPending2fa = () => SetMetadata(ALLOW_PENDING_2FA, true);

export const SKIP_CSRF = 'forge:skip-csrf';
/** Only for machine-to-machine endpoints authenticated by signature (webhooks, runner callbacks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);

export const REQUIRE_VERIFIED_EMAIL = 'forge:require-verified-email';
/** Spec 3.1: email verification is required for Competitive and Community actions. */
export const RequireVerifiedEmail = () => SetMetadata(REQUIRE_VERIFIED_EMAIL, true);

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<ForgeRequest>();
    if (!req.auth) throw new Error('CurrentAuth used on a public route without a session');
    return req.auth;
  },
);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): User => {
  const req = ctx.switchToHttp().getRequest<ForgeRequest>();
  if (!req.auth) throw new Error('CurrentUser used on a public route without a session');
  return req.auth.user;
});

/**
 * The client IP. Behind a proxy, Express resolves it from X-Forwarded-For only when TRUST_PROXY
 * is set. The x-test-ip header exists only so tests can simulate different clients.
 */
export function clientIp(req: Request, env: Env): string {
  if (env.NODE_ENV === 'test') {
    const testIp = req.headers['x-test-ip'];
    if (typeof testIp === 'string' && testIp) return testIp;
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
