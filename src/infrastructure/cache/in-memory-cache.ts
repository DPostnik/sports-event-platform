import type { Cache } from "#src/application/cache.ts";
import type { Clock } from "#src/application/clock.ts";

export function createInMemoryCache(clock: Clock): Cache {
  const entries = new Map<string, { value: string; expiresAt: number }>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (entry === undefined) return Promise.resolve(undefined);
      if (entry.expiresAt <= clock.now().getTime()) {
        entries.delete(key);
        return Promise.resolve(undefined);
      }
      return Promise.resolve(entry.value);
    },
    set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: clock.now().getTime() + ttlSeconds * 1000 });
      return Promise.resolve();
    },
    delete(key) {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}
