import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@forge/shared';
import type { Response } from 'express';
import { ApiError } from '../common/api-error.js';
import { hmac, randomToken, safeEqual } from '../common/crypto.js';
import { type ForgeRequest, SKIP_CSRF } from '../common/request-context.js';
import { ENV, type Env } from '../config/env.js';

export const CSRF_COOKIE = 'forge_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** A signed double-submit token: `<random>.<hmac(random)>`. Unsigned values are rejected. */
export function issueCsrfToken(secret: string): string {
  const raw = randomToken(18);
  return `${raw}.${hmac(secret, `csrf:${raw}`)}`;
}

export function isValidCsrfToken(secret: string, token: string): boolean {
  const [raw, sig] = token.split('.');
  if (!raw || !sig) return false;
  return safeEqual(sig, hmac(secret, `csrf:${raw}`));
}

export function setCsrfCookie(res: Response, env: Env, token: string) {
  // Readable by the page's own JS (it must copy it into the header); SameSite=Lax blocks
  // cross-site sends, and the signature blocks cookie-injection via sibling domains.
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ForgeRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const fail = () =>
      new ApiError(ErrorCode.CSRF_FAILED, 'Security check failed. Reload the page and try again.');

    const origin = req.headers.origin;
    if (
      origin &&
      origin !== this.env.WEB_ORIGIN &&
      origin !== new URL(this.env.API_PUBLIC_URL).origin
    ) {
      throw fail();
    }
    const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    const header = req.headers[CSRF_HEADER];
    if (typeof cookie !== 'string' || typeof header !== 'string') throw fail();
    if (!safeEqual(cookie, header) || !isValidCsrfToken(this.env.APP_SECRET, cookie)) throw fail();
    return true;
  }
}
