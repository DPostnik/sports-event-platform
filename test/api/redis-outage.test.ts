import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it } from "vitest";
import { readConfiguration } from "#src/config/environment.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { buildService } from "#src/main.ts";
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
    const app = await buildService(readConfiguration({
      DATABASE_URL: database.connectionString,
      REDIS_URL: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
    }), false);
    onTestFinished(() => app.close());

    const eventUrl = `/events/${EVENT_FIELDS.id}`;
    const listUrl = "/events?sport=football";
    await expect.poll(async () => {
      await app.inject(eventUrl);
      await app.inject(listUrl);
      return (await redis.exec(["redis-cli", "DBSIZE"])).output.trim();
    }).toBe("2");
    await redis.stop();
    redisStopped = true;

    const started = await app.inject({
      method: "POST", url: `${eventUrl}/start`, payload: { expectedVersion: 1 },
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
});
