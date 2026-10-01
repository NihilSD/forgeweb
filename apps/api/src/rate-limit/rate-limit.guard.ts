import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ENV, type Env } from '../config/env.js';
import { clientIp, type ForgeRequest } from '../common/request-context.js';
import { type Limit, RateLimitService } from './rate-limit.service.js';

/**
 * Endpoint classes (spec 3.2). Anonymous clients get the stricter `anon` numbers.
 * Per-route overrides use @RateLimit.
 */
export const RATE_CLASSES = {
  read: { user: { limit: 600, windowSec: 60 }, anon: { limit: 240, windowSec: 60 } },
  write: { user: { limit: 120, windowSec: 60 }, anon: { limit: 30, windowSec: 60 } },
  search: { user: { limit: 60, windowSec: 60 }, anon: { limit: 20, windowSec: 60 } },
  // Anonymous callers are rejected by auth anyway; a small budget lets them see 401, not 429.
  submission: { user: { limit: 30, windowSec: 60 }, anon: { limit: 10, windowSec: 60 } },
  // Signed provider callbacks (Stripe) arrive in bursts from a few IPs.
  webhook: { user: { limit: 1200, windowSec: 60 }, anon: { limit: 1200, windowSec: 60 } },
} satisfies Record<string, { user: Limit; anon: Limit }>;
export type RateClass = keyof typeof RATE_CLASSES;

export interface RouteLimit extends Limit {
  /** Bucket name; routes sharing a bucket share a counter. */
  bucket: string;
  by: 'ip' | 'user';
}

const RATE_LIMIT = 'forge:rate-limit';
const RATE_CLASS = 'forge:rate-class';

export const RateLimit = (...limits: RouteLimit[]) => SetMetadata(RATE_LIMIT, limits);
export const RateClassOf = (cls: RateClass) => SetMetadata(RATE_CLASS, cls);

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.env.RATE_LIMITS_ENABLED) return true;
    const req = context.switchToHttp().getRequest<ForgeRequest>();
    const res = context.switchToHttp().getResponse<import('express').Response>();
    const ip = clientIp(req, this.env);
    const userId = req.auth?.user.id;
    const targets = [context.getHandler(), context.getClass()];

    const cls =
      this.reflector.getAllAndOverride<RateClass | undefined>(RATE_CLASS, targets) ??
      (req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write');
    const classLimit = userId ? RATE_CLASSES[cls].user : RATE_CLASSES[cls].anon;
    const key = userId ? `class:${cls}:u:${userId}` : `class:${cls}:ip:${ip}`;

    const routeLimits =
      this.reflector.getAllAndOverride<RouteLimit[] | undefined>(RATE_LIMIT, targets) ?? [];
    try {
      await this.limits.consume(key, classLimit);
      for (const l of routeLimits) {
        const subject = l.by === 'user' ? (userId ?? `ip:${ip}`) : `ip:${ip}`;
        await this.limits.consume(`route:${l.bucket}:${subject}`, l);
      }
    } catch (err) {
      const retry = (err as { details?: { retryAfter?: number } }).details?.retryAfter;
      if (retry) res.setHeader('Retry-After', String(retry));
      throw err;
    }
    return true;
  }
}
