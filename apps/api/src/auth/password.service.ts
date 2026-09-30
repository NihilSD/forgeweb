import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@forge/shared';
import argon2 from 'argon2';
import { ApiError } from '../common/api-error.js';
import { sha1Hex } from './sha1.js';
import { ENV, type Env } from '../config/env.js';

/** OWASP-recommended argon2id parameters (19 MiB, 2 iterations, 1 lane). */
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

let commonPasswords: Set<string> | null = null;
function loadCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    // NCSC "100k most used passwords" (via SecLists), filtered to entries of 10+ characters.
    const file = resolve(import.meta.dirname, '../../assets/common-passwords.txt.gz');
    commonPasswords = new Set(
      gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean),
    );
  }
  return commonPasswords;
}

@Injectable()
export class PasswordService {
  private readonly logger = new Logger('PasswordService');
  /** A real hash to verify against when the account doesn't exist, so timing doesn't reveal it. */
  private dummyHash: Promise<string> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON_OPTIONS);
  }

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    if (!hash) {
      this.dummyHash ??= this.hash('dummy-password-for-timing');
      await argon2.verify(await this.dummyHash, password).catch(() => false);
      return false;
    }
    return argon2.verify(hash, password).catch(() => false);
  }

  /** Throws WEAK_PASSWORD for known-breached or trivially guessable passwords. */
  async assertStrong(password: string, context: { email?: string } = {}): Promise<void> {
    const lower = password.toLowerCase();
    const weak = () =>
      new ApiError(
        ErrorCode.WEAK_PASSWORD,
        'This password appears in lists of breached passwords. Choose a different one.',
      );
    if (loadCommonPasswords().has(lower)) throw weak();
    if (/^(.)\1+$/.test(password)) throw weak();
    const local = context.email?.split('@')[0]?.toLowerCase();
    if (local && local.length >= 4 && lower.includes(local)) {
      throw new ApiError(
        ErrorCode.WEAK_PASSWORD,
        "Your password shouldn't contain your email address.",
      );
    }
    if (this.env.HIBP_CHECK_ENABLED && (await this.pwnedCount(password)) > 0) throw weak();
  }

  /** k-anonymity range query: only the first 5 hex chars of the SHA-1 leave the server. */
  private async pwnedCount(password: string): Promise<number> {
    const hash = sha1Hex(password).toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return 0;
      const body = await res.text();
      const line = body.split('\n').find((l) => l.startsWith(suffix));
      return line ? Number(line.split(':')[1]) : 0;
    } catch {
      this.logger.warn('Breached-password range check unavailable; relying on the bundled list');
      return 0;
    }
  }
}
