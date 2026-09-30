import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode } from '@forge/shared';
import { ApiError } from '../common/api-error.js';
import { ENV, type Env } from '../config/env.js';
import { RedisService } from '../infra/redis.service.js';

export interface Limit {
  limit: number;
  windowSec: number;
}

/** Fixed-window counters in Redis, shared by all API instances. */
@Injectable()
export class RateLimitService {
  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Counts a hit and returns remaining quota and seconds until the window resets. */
  async hit(
    key: string,
    { limit, windowSec }: Limit,
  ): Promise<{ allowed: boolean; retryAfter: number }> {
    const k = `rl:${key}`;
    const results = await this.redis.client
      .multi()
      .incr(k)
      .expire(k, windowSec, 'NX')
      .ttl(k)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSec);
    return { allowed: count <= limit, retryAfter: ttl > 0 ? ttl : windowSec };
  }

  /** Throws RATE_LIMITED when the key is over its limit. */
  async consume(key: string, limit: Limit): Promise<void> {
    if (!this.env.RATE_LIMITS_ENABLED) return;
    const { allowed, retryAfter } = await this.hit(key, limit);
    if (!allowed) {
      throw new ApiError(ErrorCode.RATE_LIMITED, 'Too many requests. Please wait and try again.', {
        retryAfter,
      });
    }
  }

  async reset(key: string) {
    await this.redis.client.del(`rl:${key}`);
  }
}
