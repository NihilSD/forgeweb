import { parseKeySet } from '@forge/problem-kit';
import { DockerExecutor } from '@forge/problem-kit/docker-executor';
import { Redis } from 'ioredis';
import { loadRunnerEnv } from './config.js';
import { startWorker } from './worker.js';

const env = loadRunnerEnv();
const connection = new Redis(env.RUNNER_REDIS_URL, { maxRetriesPerRequest: null });
const executor = new DockerExecutor({
  runtime: env.RUNNER_RUNTIME,
  images: {
    python: env.RUNNER_IMAGE_PYTHON,
    node: env.RUNNER_IMAGE_NODE,
    sql: env.RUNNER_IMAGE_SQL,
  },
});
const worker = startWorker({
  connection,
  executor,
  jobKeys: parseKeySet(env.RUNNER_JOB_SIGNING_KEYS, 'RUNNER_JOB_SIGNING_KEYS'),
  callbackKeys: parseKeySet(env.RUNNER_CALLBACK_KEYS, 'RUNNER_CALLBACK_KEYS'),
  callbackUrl: env.RUNNER_CALLBACK_URL,
  runnerId: env.RUNNER_ID,
  concurrency: env.RUNNER_CONCURRENCY,
  log: (m) => console.info(m),
});

// Heartbeat for monitoring (queue depth and runner health alerts, spec L13).
const beat = async () => {
  await connection
    .set(
      `runner:heartbeat:${env.RUNNER_ID}`,
      JSON.stringify({ at: Date.now(), runtime: env.RUNNER_RUNTIME }),
      'EX',
      30,
    )
    .catch(() => undefined);
};
await beat();
const heartbeat = setInterval(beat, 10_000);
console.info(`Forge runner ${env.RUNNER_ID} (${executor.name}) x${env.RUNNER_CONCURRENCY} ready`);

const shutdown = async () => {
  clearInterval(heartbeat);
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
