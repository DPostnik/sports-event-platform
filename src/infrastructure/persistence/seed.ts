import type { Kysely } from "kysely";
import { createEvent } from "#src/domain/create-event.ts";
import type { Event } from "#src/domain/event.ts";
import { parseCompetitorId, parseEventId } from "#src/domain/ids.ts";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";

// ADR-0027: sports and competitors are reference data. The API does not
// create them, so the seed does. The IDs are fixed: the README lists them, and
// a second run finds the same rows and writes nothing.

interface SeedCompetitor {
  readonly id: string;
  readonly sport_code: string;
  readonly name: string;
}

const SALZBURG = { id: "0198c5a0-0000-7000-8000-000000000001", sport_code: "football", name: "Salzburg" };
const STURM = { id: "0198c5a0-0000-7000-8000-000000000002", sport_code: "football", name: "Sturm" };
const KAC = { id: "0198c5a0-0000-7000-8000-000000000003", sport_code: "ice_hockey", name: "KAC" };
const CAPITALS = { id: "0198c5a0-0000-7000-8000-000000000004", sport_code: "ice_hockey", name: "Capitals" };

// Built by the domain, so a seed event passes the same checks as an event of
// the API. A failure here is a mistake in this file.
function exampleEvent(
  id: string,
  externalId: string,
  startsAt: string,
  home: SeedCompetitor,
  away: SeedCompetitor,
): Event {
  const eventId = parseEventId(id);
  const homeId = parseCompetitorId(home.id);
  const awayId = parseCompetitorId(away.id);
  if (!eventId.ok || !homeId.ok || !awayId.ok) {
    throw new Error(`a seed ID is not a UUID: ${externalId}`);
  }
  const created = createEvent({
    id: eventId.value,
    source: "manual",
    externalId,
    sport: home.sport_code,
    startsAt: new Date(startsAt),
    home: { id: homeId.value, sport: home.sport_code },
    away: { id: awayId.value, sport: away.sport_code },
  });
  if (!created.ok) {
    throw new Error(`a seed event is not valid: ${externalId}: ${created.error.kind}`);
  }
  return created.value;
}

// The brief gives the two example events as local times without a zone
// (ADR-0005). They are read as time in Austria, which is UTC+2 on both dates:
//   2025-07-18 18:30 = 2025-07-18T16:30:00Z
//   2025-10-23 09:45 = 2025-10-23T07:45:00Z
const EXAMPLE_EVENTS = [
  exampleEvent(
    "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
    "seed-football-salzburg-sturm",
    "2025-07-18T16:30:00Z",
    SALZBURG,
    STURM,
  ),
  exampleEvent(
    "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e91",
    "seed-ice-hockey-kac-capitals",
    "2025-10-23T07:45:00Z",
    KAC,
    CAPITALS,
  ),
];

export async function seed(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("sports")
    .values([
      { code: "football", name: "Football" },
      { code: "ice_hockey", name: "Ice Hockey" },
    ])
    .onConflict((conflict) => conflict.column("code").doNothing())
    .execute();

  await db
    .insertInto("competitors")
    .values([SALZBURG, STURM, KAC, CAPITALS])
    .onConflict((conflict) => conflict.column("id").doNothing())
    .execute();

  // The create of the repository is idempotent (ADR-0007), so a second run
  // finds the stored events.
  const repository = createEventRepository(db);
  for (const event of EXAMPLE_EVENTS) {
    await repository.create(event);
  }
}
