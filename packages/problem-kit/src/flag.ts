import { createHmac } from 'node:crypto';

/** Spec 3.4: per-user flags, FORGE{HMAC(secret, userId + challengeId)[0:24]}. */
export function flagFor(secret: string, userId: string, challengeId: string): string {
  const mac = createHmac('sha256', secret).update(`${userId}${challengeId}`).digest('hex');
  return `FORGE{${mac.slice(0, 24)}}`;
}

export const FLAG_PATTERN = /FORGE\{[0-9a-f]{24}\}/g;
