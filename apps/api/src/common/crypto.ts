import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(
  secret: string,
  value: string,
  encoding: 'hex' | 'base64url' = 'base64url',
): string {
  return createHmac('sha256', secret).update(value).digest(encoding);
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** One-way, keyed hash of an IP address: enough to correlate abuse, not to identify anyone. */
export function hashIp(secret: string, ip: string | undefined): string | null {
  return ip ? hmac(secret, `ip:${ip}`, 'hex').slice(0, 32) : null;
}

/** AES-256-GCM. Output: base64url(iv).base64url(tag).base64url(ciphertext). */
export function encrypt(keyB64: string, plaintext: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(keyB64: string, payload: string): string {
  const key = Buffer.from(keyB64, 'base64');
  const [iv, tag, ct] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !ct) throw new Error('Malformed ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
