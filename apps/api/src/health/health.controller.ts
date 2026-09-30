import { Controller, Get, Inject } from '@nestjs/common';
import { type Health, healthSchema } from '@forge/shared';
import { Public } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  @Get()
  @ResponseSchema(healthSchema)
  async health(): Promise<Health> {
    const [db, redis] = await Promise.all([
      this.prisma.client.$queryRaw`SELECT 1`.then(
        () => 'ok' as const,
        () => 'fail' as const,
      ),
      this.redis.client.ping().then(
        () => 'ok' as const,
        () => 'fail' as const,
      ),
    ]);
    return {
      status: db === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      version: this.env.APP_VERSION,
      time: new Date().toISOString(),
      checks: { database: db, redis },
    };
  }
}
