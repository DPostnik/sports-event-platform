import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it, vi } from "vitest";
import { readConfiguration } from "#src/config/environment.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { buildService } from "#src/main.ts";
import { manualWriter, writerKeyEnvironment } from "#test/api/writer-keys.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";
import { startTestDatabase } from "#test/persistence/support/database.ts";

describe("Cached reads during a database outage (ADR-0016, ADR-0040)", () => {
  it("serves event and list copies until the one-hour limit after PostgreSQL stops", async ({ onTestFinished }) => {
    const database = await startTestDatabase();
    let stopping: Promise<void> | undefined;
    const stopDatabase = () => stopping ??= database.stop();
    onTestFinished(stopDatabase);
    await seed(database.db);

    const redis = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start();
    onTestFinished(async () => { await redis.stop(); });
    const app = await buildService(readConfiguration({
      DATABASE_URL: database.connectionString,
      WRITER_KEYS: writerKeyEnvironment,
      REDIS_URL: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
    }), false);
    onTestFinished(() => app.close());

    const eventUrl = `/events/${EVENT_FIELDS.id}`;
    const urls = [eventUrl, "/events?limit=1"];
    await expect.poll(async () => {
      for (const url of urls) await app.inject(url);
      return (await redis.exec(["redis-cli", "DBSIZE"])).output.trim();
    }).toBe("2");

    // Advance only the service date. Network and container timers keep running.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const refreshedAt = Date.now() + 60_000;
      vi.setSystemTime(refreshedAt);
      const refreshed = await Promise.all(urls.map((url) => app.inject(url)));
      for (const response of refreshed) {
        expect(response.statusCode).toBe(200);
        expect(response.json<unknown>()).toMatchObject({ generatedAt: new Date(refreshedAt).toISOString() });
      }

      await stopDatabase();
      for (const age of [59, 60, 3599]) {
        vi.setSystemTime(refreshedAt + age * 1000);
        for (const [index, url] of urls.entries()) {
          const response = await app.inject(url);
          expect(response.statusCode).toBe(200);
          expect(response.headers.age).toBe(String(age));
          expect(response.body).toBe(refreshed[index]?.body);
        }
      }

      const miss = await app.inject("/events?limit=2");
      expect(miss.statusCode).toBe(503);
      expect(miss.json<unknown>()).toMatchObject({ code: "UNAVAILABLE" });
      const write = await app.inject({
        method: "POST", url: `${eventUrl}/start`, headers: manualWriter.headers, payload: { expectedVersion: 1 },
      });
      expect(write.statusCode).toBe(503);
      expect(write.json<unknown>()).toMatchObject({ code: "UNAVAILABLE" });

      vi.setSystemTime(refreshedAt + 3_600_000);
      for (const url of urls) {
        const expired = await app.inject(url);
        expect(expired.statusCode).toBe(503);
        expect(expired.json<unknown>()).toMatchObject({ code: "UNAVAILABLE" });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
