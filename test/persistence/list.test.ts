import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EventCursor, EventFilters, EventRepository } from "#src/application/event-repository.ts";
import type { Event, EventStatus } from "#src/domain/event.ts";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";
import { competitorId, eventId } from "#test/domain/fixtures.ts";
import { resetData, SALZBURG, startTestDatabase, STURM, type TestDatabase } from "#test/persistence/support/database.ts";

const KAC = "0198c5a0-0000-7000-8000-000000000003";
const CAPITALS = "0198c5a0-0000-7000-8000-000000000004";

function event(
  number: number,
  sport: string,
  home: string,
  away: string,
  startsAt: string,
  status: EventStatus = "scheduled",
): Event {
  return {
    id: eventId(`0198c5a0-7b1e-7d3a-9c4e-00000000000${String(number)}`),
    source: "manual",
    externalId: `match-${String(number)}`,
    sport,
    startsAt: new Date(startsAt),
    homeCompetitorId: competitorId(home),
    awayCompetitorId: competitorId(away),
    status,
    version: 1,
  };
}

// The names are in list order. A, B and C start at the same time, so only
// their IDs put them in order.
const A = event(1, "football", SALZBURG, STURM, "2025-07-18T16:30:00Z", "live");
const B = event(2, "football", STURM, SALZBURG, "2025-07-18T16:30:00Z");
const C = event(3, "ice_hockey", KAC, CAPITALS, "2025-07-18T16:30:00Z");
const D = event(4, "football", SALZBURG, STURM, "2025-07-19T10:00:00Z", "postponed");
const E = event(5, "ice_hockey", CAPITALS, KAC, "2025-07-20T18:00:00Z");

let testDatabase: TestDatabase | undefined;
let db: Kysely<Database>;
let repository: EventRepository;

beforeAll(async () => {
  testDatabase = await startTestDatabase();
  db = testDatabase.db;
  repository = createEventRepository(db);
});

afterAll(async () => {
  await testDatabase?.stop();
});

beforeEach(async () => {
  await resetData(db);
  await sql`INSERT INTO sports (code, name) VALUES ('ice_hockey', 'Ice Hockey')`.execute(db);
  await sql`
    INSERT INTO competitors (id, sport_code, name)
    VALUES (${KAC}, 'ice_hockey', 'KAC'), (${CAPITALS}, 'ice_hockey', 'Capitals')
  `.execute(db);
  // Stored in reverse, so the order of a list cannot come from the order of the writes.
  for (const stored of [E, D, C, B, A]) {
    await repository.create(stored);
  }
});

async function listEvents(
  filters: EventFilters,
  cursor?: EventCursor,
  limit = 50,
): Promise<readonly Event[]> {
  const page = await repository.list(filters, cursor, limit);
  return page.views.map((view) => view.event);
}

describe("List order and filters (ADR-0011)", () => {
  it("returns the events ordered by start time, then by ID", async () => {
    expect(await listEvents({})).toEqual([A, B, C, D, E]);
  });

  it("filters by sport", async () => {
    expect(await listEvents({ sport: "ice_hockey" })).toEqual([C, E]);
  });

  it("filters by status", async () => {
    expect(await listEvents({ status: "live" })).toEqual([A]);
  });

  it("filters by competitor, home or away", async () => {
    expect(await listEvents({ competitorId: competitorId(KAC) })).toEqual([C, E]);
  });

  it("includes the start of the time window and excludes its end", async () => {
    expect(await listEvents({ from: D.startsAt, to: E.startsAt })).toEqual([D]);
  });

  it("returns only the events that match every filter", async () => {
    const filters: EventFilters = {
      sport: "football",
      status: "scheduled",
      competitorId: competitorId(STURM),
      from: new Date("2025-07-18T00:00:00Z"),
      to: new Date("2025-07-19T00:00:00Z"),
    };

    expect(await listEvents(filters)).toEqual([B]);
  });

  it("keeps a postponed event in the time window of its last scheduled start", async () => {
    const day = { from: new Date("2025-07-19T00:00:00Z"), to: new Date("2025-07-20T00:00:00Z") };

    expect(await listEvents(day)).toEqual([D]);
  });
});

describe("Cursor pagination (ADR-0012, ADR-0029)", () => {
  it("returns every event once, page by page, when events share a start time", async () => {
    const pages: (readonly Event[])[] = [];
    let cursor: EventCursor | undefined;
    do {
      const page = await repository.list({}, cursor, 2);
      pages.push(page.views.map((view) => view.event));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(pages).toEqual([[A, B], [C, D], [E]]);
  });

  it("gives no next cursor when the last page is exactly full", async () => {
    const page = await repository.list({}, undefined, 5);

    expect(page.views).toHaveLength(5);
    expect(page.nextCursor).toBeUndefined();
  });

  it("neither repeats nor skips an event when events are added between two pages", async () => {
    const first = await repository.list({}, undefined, 2);
    const before = event(6, "football", SALZBURG, STURM, "2025-07-17T09:00:00Z");
    const after = event(7, "football", SALZBURG, STURM, "2025-07-22T09:00:00Z");
    await repository.create(before);
    await repository.create(after);

    expect(await listEvents({}, first.nextCursor)).toEqual([C, D, E, after]);
  });

  it("continues from the cursor when the limit changes between two pages", async () => {
    const first = await repository.list({}, undefined, 2);

    expect(await listEvents({}, first.nextCursor, 3)).toEqual([C, D, E]);
  });
});
