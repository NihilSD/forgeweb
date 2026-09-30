import {
  type Executor,
  parseKeySet,
  type RunnerCallback,
  signCallback,
  signJob,
  verifyCallback,
} from '@forge/problem-kit';
import type { ExecRequest, ExecResult } from '@forge/shared';
import { describe, expect, it, vi } from 'vitest';
import { processJob, type WorkerDeps } from '../src/worker.js';

const jobKeys = parseKeySet(
  'k2:job-secret-2222222222222222222222222222,k1:job-secret-1111111111111111111111111111',
  'jobs',
);
const callbackKeys = parseKeySet('c1:callback-secret-111111111111111111111111111', 'callbacks');
const request: ExecRequest = {
  language: 'python',
  code: 'def f():\n    return 1',
  entry: 'f',
  tests: [{ id: 't1', args: [] }],
  limits: { timeMs: 1000, memoryMb: 128, outputKb: 16 },
};
const ok: ExecResult = {
  status: 'ok',
  tests: [{ id: 't1', status: 'ok', value: 1, timeMs: 1 }],
  timeMs: 5,
  memoryKb: null,
};

function deps(overrides: Partial<WorkerDeps> = {}) {
  const run = vi.fn(async () => ok);
  const posted: { body: RunnerCallback; headers: Record<string, string> }[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    posted.push({
      body: JSON.parse(String(init?.body)) as RunnerCallback,
      headers: init?.headers as Record<string, string>,
    });
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  const d: WorkerDeps = {
    connection: {} as WorkerDeps['connection'],
    executor: { name: 'fake', run } as Executor,
    jobKeys,
    callbackKeys,
    callbackUrl: 'http://api.test/callback',
    runnerId: 'runner-test',
    concurrency: 1,
    fetchImpl,
    ...overrides,
  };
  return { d, run, posted };
}

describe('runner job protocol', () => {
  it('runs a signed job and posts a signed callback', async () => {
    const { d, run, posted } = deps();
    await processJob(d, signJob(jobKeys, { jobId: 'j1', issuedAt: Date.now(), request }));
    expect(run).toHaveBeenCalledOnce();
    expect(posted).toHaveLength(1);
    expect(posted[0]!.body).toMatchObject({ jobId: 'j1', runnerId: 'runner-test', result: ok });
    expect(verifyCallback(callbackKeys, JSON.stringify(posted[0]!.body), posted[0]!.headers)).toBe(
      true,
    );
  });

  it('accepts jobs signed with an older (rotated) key', async () => {
    const old = parseKeySet('k1:job-secret-1111111111111111111111111111', 'old');
    const { d, run } = deps();
    await processJob(d, signJob(old, { jobId: 'j1', issuedAt: Date.now(), request }));
    expect(run).toHaveBeenCalledOnce();
  });

  it.each([
    ['unsigned', (s: ReturnType<typeof signJob>) => ({ ...s, signature: '' })],
    [
      'tampered code',
      (s: ReturnType<typeof signJob>) => ({
        ...s,
        payload: s.payload.replace('return 1', 'return 2'),
      }),
    ],
    ['unknown key', (s: ReturnType<typeof signJob>) => ({ ...s, keyId: 'nope' })],
  ])('never executes a job that is %s', async (_n, mutate) => {
    const { d, run, posted } = deps();
    const res = await processJob(
      d,
      mutate(signJob(jobKeys, { jobId: 'j1', issuedAt: Date.now(), request })),
    );
    expect(res).toBeNull();
    expect(run).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);
  });

  it('never executes a stale (replayed) job', async () => {
    const { d, run } = deps();
    await processJob(
      d,
      signJob(jobKeys, { jobId: 'j1', issuedAt: Date.now() - 11 * 60_000, request }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('reports executor crashes as internal errors', async () => {
    const { d, posted } = deps({
      executor: {
        name: 'broken',
        run: async () => {
          throw new Error('docker down');
        },
      },
    });
    await processJob(d, signJob(jobKeys, { jobId: 'j1', issuedAt: Date.now(), request }));
    expect(posted[0]!.body.result.status).toBe('internal_error');
  });

  it('rejects callbacks with bad signatures or skewed clocks', () => {
    const body = JSON.stringify({ jobId: 'j1' });
    const now = Date.now();
    const good = {
      'x-forge-timestamp': String(now),
      'x-forge-key': 'c1',
      'x-forge-signature': '',
    };
    expect(verifyCallback(callbackKeys, body, good)).toBe(false);
    const old = parseKeySet('c1:callback-secret-111111111111111111111111111', 'x');
    const signed = signCallback(old, body, now - 6 * 60_000);
    expect(verifyCallback(callbackKeys, body, signed, now)).toBe(false);
    expect(verifyCallback(callbackKeys, body + ' ', signCallback(old, body, now), now)).toBe(false);
    expect(verifyCallback(callbackKeys, body, signCallback(old, body, now), now)).toBe(true);
  });
});
