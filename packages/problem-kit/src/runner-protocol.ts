import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ExecRequest, ExecResult } from '@forge/shared';

/**
 * Wire protocol between the API and runner hosts (spec 3.3, 6.1).
 *
 * - Jobs go through a dedicated Redis queue and are HMAC-signed by the API; the runner rejects
 *   unsigned, tampered or stale jobs.
 * - Results come back over HTTPS with an HMAC over `timestamp.body`; the API rejects unsigned,
 *   stale or replayed callbacks.
 * - Keys rotate: a key set is "k2:secret2,k1:secret1"; the first key signs, any listed key verifies.
 */
export const RUNNER_QUEUE = 'forge-runs';
export const MAX_JOB_AGE_MS = 10 * 60_000;
export const MAX_CALLBACK_SKEW_MS = 5 * 60_000;

export interface RunnerJob {
  jobId: string;
  issuedAt: number;
  request: ExecRequest;
}

export interface SignedJob {
  payload: string;
  keyId: string;
  signature: string;
}

export interface RunnerCallback {
  jobId: string;
  runnerId: string;
  result: ExecResult;
}

export interface KeySet {
  signing: { id: string; secret: string };
  all: Map<string, string>;
}

export function parseKeySet(spec: string | undefined, name: string): KeySet {
  const pairs = (spec ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf(':');
      return [p.slice(0, idx), p.slice(idx + 1)] as const;
    });
  if (pairs.length === 0 || pairs.some(([id, secret]) => !id || secret.length < 32)) {
    throw new Error(`${name} must be "keyId:secret[,keyId:secret]" with secrets of 32+ characters`);
  }
  return { signing: { id: pairs[0]![0], secret: pairs[0]![1] }, all: new Map(pairs) };
}

function mac(secret: string, data: string) {
  return createHmac('sha256', secret).update(data).digest('hex');
}

function equal(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function signJob(keys: KeySet, job: RunnerJob): SignedJob {
  const payload = JSON.stringify(job);
  return { payload, keyId: keys.signing.id, signature: mac(keys.signing.secret, `job.${payload}`) };
}

export function verifyJob(keys: KeySet, signed: SignedJob, now = Date.now()): RunnerJob {
  const secret = keys.all.get(signed.keyId);
  if (
    !secret ||
    typeof signed.signature !== 'string' ||
    !equal(signed.signature, mac(secret, `job.${signed.payload}`))
  ) {
    throw new Error('job signature invalid');
  }
  const job = JSON.parse(signed.payload) as RunnerJob;
  if (
    typeof job.issuedAt !== 'number' ||
    now - job.issuedAt > MAX_JOB_AGE_MS ||
    job.issuedAt - now > MAX_CALLBACK_SKEW_MS
  ) {
    throw new Error('job expired');
  }
  return job;
}

export interface CallbackHeaders {
  'x-forge-timestamp': string;
  'x-forge-key': string;
  'x-forge-signature': string;
}

export function signCallback(keys: KeySet, body: string, now = Date.now()): CallbackHeaders {
  const ts = String(now);
  return {
    'x-forge-timestamp': ts,
    'x-forge-key': keys.signing.id,
    'x-forge-signature': mac(keys.signing.secret, `${ts}.${body}`),
  };
}

export function verifyCallback(
  keys: KeySet,
  body: string,
  headers: Partial<Record<keyof CallbackHeaders, string | undefined>>,
  now = Date.now(),
): boolean {
  const ts = Number(headers['x-forge-timestamp']);
  const secret = headers['x-forge-key'] ? keys.all.get(headers['x-forge-key']) : undefined;
  const sig = headers['x-forge-signature'];
  if (!secret || !sig || !Number.isFinite(ts) || Math.abs(now - ts) > MAX_CALLBACK_SKEW_MS)
    return false;
  return equal(sig, mac(secret, `${ts}.${body}`));
}
