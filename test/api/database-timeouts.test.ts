import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readConfiguration } from "#src/config/environment.ts";
import { buildService } from "#src/main.ts";
import { startTestDatabase } from "#test/persistence/support/database.ts";

describe("Database time limits and Retry-After (ADR-0040)", () => {
  it("distinguishes waiting for the pool from waiting for a SQL statement", async () => {
    const database = await startTestDatabase();
    try {
      const config = readConfiguration({
        DATABASE_URL: database.connectionString,
        DB_POOL_SIZE: "1",
        DB_POOL_WAIT_MS: "200",
        DB_STATEMENT_TIMEOUT_MS: "1500",
        OVERLOADED_RETRY_AFTER_SECONDS: "2",
        UNAVAILABLE_RETRY_AFTER_SECONDS: "7",
      });
      const app = await buildService(config, false);
      try {
        expect((await app.inject("/ready")).statusCode).toBe(200);
        await database.db.transaction().execute(async (trx) => {
          // One read holds the API connection at this lock; the other waits for the pool.
          await sql`LOCK TABLE events IN ACCESS EXCLUSIVE MODE`.execute(trx);
          const responses = await Promise.all([
            app.inject("/events?sport=football"),
            app.inject("/events?sport=ice_hockey"),
          ]);
          const outcomes = responses.map((response) => ({
            status: response.statusCode,
            code: z.object({ code: z.string() }).parse(response.json<unknown>()).code,
            retryAfter: response.headers["retry-after"],
          }));
          expect(outcomes.sort((left, right) => left.code.localeCompare(right.code))).toEqual([
            { status: 503, code: "OVERLOADED", retryAfter: "2" },
            { status: 503, code: "UNAVAILABLE", retryAfter: "7" },
          ]);
        });
        expect((await app.inject("/events?sport=football")).statusCode).toBe(200);
      } finally {
        await app.close();
      }
    } finally {
      await database.stop();
    }
  });
});
