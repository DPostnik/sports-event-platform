import { createClient, type RedisClientOptions } from "@redis/client";
import { GenericContainer, Wait } from "testcontainers";
import { expect, it } from "vitest";
import { createRedisCache } from "#src/infrastructure/cache/redis-cache.ts";

it("shares expiring entries and their deletion across clients (ADR-0015)", async () => {
  const container = await new GenericContainer("redis:7-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  const socket: RedisClientOptions["socket"] = {
    host: container.getHost(),
    port: container.getMappedPort(6379),
    reconnectStrategy: false,
  };
  const writer = createClient({ socket });
  const reader = createClient({ socket });
  try {
    await writer.connect();
    await reader.connect();
    const first = createRedisCache(writer);
    const second = createRedisCache(reader);
    await first.set("event:1", "scheduled", 3600);
    expect(await second.get("event:1")).toBe("scheduled");
    const remaining = await reader.ttl("event:1");
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(3600);
    await first.delete("event:1");
    expect(await second.get("event:1")).toBeUndefined();
  } finally {
    if (reader.isOpen) reader.destroy();
    if (writer.isOpen) writer.destroy();
    await container.stop();
  }
});
