import type { RedisClientType } from "@redis/client";
import type { Cache } from "#src/application/cache.ts";

export function createRedisCache(client: RedisClientType): Cache {
  return {
    async get(key) {
      return (await client.get(key)) ?? undefined;
    },
    async set(key, value, ttlSeconds) {
      await client.set(key, value, { expiration: { type: "EX", value: ttlSeconds } });
    },
    async delete(key) {
      await client.del(key);
    },
  };
}
