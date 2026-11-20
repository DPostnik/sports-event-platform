import type { Cache } from "#src/application/cache.ts";

export function createFallbackCache(
  primary: Cache,
  local: Cache,
  localTtlSeconds: number,
  onPrimaryFailure: (error: unknown) => void,
): Cache {
  return {
    async get(key) {
      try {
        return await primary.get(key);
      } catch (error) {
        onPrimaryFailure(error);
        return local.get(key);
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await primary.set(key, value, ttlSeconds);
      } catch (error) {
        onPrimaryFailure(error);
        await local.set(key, value, Math.min(ttlSeconds, localTtlSeconds));
      }
    },
    async delete(key) {
      // The local copy goes first so that a failing primary cannot leave a stale entry behind.
      await local.delete(key);
      await primary.delete(key);
    },
  };
}
