import { sql } from "kysely";
import { GenericContainer, Wait } from "testcontainers";
import { describe, expect, it } from "vitest";
import { readConfiguration } from "#src/config/environment.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { buildService } from "#src/main.ts";
import { startTestDatabase } from "#test/persistence/support/database.ts";

describe("Single event cache across API instances (ADR-0014, ADR-0015)", () => {
  it("serves a shared entry until a successful command invalidates it", async ({ onTestFinished }) => {
    const database = await startTestDatabase();
    onTestFinished(() => database.stop());
    await seed(database.db);
    const redis = await new GenericContainer("redis:7-alpine")
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
      .start();
    onTestFinished(async () => { await redis.stop(); });
    const config = readConfiguration({
      DATABASE_URL: database.connectionString,
      REDIS_URL: `redis://${redis.getHost()}:${String(redis.getMappedPort(6379))}`,
    });
    const writer = await buildService(config, false);
    onTestFinished(() => writer.close());
    const reader = await buildService(config, false);
    onTestFinished(() => reader.close());
    const id = "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90";
    const url = `/events/${id}`;

    // The API connects to Redis in the background.
    await expect.poll(async () => {
      await writer.inject(url);
      const result = await redis.exec(["redis-cli", "EXISTS", `event:${id}`]);
      return result.output.trim();
    }).toBe("1");

    await database.db.transaction().execute(async (trx) => {
      await sql`LOCK TABLE events IN ACCESS EXCLUSIVE MODE`.execute(trx);
      const shared = await reader.inject(url);
      expect(shared.statusCode).toBe(200);
      expect(shared.headers.etag).toBe('W/"1"');
    });

    const command = await writer.inject({
      method: "POST", url: `${url}/start`, payload: { expectedVersion: 1 },
    });
    expect(command.statusCode).toBe(200);
    const updated = await reader.inject({ url, headers: { "if-none-match": 'W/"1"' } });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).toBe('W/"2"');
    expect(updated.json<unknown>()).toMatchObject({ event: { status: "live", version: 2 } });
  });
});
