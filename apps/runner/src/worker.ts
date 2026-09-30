import {
  type Executor,
  type KeySet,
  RUNNER_QUEUE,
  type RunnerCallback,
  type SignedJob,
  signCallback,
  verifyJob,
} from '@forge/problem-kit';
import type { ExecResult } from '@forge/shared';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

export interface WorkerDeps {
  connection: Redis;
  executor: Executor;
  jobKeys: KeySet;
  callbackKeys: KeySet;
  callbackUrl: string;
  runnerId: string;
  concurrency: number;
  log?: (msg: string) => void;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

/** Posts a signed result, retrying transient failures. The API rejects replays by job id. */
export async function postCallback(deps: WorkerDeps, body: RunnerCallback): Promise<void> {
  const payload = JSON.stringify(body);
  const doFetch = deps.fetchImpl ?? fetch;
  let lastError = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await doFetch(deps.callbackUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...signCallback(deps.callbackKeys, payload),
        },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      // 2xx: stored. 409: already processed (a retry after a lost response). Both are final.
      if (res.ok || res.status === 409) return;
      lastError = `status ${res.status}`;
      if (res.status < 500) break;
    } catch (err) {
      lastError = (err as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error(`callback failed: ${lastError}`);
}

/** Handles one queued job: verify signature, run in the sandbox, report back. */
export async function processJob(deps: WorkerDeps, signed: SignedJob): Promise<ExecResult | null> {
  let job;
  try {
    job = verifyJob(deps.jobKeys, signed);
  } catch (err) {
    // Unsigned, tampered or stale: never execute, never report (we can't trust the job id).
    deps.log?.(`rejected job: ${(err as Error).message}`);
    return null;
  }
  const started = Date.now();
  let result: ExecResult;
  try {
    result = await deps.executor.run(job.request);
  } catch (err) {
    result = {
      status: 'internal_error',
      tests: [],
      timeMs: 0,
      memoryKb: null,
      message: (err as Error).message,
    };
  }
  // Never log code or outputs: only ids, status and timing.
  deps.log?.(
    `job ${job.jobId} ${job.request.language} ${result.status} in ${Date.now() - started}ms`,
  );
  await postCallback(deps, { jobId: job.jobId, runnerId: deps.runnerId, result });
  return result;
}

export function startWorker(deps: WorkerDeps): Worker {
  return new Worker<SignedJob>(
    RUNNER_QUEUE,
    async (job) => void (await processJob(deps, job.data)),
    {
      connection: deps.connection,
      concurrency: deps.concurrency,
      // A stuck sandbox is killed by the watchdog well before this.
      lockDuration: 5 * 60_000,
    },
  );
}
