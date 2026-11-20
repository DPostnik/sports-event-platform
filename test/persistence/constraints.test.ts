import { sql, type Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import {
  resetData,
  SALZBURG,
  startTestDatabase,
  STURM,
  type TestDatabase,
} from "#test/persistence/support/database.ts";

// PER-2: the database rejects bad data by itself. Each test writes one bad
// row with plain SQL and names the constraint that must refuse it.

const EVENT = "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90";
const UNKNOWN = "0198c5a0-ffff-7000-8000-00000000ffff";
const KAC = "0198c5a0-0000-7000-8000-000000000003";

let testDatabase: TestDatabase | undefined;
let db: Kysely<Database>;

beforeAll(async () => {
  testDatabase = await startTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase?.stop();
});

// Every test starts with one sport and two competitors.
beforeEach(async () => {
  await resetData(db);
});

const VALID_EVENT = {
  id: EVENT,
  source: "manual",
  externalId: "match-1",
  sportCode: "football",
  status: "scheduled",
  phase: null as string | null,
  version: 1,
};

function insertEvent(changes: Partial<typeof VALID_EVENT> = {}): Promise<unknown> {
  const row = { ...VALID_EVENT, ...changes };
  return sql`
    INSERT INTO events (id, source, external_id, sport_code, start_time, status, phase, version)
    VALUES (${row.id}, ${row.source}, ${row.externalId}, ${row.sportCode},
            '2025-07-18T16:30:00Z', ${row.status}, ${row.phase}, ${row.version})
  `.execute(db);
}

function insertLink(competitorId: string, role: string, eventId = EVENT, sportCode = "football"): Promise<unknown> {
  return sql`
    INSERT INTO event_competitors (event_id, competitor_id, sport_code, role)
    VALUES (${eventId}, ${competitorId}, ${sportCode}, ${role})
  `.execute(db);
}

async function expectRefusedBy(write: Promise<unknown>, constraint: string): Promise<void> {
  await expect(write).rejects.toMatchObject({ constraint });
}

describe("Schema accepts valid data (ADR-0003)", () => {
  it("stores an event with one home and one away competitor", async () => {
    await insertEvent();
    await insertLink(SALZBURG, "home");
    await insertLink(STURM, "away");

    const { rows } = await sql<{ count: string }>`
      SELECT count(*) AS count FROM event_competitors WHERE event_id = ${EVENT}
    `.execute(db);
    expect(rows[0]?.count).toBe("2");
  });
});

describe("Constraints of sports and competitors (ADR-0003, PER-2)", () => {
  it("refuses a sport code in the wrong format", async () => {
    await expectRefusedBy(
      sql`INSERT INTO sports (code, name) VALUES ('Ice Hockey', 'Ice hockey')`.execute(db),
      "sports_code_format_check",
    );
  });

  it("refuses a sport without a name", async () => {
    await expectRefusedBy(sql`INSERT INTO sports (code, name) VALUES ('tennis', '')`.execute(db), "sports_name_check");
  });

  it("refuses a competitor of an unknown sport", async () => {
    await expectRefusedBy(
      sql`INSERT INTO competitors (id, sport_code, name) VALUES (${UNKNOWN}, 'tennis', 'A')`.execute(db),
      "competitors_sport_code_fkey",
    );
  });

  it("refuses a competitor without a name", async () => {
    await expectRefusedBy(
      sql`INSERT INTO competitors (id, sport_code, name) VALUES (${UNKNOWN}, 'football', '')`.execute(db),
      "competitors_name_check",
    );
  });
});

describe("Constraints of events (ADR-0002, ADR-0004, ADR-0007, ADR-0009, PER-2)", () => {
  it("refuses a source in the wrong format", async () => {
    await expectRefusedBy(insertEvent({ source: "Not A Source" }), "events_source_format_check");
  });

  it("refuses an empty external ID", async () => {
    await expectRefusedBy(insertEvent({ externalId: "" }), "events_external_id_check");
  });

  it("refuses an unknown sport", async () => {
    await expectRefusedBy(insertEvent({ sportCode: "tennis" }), "events_sport_code_fkey");
  });

  it("refuses a status outside the five statuses", async () => {
    await expectRefusedBy(insertEvent({ status: "suspended" }), "events_status_check");
  });

  it("refuses a version below 1", async () => {
    await expectRefusedBy(insertEvent({ version: 0 }), "events_version_check");
  });

  it("refuses a phase on an event that is not live", async () => {
    await expectRefusedBy(insertEvent({ status: "finished", phase: "2nd_half" }), "events_phase_only_when_live_check");
  });

  it("refuses a second event with the same source and external ID", async () => {
    await insertEvent();
    await expectRefusedBy(insertEvent({ id: UNKNOWN }), "events_source_external_id_key");
  });
});

describe("Constraints of event competitors (ADR-0003, ADR-0035, PER-2)", () => {
  beforeEach(async () => {
    await insertEvent();
    await insertLink(SALZBURG, "home");
  });

  it("refuses a role other than home and away", async () => {
    await expectRefusedBy(insertLink(STURM, "guest"), "event_competitors_role_check");
  });

  it("refuses the same competitor twice in one event", async () => {
    await expectRefusedBy(insertLink(SALZBURG, "away"), "event_competitors_pkey");
  });

  it("refuses a second home competitor", async () => {
    await expectRefusedBy(insertLink(STURM, "home"), "event_competitors_event_id_role_key");
  });

  it("refuses a competitor that does not exist", async () => {
    await expectRefusedBy(insertLink(UNKNOWN, "away"), "event_competitors_competitor_id_sport_code_fkey");
  });

  it("refuses a link to an event that does not exist", async () => {
    await expectRefusedBy(insertLink(STURM, "away", UNKNOWN), "event_competitors_event_id_sport_code_fkey");
  });

  // ADR-0035: a link row has one sport. The event and the competitor must
  // both have it, so each choice of the sport breaks one of the two keys.
  it("refuses a competitor of another sport", async () => {
    await sql`INSERT INTO sports (code, name) VALUES ('ice_hockey', 'Ice Hockey')`.execute(db);
    await sql`
      INSERT INTO competitors (id, sport_code, name) VALUES (${KAC}, 'ice_hockey', 'KAC')
    `.execute(db);

    await expectRefusedBy(
      insertLink(KAC, "away", EVENT, "football"),
      "event_competitors_competitor_id_sport_code_fkey",
    );
    await expectRefusedBy(insertLink(KAC, "away", EVENT, "ice_hockey"), "event_competitors_event_id_sport_code_fkey");
  });
});
