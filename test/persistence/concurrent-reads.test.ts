import { describe, expect, it } from "vitest";
import { EventUseCases } from "#src/application/event-use-cases.ts";
import { buildApp } from "#src/http/app.ts";
import { databaseFailure } from "#src/infrastructure/persistence/database-failure.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";
import { startTestDatabase } from "#test/persistence/support/database.ts";

describe("Concurrent reads without a shared cache (ADR-0016)", () => {
  it("reads PostgreSQL once per key when requests for an event and a page overlap", async ({ onTestFinished }) => {
    const database = await startTestDatabase();
    onTestFinished(() => database.stop());
    await seed(database.db);

    let reads = 0;
    const db = database.db.withPlugin({
      transformQuery: ({ node }) => node,
      transformResult({ result }) {
        reads++;
        return Promise.resolve(result);
      },
    });
    const app = await buildApp({
      events: new EventUseCases(createEventRepository(db), { next: () => EVENT_FIELDS.id }),
      cache: undefined,
      clock: { now: () => new Date() },
      checkReadiness: () => Promise.resolve(),
      databaseFailure,
      retryAfterSeconds: { OVERLOADED: 1, UNAVAILABLE: 5 },
    });
    onTestFinished(() => app.close());

    const eventUrl = `/events/${EVENT_FIELDS.id}`;
    const pageUrl = "/events?limit=1";
    const urls = Array.from({ length: 10 }, () => [eventUrl, pageUrl]).flat();
    // Release all requests together so the first read cannot finish before the burst arrives.
    const waiting: Array<() => void> = [];
    app.addHook("onRequest", (_request, _reply, done) => {
      waiting.push(done);
      if (waiting.length === urls.length) {
        for (const resume of waiting) resume();
      }
    });
    const responses = await Promise.all(urls.map((url) => app.inject(url)));
    for (const response of responses) {
      expect(response.statusCode, response.body).toBe(200);
    }
    expect(responses[0]?.json<unknown>()).toMatchObject({ event: { id: EVENT_FIELDS.id } });
    expect(responses[1]?.json<unknown>()).toMatchObject({ events: [{ id: EVENT_FIELDS.id }] });
    expect(reads).toBe(2);
  });
});
