/**
 * Test-only runner: consumes real signed jobs from the queue and posts signed callbacks to the
 * app over HTTP, using the development executor (tests run trusted fixture code only). The real
 * sandbox is covered by apps/runner's attack, verdict and load suites.
 */
import { type INestApplication } from '@nestjs/common';
import {
  type Executor,
  RUNNER_QUEUE,
  type RunnerCallback,
  type SignedJob,
  signCallback,
  verifyJob,
} from '@forge/problem-kit';
import { DevExecutor } from '@forge/problem-kit/dev-executor';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';
import { RunnerQueueService } from '../src/submissions/runner-queue.service.js';

export class FakeRunner {
  private readonly connection = new Redis(process.env.RUNNER_REDIS_URL!, {
    maxRetriesPerRequest: null,
  });
  private worker: Worker<SignedJob> | null = null;
  /** Override to simulate failures. */
  executor: Executor = new DevExecutor();
  readonly callbacks: { body: string; headers: Record<string, string>; status: number }[] = [];

  constructor(private readonly app: INestApplication) {}

  start() {
    const queue = this.app.get(RunnerQueueService);
    this.worker = new Worker<SignedJob>(
      RUNNER_QUEUE,
      async (job) => {
        const verified = verifyJob(queue.jobKeys, job.data);
        const result = await this.executor.run(verified.request);
        const cb: RunnerCallback = { jobId: verified.jobId, runnerId: 'fake', result };
        const body = JSON.stringify(cb);
        const headers = signCallback(queue.callbackKeys, body) as unknown as Record<string, string>;
        const res = await request(this.app.getHttpServer())
          .post('/api/v1/internal/runner/callback')
          .set('content-type', 'application/json')
          .set(headers)
          .send(body);
        this.callbacks.push({ body, headers, status: res.status });
      },
      { connection: this.connection, concurrency: 2 },
    );
    // Tests flush the queue between cases; lost-lock noise from that is expected.
    this.worker.on('error', () => undefined);
    return this;
  }

  async stop() {
    await this.worker?.close();
    await this.connection.quit();
  }
}

/** Polls a submission until the runner has finished it. */
export async function waitDone(
  get: (path: string) => Promise<request.Response>,
  id: string,
  timeoutMs = 30_000,
): Promise<request.Response> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const res = await get(`/submissions/${id}`);
    if (res.body.status === 'done') return res;
    if (Date.now() > until)
      throw new Error(`submission ${id} not done: ${JSON.stringify(res.body)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
