import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import { ErrorCode } from '@forge/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { safeEqual } from '../common/crypto.js';
import { Public, SkipCsrf } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { MonitoringService } from './monitoring.service.js';

const statusSchema = z.object({
  api: z.literal('ok'),
  database: z.enum(['ok', 'down']),
  runners: z.enum(['ok', 'down']),
  time: z.string(),
});

/** Public status summary. Up/down only: no hostnames, runner ids or counts. */
@Public()
@Controller('status')
export class StatusController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  @Get()
  @Header('cache-control', 'public, max-age=15')
  @ResponseSchema(statusSchema)
  async status() {
    const [database, runners] = await Promise.all([
      this.prisma.client.$queryRaw`SELECT 1`.then(
        () => 'ok' as const,
        () => 'down' as const,
      ),
      this.monitoring.runnersAlive().then(
        (n) => (n > 0 ? ('ok' as const) : ('down' as const)),
        () => 'down' as const,
      ),
    ]);
    return { api: 'ok' as const, database, runners, time: new Date().toISOString() };
  }
}

/**
 * Prometheus metrics for the owner's monitoring. Not session-based: a scraper sends
 * `Authorization: Bearer METRICS_TOKEN`. Without METRICS_TOKEN configured the route is closed.
 */
@Public()
@SkipCsrf()
@Controller('internal/metrics')
export class MetricsController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(MonitoringService) private readonly monitoring: MonitoringService,
  ) {}

  @Get()
  @Header('content-type', 'text/plain; version=0.0.4')
  @Header('cache-control', 'no-store')
  async metrics(@Req() req: Request): Promise<string> {
    const token = this.env.METRICS_TOKEN;
    const given = /^Bearer (.+)$/.exec(req.header('authorization') ?? '')?.[1];
    if (!token || !given || !safeEqual(given, token)) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, 'Metrics token required.');
    }
    const [s, p] = await Promise.all([this.monitoring.snapshot(), this.monitoring.productCounts()]);
    return [
      '# HELP forge_runners_alive Runners with a live heartbeat.',
      '# TYPE forge_runners_alive gauge',
      `forge_runners_alive ${s.runnersAlive}`,
      '# HELP forge_runner_queue_waiting Jobs waiting in the runner queue.',
      '# TYPE forge_runner_queue_waiting gauge',
      `forge_runner_queue_waiting ${s.queueWaiting}`,
      '# HELP forge_submission_oldest_queued_seconds Age of the oldest queued submission.',
      '# TYPE forge_submission_oldest_queued_seconds gauge',
      `forge_submission_oldest_queued_seconds ${s.oldestQueuedSeconds}`,
      '# HELP forge_webhook_events_failed Stripe webhook events failing for over 15 minutes.',
      '# TYPE forge_webhook_events_failed gauge',
      `forge_webhook_events_failed ${s.failedWebhooks}`,
      '# HELP forge_http_5xx_last_5m Unexpected 500 responses in the last 5 minutes.',
      '# TYPE forge_http_5xx_last_5m gauge',
      `forge_http_5xx_last_5m ${s.serverErrors5m}`,
      '# HELP forge_backup_age_seconds Seconds since the last successful backup (-1: none).',
      '# TYPE forge_backup_age_seconds gauge',
      `forge_backup_age_seconds ${s.backupAgeSeconds}`,
      '# HELP forge_users_total Accounts (not deleted).',
      '# TYPE forge_users_total gauge',
      `forge_users_total ${p.usersTotal}`,
      '# HELP forge_signups_24h Accounts created in the last 24 hours.',
      '# TYPE forge_signups_24h gauge',
      `forge_signups_24h ${p.signups24h}`,
      '# HELP forge_active_users_24h Users with a session active in the last 24 hours.',
      '# TYPE forge_active_users_24h gauge',
      `forge_active_users_24h ${p.activeUsers24h}`,
      '# HELP forge_submissions_24h Runs and submits in the last 24 hours.',
      '# TYPE forge_submissions_24h gauge',
      `forge_submissions_24h ${p.submissions24h}`,
      '# HELP forge_pro_subscriptions Active, trialing or past-due Pro subscriptions.',
      '# TYPE forge_pro_subscriptions gauge',
      `forge_pro_subscriptions ${p.proSubscriptions}`,
      '',
    ].join('\n');
  }
}
