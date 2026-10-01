import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@forge/db';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { BillingService, RetryLater } from './billing.service.js';
import type { Stripe } from './stripe-client.js';

export const BILLING_QUEUE = 'billing-webhooks';

/**
 * Spec 10: webhooks are verified, stored once and processed through a queue. The HTTP handler
 * only verifies and records; this worker applies events with retries and backoff.
 */
@Injectable()
export class BillingQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BillingQueue');
  private readonly connection: Redis;
  private readonly queue: Queue<{ eventId: string }>;
  private worker: Worker<{ eventId: string }> | null = null;

  constructor(
    @Inject(ENV) env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BillingService) private readonly billing: BillingService,
  ) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(BILLING_QUEUE, { connection: this.connection });
  }

  onModuleInit() {
    this.worker = new Worker<{ eventId: string }>(
      BILLING_QUEUE,
      (job) => this.process(job.data.eventId),
      { connection: this.connection.duplicate(), concurrency: 1 },
    );
    this.worker.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit().catch(() => undefined);
  }

  /** Stores a verified event once. Returns false for a duplicate delivery. */
  async accept(event: Stripe.Event): Promise<boolean> {
    try {
      await this.prisma.client.webhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          created: event.created,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Still make sure it is queued (e.g. the first delivery crashed before enqueueing).
        await this.enqueue(event.id);
        return false;
      }
      throw err;
    }
    await this.enqueue(event.id);
    return true;
  }

  private enqueue(eventId: string) {
    return this.queue.add(
      'event',
      { eventId },
      {
        // Same id = one job, so duplicate deliveries never run twice in parallel.
        jobId: eventId,
        attempts: 8,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 5000,
        removeOnFail: 5000,
      },
    );
  }

  async process(eventId: string): Promise<void> {
    const db = this.prisma.client;
    const row = await db.webhookEvent.findUnique({ where: { eventId } });
    if (!row || row.status === 'processed' || row.status === 'ignored') return;
    try {
      const handled = await this.billing.handleEvent(row.payload as unknown as Stripe.Event);
      await db.webhookEvent.update({
        where: { eventId },
        data: {
          status: handled ? 'processed' : 'ignored',
          attempts: { increment: 1 },
          error: null,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      await db.webhookEvent.update({
        where: { eventId },
        data: { status: 'failed', attempts: { increment: 1 }, error: (err as Error).message },
      });
      if (!(err instanceof RetryLater))
        this.logger.error(`event ${eventId}: ${(err as Error).message}`);
      throw err; // BullMQ retries with backoff
    }
  }
}
