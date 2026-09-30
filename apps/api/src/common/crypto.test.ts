import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, hashIp, safeEqual } from './crypto.js';

const KEY = Buffer.alloc(32, 1).toString('base64');

describe('crypto helpers', () => {
  it('encrypts and decrypts with AES-GCM and detects tampering', () => {
    const ct = encrypt(KEY, 'JBSWY3DPEHPK3PXP');
    expect(ct).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decrypt(KEY, ct)).toBe('JBSWY3DPEHPK3PXP');
    const parts = ct.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(() => decrypt(KEY, parts.join('.'))).toThrow();
  });

  it('hashes IPs deterministically without revealing them', () => {
    expect(hashIp('s', '1.2.3.4')).toBe(hashIp('s', '1.2.3.4'));
    expect(hashIp('s', '1.2.3.4')).not.toContain('1.2.3.4');
    expect(hashIp('s', undefined)).toBeNull();
  });

  it('compares in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
