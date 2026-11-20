import { readConfiguration } from "#src/config/environment.ts";
import { sql } from "kysely";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { z } from "zod";
import { buildService } from "#src/main.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";
import { SALZBURG, STURM, startTestDatabase, type TestDatabase } from "#test/persistence/support/database.ts";
import { expectDocumentedResponse, openApiSchema, type OpenApi } from "#test/api/openapi.ts";

const MISSING_ID = "0198c5a0-0000-7000-8000-000000000099";
const KAC = "0198c5a0-0000-7000-8000-000000000003";
const CAPITALS = "0198c5a0-0000-7000-8000-000000000004";
const football = {
  source: "api-test",
  externalId: "football-salzburg-sturm",
  sport: "football",
  startsAt: "2025-07-18T18:30:00+02:00",
  homeCompetitorId: SALZBURG,
  awayCompetitorId: STURM,
};
const hockey = {
  source: "api-test",
  externalId: "hockey-kac-capitals",
  sport: "ice_hockey",
  startsAt: "2025-10-23T09:45:00+02:00",
  homeCompetitorId: KAC,
  awayCompetitorId: CAPITALS,
};

const eventBodySchema = z.object({
  event: z.looseObject({
    id: z.string(),
    competitors: z.array(z.looseObject({ name: z.string(), role: z.string() })),
  }),
});
const pageBodySchema = z.object({
  events: z.array(z.looseObject({ id: z.string() })),
  nextCursor: z.string().nullable().optional(),
});

describe("Event routes and responses - API-1, API-2, API-3, API-4, API-7, API-9, API-11, API-12, CI-3", () => {
  let database: TestDatabase | undefined;
  let app: Awaited<ReturnType<typeof buildService>> | undefined;
  let openApi: OpenApi;

  beforeAll(async () => {
    database = await startTestDatabase();
    await seed(database.db);
    app = await buildService(readConfiguration({ DATABASE_URL: database.connectionString }), false);
    const response = await app.inject("/openapi.json");
    expect(response.statusCode).toBe(200);
    openApi = openApiSchema.parse(JSON.parse(response.body));
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.stop();
    }
  });

  function runningApp() {
    if (app === undefined) {
      throw new Error("Expected a running HTTP service");
    }
    return app;
  }

  async function request(
    method: "GET" | "POST",
    path: string,
    url: string,
    status: number,
    payload?: object,
  ): Promise<unknown> {
    const response = await runningApp().inject({ method, url, ...(payload === undefined ? {} : { payload }) });
    expect(response.statusCode, response.body).toBe(status);
    await expectDocumentedResponse(openApi, method, path, response);
    return JSON.parse(response.body);
  }

  async function create(externalId: string) {
    return eventBodySchema.parse(await request("POST", "/events", "/events", 201, {
      ...football,
      externalId,
    })).event;
  }

  async function command(id: string, name: string, status: number, payload: object) {
    return request("POST", `/events/{id}/${name}`, `/events/${id}/${name}`, status, payload);
  }

  test.each([
    { payload: football, startsAt: "2025-07-18T16:30:00.000Z", home: "Salzburg", away: "Sturm" },
    { payload: hockey, startsAt: "2025-10-23T07:45:00.000Z", home: "KAC", away: "Capitals" },
  ])("stores and reads the $payload.sport example with UTC time and competitor names", async ({ payload, startsAt, home, away }) => {
    const created = eventBodySchema.parse(await request("POST", "/events", "/events", 201, payload));
    expect(created.event).toMatchObject({ startsAt, status: "scheduled", version: 1 });
    const retrieved = await request("GET", "/events/{id}", `/events/${created.event.id}`, 200);
    expect(retrieved).toMatchObject({ event: created.event });
    expect(created.event.competitors).toMatchObject([
      { name: home, role: "home" },
      { name: away, role: "away" },
    ]);
  });

  test("revalidates a single event against its current version (ADR-0039)", async () => {
    const event = await create("revalidation");
    const url = `/events/${event.id}`;
    const first = await runningApp().inject(url);
    expect(first.headers).toMatchObject({ etag: 'W/"1"', "cache-control": "no-cache", age: "0" });
    const headers = { "if-none-match": 'W/"another,tag", "1"' };
    const unchanged = await runningApp().inject({ url, headers });
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.body).toBe("");
    expect(unchanged.headers.etag).toBe(first.headers.etag);
    expect(openApi.paths["/events/{id}"]?.get?.responses["304"]).toBeDefined();

    await command(event.id, "start", 200, { expectedVersion: 1 });
    const changed = await runningApp().inject({ url, headers });
    expect(changed.statusCode).toBe(200);
    expect(changed.headers.etag).toBe('W/"2"');
  });

  test("revalidates a list page by event versions and its next cursor (ADR-0039)", async () => {
    const url = "/events?from=2030-01-01T00:00:00Z&to=2030-01-02T00:00:00Z&limit=1";
    const firstEvent = eventBodySchema.parse(await request("POST", "/events", "/events", 201, {
      ...football, externalId: "etag-first", startsAt: "2030-01-01T10:00:00Z",
    })).event;
    const first = await runningApp().inject(url);
    const tag = z.string().startsWith('W/"').parse(first.headers.etag);
    const headers = { "if-none-match": tag };
    const unchanged = await runningApp().inject({ url, headers });
    expect(unchanged.statusCode).toBe(304);
    expect(unchanged.body).toBe("");
    expect(unchanged.headers).toMatchObject({ etag: tag, "cache-control": "max-age=60", age: "0" });

    // Only nextCursor changes on the first page when a second page appears.
    await request("POST", "/events", "/events", 201, {
      ...football, externalId: "etag-second", startsAt: "2030-01-01T11:00:00Z",
    });
    const paged = await runningApp().inject({ url, headers });
    expect(paged.statusCode).toBe(200);
    expect(paged.json<unknown>()).toMatchObject({ events: [firstEvent] });
    const pageTag = z.string().parse(paged.headers.etag);
    expect(pageTag).not.toBe(tag);

    await command(firstEvent.id, "start", 200, { expectedVersion: 1 });
    const updated = await runningApp().inject({ url, headers: { "if-none-match": pageTag } });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers.etag).not.toBe(pageTag);
  });

  test("repeats return the stored event when the new payload differs (ADR-0038)", async () => {
    const event = await create("repeat");
    const repeated = await request("POST", "/events", "/events", 200, {
      ...football,
      externalId: "repeat",
      startsAt: "2026-07-18T18:30:00Z",
      homeCompetitorId: MISSING_ID,
    });
    expect(repeated).toMatchObject({ event });
  });

  test("pages matching events without repeating the cursor event (ADR-0011, ADR-0012, ADR-0029)", async () => {
    await create("page-one");
    await create("page-two");
    const filters = new URLSearchParams({
      sport: "football",
      status: "scheduled",
      competitor: SALZBURG,
      from: "2025-07-18T16:30:00Z",
      to: "2025-07-18T16:30:01Z",
    });
    const first = pageBodySchema.parse(await request("GET", "/events", `/events?${filters.toString()}&limit=1`, 200));
    expect(first.events).toHaveLength(1);
    if (!first.nextCursor) {
      throw new Error("Expected a cursor after the first page");
    }
    filters.set("cursor", first.nextCursor);
    const second = pageBodySchema.parse(await request("GET", "/events", `/events?${filters.toString()}&limit=2`, 200));
    expect(second.events).toHaveLength(2);
    expect(second.events.map((event) => event.id)).not.toContain(first.events[0]?.id);
    for (const event of second.events) {
      expect(event).toMatchObject({ status: "scheduled", startsAt: "2025-07-18T16:30:00.000Z" });
    }
  });

  test("starts an event, changes its phase and finishes it (ADR-0010)", async () => {
    const { id } = await create("live");
    expect(await command(id, "start", 200, { expectedVersion: 1, phase: "1st_half" }))
      .toMatchObject({ event: { status: "live", phase: "1st_half", version: 2 } });
    expect(await command(id, "phase", 200, { expectedVersion: 2, phase: "2nd_half" }))
      .toMatchObject({ event: { status: "live", phase: "2nd_half", version: 3 } });
    expect(await command(id, "finish", 200, { expectedVersion: 3 }))
      .toMatchObject({ event: { status: "finished", version: 4 } });
  });

  test("postpones, reschedules and cancels an event (ADR-0010)", async () => {
    const { id } = await create("cancel");
    expect(await command(id, "postpone", 200, { expectedVersion: 1 }))
      .toMatchObject({ event: { status: "postponed", version: 2 } });
    expect(await command(id, "reschedule", 200, { expectedVersion: 2, startsAt: "2025-07-20T19:00:00Z" }))
      .toMatchObject({ event: { status: "scheduled", version: 3, startsAt: "2025-07-20T19:00:00.000Z" } });
    expect(await command(id, "cancel", 200, { expectedVersion: 3 }))
      .toMatchObject({ event: { status: "cancelled", version: 4 } });
  });

  test("rejects a start time without a zone with a field error (ADR-0005, ADR-0037)", async () => {
    expect(await request("POST", "/events", "/events", 400, { ...football, startsAt: "2025-07-18T18:30:00" }))
      .toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "startsAt" }] });
  });

  test.each(["0", "101", "1.5", "abc"])("rejects the invalid list limit %s (ADR-0029)", async (limit) => {
    expect(await request("GET", "/events", `/events?limit=${limit}`, 400))
      .toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "limit" }] });
  });

  test("rejects a cursor with an invalid position (ADR-0012)", async () => {
    expect(await request("GET", "/events", "/events?cursor=invalid", 400))
      .toMatchObject({ code: "VALIDATION_FAILED", errors: [{ field: "cursor" }] });
  });

  test("reports a missing event as NOT_FOUND (ADR-0037)", async () => {
    expect(await request("GET", "/events/{id}", `/events/${MISSING_ID}`, 404))
      .toMatchObject({ code: "NOT_FOUND" });
  });

  test("returns a conflict with the stored version when two commands race (ADR-0009)", async () => {
    const { id } = await create("version");
    const sendStart = () => runningApp().inject({
      method: "POST",
      url: `/events/${id}/start`,
      payload: { expectedVersion: 1 },
    });
    const outcomes = await Promise.all([sendStart(), sendStart()]);
    expect(outcomes.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    for (const response of outcomes) {
      await expectDocumentedResponse(openApi, "POST", "/events/{id}/start", response);
      if (response.statusCode === 409) {
        expect(JSON.parse(response.body)).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 2 });
      }
    }
  });

  test("reports the stored status when a transition is refused (ADR-0037)", async () => {
    const { id } = await create("transition");
    expect(await command(id, "finish", 409, { expectedVersion: 1 }))
      .toMatchObject({ code: "TRANSITION_NOT_ALLOWED", currentStatus: "scheduled" });
  });

  test("identifies a phase from another sport (ADR-0037)", async () => {
    const { id } = await create("phase");
    expect(await command(id, "start", 422, { expectedVersion: 1, phase: "3rd_period" }))
      .toMatchObject({ code: "INVALID_PHASE", sport: "football", phase: "3rd_period" });
  });

  test.each([
    { code: "SAME_COMPETITOR", members: { competitorId: SALZBURG } },
    {
      code: "COMPETITOR_SPORT_MISMATCH",
      members: { competitorId: KAC, competitorSport: "ice_hockey", eventSport: "football" },
    },
    { code: "COMPETITOR_NOT_FOUND", members: { competitorId: MISSING_ID } },
  ])("reports $code for a well-formed create (ADR-0037)", async ({ code, members }) => {
    expect(await request("POST", "/events", "/events", 422, {
      ...football,
      externalId: code,
      awayCompetitorId: members.competitorId,
    })).toMatchObject({ code, ...members });
  });

  test("returns a generic problem when a query fails unexpectedly (ADR-0018)", async () => {
    if (database === undefined) {
      throw new Error("Expected a running test database");
    }
    await sql`ALTER TABLE events RENAME TO unavailable_events`.execute(database.db);
    try {
      const body = await request("GET", "/events", "/events", 500);
      expect(z.object({ code: z.literal("INTERNAL"), requestId: z.string().min(1) }).safeParse(body).success)
        .toBe(true);
      expect(JSON.stringify(body)).not.toMatch(/relation|does not exist|unavailable_events/);
    } finally {
      await sql`ALTER TABLE unavailable_events RENAME TO events`.execute(database.db);
    }
  });

  test("reports readiness when PostgreSQL responds", async () => {
    expect(await request("GET", "/ready", "/ready", 200)).toEqual({ status: "ok" });
  });

  test("stays live and reports unavailable readiness when PostgreSQL refuses the connection (ADR-0018)", async () => {
    if (database === undefined) {
      throw new Error("Expected a running test database");
    }
    const connection = new URL(database.connectionString);
    connection.password = "wrong-password";
    const unavailable = await buildService(readConfiguration({ DATABASE_URL: connection.href }), false);
    try {
      const health = await unavailable.inject("/health");
      expect(health.statusCode).toBe(200);
      await expectDocumentedResponse(openApi, "GET", "/health", health);
      expect(JSON.parse(health.body)).toEqual({ status: "ok" });

      const response = await unavailable.inject("/ready");
      expect(response.statusCode).toBe(503);
      expect(response.headers["retry-after"]).toBe("5");
      await expectDocumentedResponse(openApi, "GET", "/ready", response);
      expect(JSON.parse(response.body)).toMatchObject({ code: "UNAVAILABLE" });
    } finally {
      await unavailable.close();
    }
  });
});
