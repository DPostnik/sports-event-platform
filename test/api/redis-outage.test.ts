import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it, vi } from "vitest";
import { readConfiguration } from "#src/config/environment.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { buildService } from "#src/main.ts";
import { manualWriter, writerKeyEnvironment } from "#test/api/writer-keys.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";
import { startTestDatabase } from "#test/persistence/support/database.ts";

describe("Cache outage (ADR-0016)", () => {
  it("continues to write and read current events after Redis stops", async ({ onTestFinished }) => {
    const database = await startTestDatabase();
    onTestFinished(() => database.stop());
    await seed(database.db);

    const redis = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start();
    let redisStopped = false;
    onTestFinished(async () => {
      if (!redisStopped) await redis.stop();
    });
    const app = await buildService(
      readConfiguration({
        DATABASE_URL: database.connectionString,
        WRITER_KEYS: writerKeyEnvironment,
        REDIS_URL: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
      }),
      false,
    );
    onTestFinished(() => app.close());

    const eventUrl = `/events/${EVENT_FIELDS.id}`;
    const listUrl = "/events?sport=football";
    await expect
      .poll(async () => {
        await app.inject(eventUrl);
        await app.inject(listUrl);
        return (await redis.exec(["redis-cli", "DBSIZE"])).output.trim();
      })
      .toBe("2");
    await redis.stop();
    redisStopped = true;

    const started = await app.inject({
      method: "POST",
      url: `${eventUrl}/start`,
      headers: manualWriter.headers,
      payload: { expectedVersion: 1 },
    });
    expect(started.statusCode, started.body).toBe(200);
    const live = { id: EVENT_FIELDS.id, status: "live", version: 2 };
    const event = await app.inject(eventUrl);
    expect(event.statusCode, event.body).toBe(200);
    expect(event.json<unknown>()).toMatchObject({ event: live });
    const page = await app.inject(listUrl);
    expect(page.statusCode, page.body).toBe(200);
    expect(page.json<unknown>()).toMatchObject({ events: [live] });
  });

  it("answers a repeated read from the local cache for the configured lifetime while Redis is down (ADR-0043)", async ({
    onTestFinished,
  }) => {
    const database = await startTestDatabase();
    onTestFinished(() => database.stop());
    await seed(database.db);

    const redis = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start();
    let redisStopped = false;
    onTestFinished(async () => {
      if (!redisStopped) await redis.stop();
    });
    const app = await buildService(
      readConfiguration({
        DATABASE_URL: database.connectionString,
        WRITER_KEYS: writerKeyEnvironment,
        REDIS_URL: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
        LOCAL_CACHE_TTL_SECONDS: "3",
      }),
      false,
    );
    onTestFinished(() => app.close());

    const eventUrl = `/events/${EVENT_FIELDS.id}`;
    await expect
      .poll(async () => {
        await app.inject(eventUrl);
        return (await redis.exec(["redis-cli", "DBSIZE"])).output.trim();
      })
      .toBe("1");
    await redis.stop();
    redisStopped = true;

    // Advance only the service date. Network and container timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const firstReadAt = Date.now() + 60_000;
      vi.setSystemTime(firstReadAt);
      const first = await app.inject(eventUrl);
      expect(first.statusCode, first.body).toBe(200);
      const firstGeneratedAt = first.json<{ generatedAt: string }>().generatedAt;
      expect(firstGeneratedAt).toBe(new Date(firstReadAt).toISOString());

      vi.setSystemTime(firstReadAt + 2000);
      const local = await app.inject(eventUrl);
      expect(local.statusCode, local.body).toBe(200);
      expect(local.json<unknown>()).toMatchObject({ generatedAt: firstGeneratedAt });
      expect(local.headers.age).toBe("2");

      vi.setSystemTime(firstReadAt + 3000);
      const expired = await app.inject(eventUrl);
      expect(expired.statusCode, expired.body).toBe(200);
      expect(expired.json<unknown>()).toMatchObject({ generatedAt: new Date(firstReadAt + 3000).toISOString() });
      expect(expired.headers.age).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });
});
