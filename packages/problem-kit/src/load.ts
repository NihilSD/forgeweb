import { createRng, seedFrom } from './rng.js';
import type { Instance, PackageModule, TestSuite } from './schema.js';

const cache = new Map<string, Promise<PackageModule>>();

/**
 * Loads a bundled package module. Package code is trusted content (reviewed in git, validated in
 * CI); user code never goes through here.
 */
export function loadModule(code: string, hash: string): Promise<PackageModule> {
  let mod = cache.get(hash);
  if (!mod) {
    mod = import(
      `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
    ) as Promise<PackageModule>;
    cache.set(hash, mod);
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  return mod;
}

export interface GeneratedInstance {
  seed: number;
  instance: Instance;
  suite: TestSuite;
}

export function generateInstance(
  mod: PackageModule,
  seed: number,
  flag?: string,
): GeneratedInstance {
  const instance = mod.generate({ rng: createRng(seed), seed, ...(flag ? { flag } : {}) });
  const suite = mod.tests
    ? mod.tests(instance, { rng: createRng(seedFrom(`tests:${seed}`)), seed })
    : { visible: [], hidden: [] };
  return { seed, instance, suite };
}
