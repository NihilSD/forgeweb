import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  type KeySet,
  parseKeySet,
  RUNNER_QUEUE,
  type RunnerJob,
  type SignedJob,
  signJob,
} from '@forge/problem-kit';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';

/**
 * The API side of the runner queue. Jobs go to a dedicated Redis (RUNNER_REDIS_URL) that runner
 * hosts reach with a restricted ACL user; they never see the main Redis or the database.
 */
@Injectable()
export class RunnerQueueService implements OnModuleDestroy {
  readonly jobKeys: KeySet;
  readonly callbackKeys: KeySet;
  /** Also read by monitoring (runner heartbeats live in this Redis). */
  readonly connection: Redis;
  readonly queue: Queue<SignedJob>;

  constructor(@Inject(ENV) env: Env) {
    this.jobKeys = parseKeySet(env.RUNNER_JOB_SIGNING_KEYS, 'RUNNER_JOB_SIGNING_KEYS');
    this.callbackKeys = parseKeySet(env.RUNNER_CALLBACK_KEYS, 'RUNNER_CALLBACK_KEYS');
    this.connection = new Redis(env.RUNNER_REDIS_URL ?? env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    this.queue = new Queue<SignedJob>(RUNNER_QUEUE, { connection: this.connection });
  }

  async enqueue(job: RunnerJob) {
    await this.queue.add('run', signJob(this.jobKeys, job), {
      jobId: job.jobId,
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 1,
    });
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit().catch(() => undefined);
  }
}
