import type { InstanceFile } from './schema.js';

/** Text form of a challenge file, for scanning (base64 files are decoded as latin1). */
export function fileText(f: InstanceFile): string {
  return typeof f === 'string' ? f : Buffer.from(f.base64, 'base64').toString('latin1');
}
