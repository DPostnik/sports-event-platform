import { describe, expect, it } from "vitest";
import { applyCommand, type Command, type CommandKind } from "#src/domain/commands.ts";
import { EVENT_STATUSES, type Event, type EventStatus } from "#src/domain/event.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";

const NEW_START = new Date("2025-07-19T16:30:00Z");

function eventIn(status: EventStatus): Event {
  return { ...EVENT_FIELDS, status };
}

function command(kind: CommandKind, expectedVersion = 1): Command {
  switch (kind) {
    case "reschedule":
      return { kind, expectedVersion, startsAt: NEW_START };
    case "changePhase":
      return { kind, expectedVersion, phase: "2nd_half" };
    case "start":
    case "finish":
    case "postpone":
    case "cancel":
      return { kind, expectedVersion };
  }
}

// The table of ADR-0010: command, status before, status after.
const ALLOWED: readonly (readonly [CommandKind, EventStatus, EventStatus])[] = [
  ["start", "scheduled", "live"],
  ["finish", "live", "finished"],
  ["postpone", "scheduled", "postponed"],
  ["reschedule", "scheduled", "scheduled"],
  ["reschedule", "postponed", "scheduled"],
  ["cancel", "scheduled", "cancelled"],
  ["cancel", "postponed", "cancelled"],
  ["changePhase", "live", "live"],
];

const COMMAND_KINDS: readonly CommandKind[] = [
  "start",
  "finish",
  "postpone",
  "reschedule",
  "cancel",
  "changePhase",
];

describe("Lifecycle (ADR-0002, ADR-0010)", () => {
  it.each(ALLOWED)("%s from %s gives %s and advances the version", (kind, from, to) => {
    const result = applyCommand(eventIn(from), command(kind));
    expect(result).toMatchObject({ ok: true, value: { status: to, version: 2 } });
  });

  it("refuses every other pair of command and status", () => {
    for (const kind of COMMAND_KINDS) {
      for (const from of EVENT_STATUSES) {
        if (ALLOWED.some(([allowedKind, allowedFrom]) => allowedKind === kind && allowedFrom === from)) {
          continue;
        }
        expect(applyCommand(eventIn(from), command(kind))).toEqual({
          ok: false,
          error: { kind: "TransitionNotAllowed", command: kind, status: from },
        });
      }
    }
  });
});

describe("Version check (ADR-0009)", () => {
  it("refuses a command with another version and reports the current one", () => {
    const event: Event = { ...eventIn("scheduled"), version: 3 };
    expect(applyCommand(event, command("cancel", 2))).toEqual({
      ok: false,
      error: { kind: "VersionConflict", expectedVersion: 2, currentVersion: 3 },
    });
  });

  it("checks the version before the status", () => {
    const event: Event = { ...eventIn("finished"), version: 3 };
    expect(applyCommand(event, command("cancel", 2))).toMatchObject({
      ok: false,
      error: { kind: "VersionConflict" },
    });
  });
});

describe("Command input (ADR-0004, ADR-0010, ADR-0031)", () => {
  it("starts an event with the given phase", () => {
    const result = applyCommand(eventIn("scheduled"), { kind: "start", expectedVersion: 1, phase: "1st_half" });
    expect(result).toEqual({
      ok: true,
      value: { ...EVENT_FIELDS, status: "live", phase: "1st_half", version: 2 },
    });
  });

  it("starts an event without a phase", () => {
    const result = applyCommand(eventIn("scheduled"), command("start"));
    expect(result).toEqual({ ok: true, value: { ...EVENT_FIELDS, status: "live", version: 2 } });
  });

  it("refuses a phase of another sport", () => {
    const result = applyCommand(eventIn("scheduled"), { kind: "start", expectedVersion: 1, phase: "1st_period" });
    expect(result).toEqual({
      ok: false,
      error: { kind: "InvalidPhase", sport: "football", phase: "1st_period" },
    });
  });

  it("changes the phase of a live event", () => {
    const live: Event = { ...EVENT_FIELDS, status: "live", phase: "1st_half" };
    expect(applyCommand(live, command("changePhase"))).toMatchObject({
      ok: true,
      value: { status: "live", phase: "2nd_half" },
    });
  });

  it("drops the phase when the event finishes", () => {
    const live: Event = { ...EVENT_FIELDS, status: "live", phase: "2nd_half" };
    expect(applyCommand(live, command("finish"))).toEqual({
      ok: true,
      value: { ...EVENT_FIELDS, status: "finished", version: 2 },
    });
  });

  it("sets the new start time on reschedule", () => {
    const result = applyCommand(eventIn("postponed"), command("reschedule"));
    expect(result).toMatchObject({ ok: true, value: { startsAt: NEW_START } });
  });

  it("keeps the last scheduled start when the event is postponed (ADR-0011)", () => {
    const result = applyCommand(eventIn("scheduled"), command("postpone"));
    expect(result).toMatchObject({ ok: true, value: { startsAt: EVENT_FIELDS.startsAt } });
  });
});
