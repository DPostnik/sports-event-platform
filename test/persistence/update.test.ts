import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { EventRepository } from "../../src/application/event-repository.ts";
import { applyCommand, type Command } from "../../src/domain/commands.ts";
import type { Event } from "../../src/domain/event.ts";
import type { Database } from "../../src/infrastructure/persistence/database.ts";
import { createEventRepository } from "../../src/infrastructure/persistence/event-repository.ts";
import { EVENT_FIELDS } from "../domain/fixtures.ts";
import { resetData, startTestDatabase, type TestDatabase } from "./support/database.ts";

const SCHEDULED: Event = { ...EVENT_FIELDS, status: "scheduled" };

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

// Every test starts with the scheduled event at version 1.
beforeEach(async () => {
  await resetData(db);
  await repository.create(SCHEDULED);
});

// The domain decides, as the use case does before it writes (ADR-0030).
function decide(event: Event, command: Command): Event {
  const decided = applyCommand(event, command);
  if (!decided.ok) {
    throw new Error(`the fixture command must be allowed: ${decided.error.kind}`);
  }
  return decided.value;
}

async function storedEvent(): Promise<Event | undefined> {
  const view = await repository.findById(SCHEDULED.id);
  return view?.event;
}

describe("Write a changed event (ADR-0009, ADR-0030)", () => {
  it("stores the event that each command returns", async () => {
    // One life of an event that uses five commands. The sixth, cancel, is in
    // the tests below.
    const commands: Command[] = [
      { kind: "postpone", expectedVersion: 1 },
      { kind: "reschedule", expectedVersion: 2, startsAt: new Date("2025-07-25T16:30:00Z") },
      { kind: "start", expectedVersion: 3, phase: "1st_half" },
      { kind: "changePhase", expectedVersion: 4, phase: "2nd_half" },
      { kind: "finish", expectedVersion: 5 },
    ];

    let event: Event = SCHEDULED;
    for (const command of commands) {
      event = decide(event, command);

      expect(await repository.update(event, command.expectedVersion)).toBe(true);
      expect(await storedEvent()).toEqual(event);
    }
  });

  it("writes nothing when the stored version is not the expected one", async () => {
    const started = decide(SCHEDULED, { kind: "start", expectedVersion: 1 });
    // Decided on the same read as the start, so it is stale after the start.
    const cancelled = decide(SCHEDULED, { kind: "cancel", expectedVersion: 1 });
    await repository.update(started, 1);

    expect(await repository.update(cancelled, 1)).toBe(false);
    expect(await storedEvent()).toEqual(started);
  });

  it("applies one change when ten writers use the same expected version", async () => {
    const started = decide(SCHEDULED, { kind: "start", expectedVersion: 1 });
    const cancelled = decide(SCHEDULED, { kind: "cancel", expectedVersion: 1 });
    const changes = Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? started : cancelled));

    const results = await Promise.all(changes.map((change) => repository.update(change, 1)));

    const applied = changes.filter((_, index) => results[index] === true);
    expect(applied).toHaveLength(1);
    expect(await storedEvent()).toEqual(applied[0]);
  });
});
