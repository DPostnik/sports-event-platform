import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/infrastructure/persistence/database.ts";
import { createEventRepository } from "../../src/infrastructure/persistence/event-repository.ts";
import { seed } from "../../src/infrastructure/persistence/seed.ts";
import { startTestDatabase, type TestDatabase } from "./support/database.ts";

let testDatabase: TestDatabase | undefined;
let db: Kysely<Database>;

beforeAll(async () => {
  testDatabase = await startTestDatabase();
  db = testDatabase.db;
});

afterAll(async () => {
  await testDatabase?.stop();
});

describe("Seed data (ADR-0027)", () => {
  it("stores the reference data and the two events of the brief once, also when it runs twice", async () => {
    await seed(db);
    await seed(db);

    const sports = await db.selectFrom("sports").select("code").orderBy("code").execute();
    const competitors = await db.selectFrom("competitors").select("name").orderBy("name").execute();
    const page = await createEventRepository(db).list({}, undefined, 50);
    expect(sports.map((sport) => sport.code)).toEqual(["football", "ice_hockey"]);
    expect(competitors.map((competitor) => competitor.name)).toEqual(["Capitals", "KAC", "Salzburg", "Sturm"]);
    expect(
      page.views.map((view) => [view.homeName, view.awayName, view.event.startsAt.toISOString()]),
    ).toEqual([
      ["Salzburg", "Sturm", "2025-07-18T16:30:00.000Z"],
      ["KAC", "Capitals", "2025-10-23T07:45:00.000Z"],
    ]);
  });
});
