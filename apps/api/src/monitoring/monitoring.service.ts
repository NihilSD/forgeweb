import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RedisService } from '../infra/redis.service.js';
import { RunnerQueueService } from '../submissions/runner-queue.service.js';

/** A submission queued for longer than this means runners are not keeping up. */
export const BACKLOG_SECONDS = 120;
/** A webhook event still failed after this long needs a human. */
export const WEBHOOK_STUCK_MINUTES = 15;

/** Unexpected 500s in the last 5 minutes (all API instances) that trigger an alert. */
export const ERROR_BURST = 10;

export interface HealthSnapshot {
  runnersAlive: number;
  queueWaiting: number;
  oldestQueuedSeconds: number;
  failedWebhooks: number;
  serverErrors5m: number;
}

type AlertName = 'runners-down' | 'submission-backlog' | 'webhooks-failing' | 'api-errors';

const minuteKey = (t: number) => `monitoring:5xx:${Math.floor(t / 60_000)}`;

/**
 * Spec L13: watches runner heartbeats, the submission backlog and failing Stripe webhooks, and
 * alerts the owner once when a problem starts and once when it clears (by email to ALERT_EMAIL
 * and/or a POST to ALERT_WEBHOOK_URL). Alert state is kept in Redis so several API instances
 * send one alert, not one each. Alerts carry counts only, never user data.
 */
@Injectable()
export class MonitoringService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Monitoring');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(RunnerQueueService) private readonly runner: RunnerQueueService,
    @Inject(EmailService) private readonly email: EmailService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    const tick = () => this.check().catch((err: Error) => this.logger.error(err.message));
    this.timer = setInterval(tick, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runnersAlive(): Promise<number> {
    let cursor = '0';
    let count = 0;
    do {
      const [next, keys] = await this.runner.connection.scan(
        cursor,
        'MATCH',
        'runner:heartbeat:*',
        'COUNT',
        100,
      );
      cursor = next;
      count += keys.length;
    } while (cursor !== '0');
    return count;
  }

  /**
   * Error tracking without a third-party service: every unexpected 500 is counted per minute in
   * Redis (shared by all API instances), and the stack trace goes to the container log.
   */
  async recordServerError(): Promise<void> {
    const key = minuteKey(Date.now());
    await this.redis.client.multi().incr(key).expire(key, 600).exec();
  }

  async serverErrorsLast5m(): Promise<number> {
    const now = Date.now();
    const keys = Array.from({ length: 5 }, (_, i) => minuteKey(now - i * 60_000));
    const values = await this.redis.client.mget(...keys);
    return values.reduce((sum, v) => sum + Number(v ?? 0), 0);
  }

  async snapshot(): Promise<HealthSnapshot> {
    const db = this.prisma.client;
    const [runnersAlive, queueWaiting, oldest, failedWebhooks, serverErrors5m] = await Promise.all([
      this.runnersAlive(),
      this.runner.queue.getWaitingCount(),
      db.submission.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      db.webhookEvent.count({
        where: {
          status: 'failed',
          createdAt: { lt: new Date(Date.now() - WEBHOOK_STUCK_MINUTES * 60_000) },
        },
      }),
      this.serverErrorsLast5m(),
    ]);
    const oldestQueuedSeconds = oldest
      ? Math.max(0, Math.floor((Date.now() - oldest.createdAt.getTime()) / 1000))
      : 0;
    return { runnersAlive, queueWaiting, oldestQueuedSeconds, failedWebhooks, serverErrors5m };
  }

  /** One monitoring pass. Runs every minute outside tests. */
  async check(): Promise<HealthSnapshot> {
    const s = await this.snapshot();
    await this.transition(
      'runners-down',
      s.runnersAlive === 0,
      'No runner has sent a heartbeat in the last 30 seconds. Code runs and verified attempts are stalled. See docs/runbooks/runner-incident.md.',
    );
    await this.transition(
      'submission-backlog',
      s.oldestQueuedSeconds > BACKLOG_SECONDS,
      `The oldest queued submission has waited ${s.oldestQueuedSeconds}s (threshold ${BACKLOG_SECONDS}s); ${s.queueWaiting} jobs waiting, ${s.runnersAlive} runners alive.`,
    );
    await this.transition(
      'webhooks-failing',
      s.failedWebhooks > 0,
      `${s.failedWebhooks} Stripe webhook events have been failing for more than ${WEBHOOK_STUCK_MINUTES} minutes. See docs/runbooks/stripe.md.`,
    );
    await this.transition(
      'api-errors',
      s.serverErrors5m >= ERROR_BURST,
      `The API returned ${s.serverErrors5m} unexpected 500 errors in the last 5 minutes. Stack traces are in the API log (docker compose logs api).`,
    );
    return s;
  }

  /** Sends an alert only when the state changes (firing ↔ resolved). */
  private async transition(name: AlertName, firing: boolean, detail: string) {
    const key = `monitoring:alert:${name}`;
    if (firing) {
      // SET NX: only the first instance to see the problem alerts.
      const claimed = await this.redis.client.set(key, String(Date.now()), 'NX');
      if (claimed) await this.notify(`[Forge] FIRING: ${name}`, detail);
    } else {
      const cleared = await this.redis.client.del(key);
      if (cleared) await this.notify(`[Forge] RESOLVED: ${name}`, `${name} has cleared.`);
    }
  }

  private async notify(subject: string, text: string) {
    this.logger.warn(subject);
    if (this.env.ALERT_EMAIL) await this.email.send({ to: this.env.ALERT_EMAIL, subject, text });
    if (this.env.ALERT_WEBHOOK_URL) {
      try {
        const res = await fetch(this.env.ALERT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: subject, text: `${subject}\n${text}` }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) this.logger.error(`Alert webhook returned ${res.status}`);
      } catch (err) {
        this.logger.error(`Alert webhook failed: ${(err as Error).message}`);
      }
    }
  }
}
