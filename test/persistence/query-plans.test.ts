import { sql, type Explainable, type Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import { buildFindByIdQuery, buildListQuery } from "#src/infrastructure/persistence/event-repository.ts";
import { competitorId, eventId } from "#test/domain/fixtures.ts";
import { startTestDatabase, type TestDatabase } from "#test/persistence/support/database.ts";

// ADR-0013 calls its index table "a design claim until measured". These tests
// measure it: they fill the tables, ask PostgreSQL for the plan of each
// statement of the repository, and check that the plan reads the named index.

const PAGE = 50;

let testDatabase: TestDatabase | undefined;
let db: Kysely<Database>;

// 4 sports, 500 competitors in each sport, 50,000 events. Event number i
// starts 10 minutes after event i - 1. One event in 50 is live. Each
// competitor plays 50 events.
beforeAll(async () => {
  testDatabase = await startTestDatabase();
  db = testDatabase.db;

  await sql`
    INSERT INTO sports (code, name)
    VALUES ('football', 'Football'), ('ice_hockey', 'Ice Hockey'),
           ('handball', 'Handball'), ('basketball', 'Basketball')
  `.execute(db);
  // md5 gives 32 hex digits, which PostgreSQL accepts as a UUID.
  await sql`
    INSERT INTO competitors (id, sport_code, name)
    SELECT md5('c-' || s.code || '-' || n)::uuid, s.code, 'Competitor ' || n
    FROM sports AS s CROSS JOIN generate_series(0, 499) AS n
  `.execute(db);
  // ORDER BY md5 stores the rows in a mixed order, as a real table has them.
  // Rows stored in time order would make every index look cheap.
  await sql`
    INSERT INTO events (id, source, external_id, sport_code, start_time, status, version)
    SELECT md5('e-' || i)::uuid, 'load', 'ext-' || i,
           (ARRAY['football', 'ice_hockey', 'handball', 'basketball'])[i % 4 + 1],
           timestamptz '2025-01-01 00:00:00+00' + i * interval '10 minutes',
           CASE WHEN i % 50 = 7 THEN 'live' ELSE 'finished' END, 1
    FROM generate_series(0, 49999) AS i
    ORDER BY md5(i::text)
  `.execute(db);
  await sql`
    INSERT INTO event_competitors (event_id, competitor_id, role)
    SELECT md5('e-' || i)::uuid,
           md5('c-' || (ARRAY['football', 'ice_hockey', 'handball', 'basketball'])[i % 4 + 1]
               || '-' || (i / 4 + side.shift) % 500)::uuid,
           side.role
    FROM generate_series(0, 49999) AS i
    CROSS JOIN (VALUES ('home', 0), ('away', 1)) AS side (role, shift)
  `.execute(db);
  // Collects the table statistics that the planner needs to choose a plan.
  await sql`ANALYZE`.execute(db);
});

afterAll(async () => {
  await testDatabase?.stop();
});

interface PlanLine {
  readonly "QUERY PLAN": string;
}

// EXPLAIN returns the plan as lines of text and does not run the statement.
async function planOf(query: Explainable): Promise<string> {
  const lines = await query.explain<PlanLine>("text");
  return lines.map((line) => line["QUERY PLAN"]).join("\n");
}

describe("Each query reads its named index (ADR-0013, PER-3)", () => {
  it("event by ID: the primary key of events", async () => {
    const plan = await planOf(buildFindByIdQuery(db, eventId("0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90")));

    expect(plan).toContain("events_pkey");
    expect(plan).not.toContain("Seq Scan on events");
  });

  // "No Sort" in the list plans means the index returns the rows already in
  // list order, so the statement stops after one page.
  it("time window: events (start_time, id), no sort", async () => {
    const window = { from: new Date("2025-03-01T00:00:00Z"), to: new Date("2025-03-15T00:00:00Z") };

    const plan = await planOf(buildListQuery(db, window, undefined, PAGE));

    expect(plan).toContain("events_start_time_id_idx");
    expect(plan).not.toContain("Sort");
  });

  it("sport and time window: events (sport_code, start_time, id), no sort", async () => {
    const filters = {
      sport: "ice_hockey",
      from: new Date("2025-03-01T00:00:00Z"),
      to: new Date("2025-04-01T00:00:00Z"),
    };

    const plan = await planOf(buildListQuery(db, filters, undefined, PAGE));

    expect(plan).toContain("events_sport_code_start_time_id_idx");
    expect(plan).not.toContain("Sort");
  });

  it("status: events (status, start_time, id), no sort", async () => {
    const plan = await planOf(buildListQuery(db, { status: "live" }, undefined, PAGE));

    expect(plan).toContain("events_status_start_time_id_idx");
    expect(plan).not.toContain("Sort");
  });

  // A sort is accepted here: one competitor has few events (ADR-0013).
  it("events of a competitor: event_competitors (competitor_id)", async () => {
    const found = await db.selectFrom("competitors").select("id").limit(1).executeTakeFirstOrThrow();

    const plan = await planOf(buildListQuery(db, { competitorId: competitorId(found.id) }, undefined, PAGE));

    expect(plan).toContain("event_competitors_competitor_id_idx");
    expect(plan).not.toContain("Seq Scan on events");
  });
});

describe("A deep cursor reads one page (ADR-0012)", () => {
  it("uses the cursor as the start position of the index scan", async () => {
    // The start time of event 25,000 of 50,000: the middle of the table.
    const cursor = {
      startsAt: new Date(Date.parse("2025-01-01T00:00:00Z") + 25_000 * 600_000),
      id: eventId("00000000-0000-7000-8000-000000000000"),
    };

    const plan = await planOf(buildListQuery(db, {}, cursor, PAGE));

    // "Index Cond" is where the scan starts. A "Filter" line would mean that
    // the earlier rows are read and thrown away.
    expect(plan).toMatch(/events_start_time_id_idx[^\n]*\n\s+Index Cond: [^\n]*start_time/);
    expect(plan).not.toContain("Sort");
  });
});
