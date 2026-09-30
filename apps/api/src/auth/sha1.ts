import { createHash } from 'node:crypto';

/** SHA-1 only for the Have I Been Pwned range API, which is keyed by SHA-1. Never for security. */
export function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}
