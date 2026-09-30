'use client';
import type { Submission } from '@forge/shared';
import { api, ApiClientError } from './api-client';

/** Polls a submission until the runner has finished it. */
export async function pollSubmission(id: string, signal?: AbortSignal): Promise<Submission> {
  const started = Date.now();
  for (;;) {
    const s = await api<Submission>(`/submissions/${id}`, signal ? { signal } : {});
    if (s.status === 'done') return s;
    if (Date.now() - started > 90_000) {
      throw new ApiClientError(0, 'TIMEOUT', 'This is taking too long. Please try again.');
    }
    await new Promise((r) => setTimeout(r, Date.now() - started < 3000 ? 300 : 1000));
  }
}

/** Starts a run or submission and waits for the result. */
export async function execute(
  slug: string,
  kind: 'run' | 'submit',
  body: { language: string; code: string; customArgs?: unknown[] },
  signal?: AbortSignal,
): Promise<Submission> {
  const started = await api<Submission>(`/problems/${slug}/${kind}`, { method: 'POST', body });
  return pollSubmission(started.id, signal);
}
