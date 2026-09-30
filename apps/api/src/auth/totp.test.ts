import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, stepAt, totpAt, verifyTotp } from './totp.js';

// RFC 6238 Appendix B, SHA-1 column (8 digits), secret "12345678901234567890".
const SECRET = Buffer.from('12345678901234567890');
const VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP', () => {
  it.each(VECTORS)('matches RFC 6238 vector at t=%i', (t, expected) => {
    expect(hotp(SECRET, stepAt(t * 1000), 8)).toBe(expected);
  });

  it('round-trips base32', () => {
    expect(base32Encode(SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(base32Encode(SECRET)).equals(SECRET)).toBe(true);
  });

  it('accepts ±1 step and rejects replays', () => {
    const secret = base32Encode(SECRET);
    const now = 1_700_000_000_000;
    const code = totpAt(secret, now);
    const step = verifyTotp(secret, code, now, null);
    expect(step).toBe(stepAt(now));
    expect(verifyTotp(secret, code, now, step)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now, null)).not.toBeNull();
    expect(verifyTotp(secret, totpAt(secret, now - 90_000), now, null)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
  });
});
