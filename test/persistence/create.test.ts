import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EventRepository } from "#src/application/event-repository.ts";
import { createEvent } from "#src/domain/create-event.ts";
import type { Event } from "#src/domain/event.ts";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";
import { competitorId, eventId } from "#test/domain/fixtures.ts";
import { resetData, SALZBURG, startTestDatabase, STURM, type TestDatabase } from "#test/persistence/support/database.ts";

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
});

// A new scheduled event of the brief's example, built by the domain.
function newEvent(id: string, externalId = "match-1"): Event {
  const created = createEvent({
    id: eventId(id),
    source: "manual",
    externalId,
    sport: "football",
    startsAt: new Date("2025-07-18T16:30:00Z"),
    home: { id: competitorId(SALZBURG), sport: "football" },
    away: { id: competitorId(STURM), sport: "football" },
  });
  if (!created.ok) {
    throw new Error("the fixture event must be valid");
  }
  return created.value;
}

const FIRST_ID = "0198c5a0-7b1e-7d3a-9c4e-000000000001";
const SECOND_ID = "0198c5a0-7b1e-7d3a-9c4e-000000000002";

async function countEvents(): Promise<number> {
  const rows = await db.selectFrom("events").select("id").execute();
  return rows.length;
}

describe("Create an event (ADR-0003, ADR-0007, ADR-0027)", () => {
  it("stores a new event and returns it with the names of its sport and competitors", async () => {
    const event = newEvent(FIRST_ID);

    expect(await repository.create(event)).toEqual({
      created: true,
      view: { event, sportName: "Football", homeName: "Salzburg", awayName: "Sturm" },
    });
  });

  it("returns the stored event for a repeated create and writes nothing", async () => {
    const first = newEvent(FIRST_ID);
    await repository.create(first);

    const repeated = await repository.create(newEvent(SECOND_ID));

    expect(repeated.created).toBe(false);
    expect(repeated.view.event).toEqual(first);
    expect(await countEvents()).toBe(1);
  });

  it("stores one event when ten identical creates run at the same time", async () => {
    const creates = Array.from({ length: 10 }, (_, index) =>
      repository.create(newEvent(`0198c5a0-7b1e-7d3a-9c4e-0000000000${String(index + 10)}`)),
    );

    const results = await Promise.all(creates);

    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(new Set(results.map((result) => result.view.event.id)).size).toBe(1);
    expect(await countEvents()).toBe(1);
  });
});

describe("Read by ID (ADR-0011)", () => {
  it("finds a stored event by its ID", async () => {
    const event = newEvent(FIRST_ID);
    await repository.create(event);

    const found = await repository.findById(event.id);

    expect(found?.event).toEqual(event);
  });

  it("returns nothing for an unknown ID", async () => {
    expect(await repository.findById(eventId(SECOND_ID))).toBeUndefined();
  });
});

describe("Competitor lookup for create (ADR-0003)", () => {
  it("returns the known competitors with their sport and leaves out unknown IDs", async () => {
    const unknown = competitorId("0198c5a0-ffff-7000-8000-00000000ffff");

    const found = await repository.findCompetitors([competitorId(SALZBURG), unknown]);

    expect(found).toEqual([{ id: SALZBURG, sport: "football" }]);
  });
});
