import type { Rng } from './schema.js';

const WORDS: Record<'product' | 'person' | 'city' | 'noun', readonly string[]> = {
  product: [
    'lamp',
    'kettle',
    'router',
    'chair',
    'backpack',
    'monitor',
    'keyboard',
    'mug',
    'drill',
    'tent',
    'scarf',
    'camera',
  ],
  person: [
    'Ana',
    'Bogdan',
    'Chen',
    'Dara',
    'Elif',
    'Farah',
    'Goran',
    'Hana',
    'Ioana',
    'Jonas',
    'Kofi',
    'Lena',
    'Mihai',
    'Nia',
  ],
  city: [
    'Cluj',
    'Lisbon',
    'Oslo',
    'Porto',
    'Riga',
    'Sofia',
    'Tallinn',
    'Vienna',
    'Warsaw',
    'Zagreb',
    'Iasi',
    'Ghent',
  ],
  noun: [
    'order',
    'ticket',
    'parcel',
    'invoice',
    'booking',
    'shipment',
    'request',
    'reading',
    'batch',
    'entry',
  ],
};

/** Hashes any string or number to a 32-bit seed (FNV-1a). */
export function seedFrom(value: string | number): number {
  const s = String(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic PRNG (sfc32). Same seed, same sequence, on every platform — the validator relies
 * on this to check generators are deterministic.
 */
export function createRng(seed: number): Rng {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();

  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) throw new Error(`rng.int: max < min (${min}, ${max})`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    sample(items, n) {
      return rng.shuffle(items).slice(0, n);
    },
    bool(p = 0.5) {
      return next() < p;
    },
    word(kind) {
      return rng.pick(WORDS[kind]);
    },
    hex(bytes) {
      let s = '';
      for (let i = 0; i < bytes; i++)
        s += Math.floor(next() * 256)
          .toString(16)
          .padStart(2, '0');
      return s;
    },
  };
  return rng;
}
