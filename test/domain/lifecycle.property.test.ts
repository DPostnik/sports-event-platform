import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyCommand, type Command, type CommandKind } from "#src/domain/commands.ts";
import type { Event, EventStatus } from "#src/domain/event.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";

// ADR-0026: properties that hold for any sequence of commands. fast-check
// generates the sequences and reports the shortest one that breaks a property.

interface Step {
  readonly kind: CommandKind;
  readonly phase: string;
  // True when the writer sends a version that is not the current one.
  readonly wrongVersion: boolean;
}

const step: fc.Arbitrary<Step> = fc.record({
  kind: fc.constantFrom<CommandKind>("start", "finish", "postpone", "reschedule", "cancel", "changePhase"),
  // Two football phases and one hockey phase, so some commands have a wrong phase.
  phase: fc.constantFrom("1st_half", "2nd_half", "1st_period"),
  wrongVersion: fc.boolean(),
});

const steps = fc.array(step, { maxLength: 30 });

function toCommand(event: Event, { kind, phase, wrongVersion }: Step): Command {
  const expectedVersion = wrongVersion ? event.version + 1 : event.version;
  switch (kind) {
    case "start":
    case "changePhase":
      return { kind, expectedVersion, phase };
    case "reschedule":
      return { kind, expectedVersion, startsAt: new Date("2025-08-01T12:00:00Z") };
    case "finish":
    case "postpone":
    case "cancel":
      return { kind, expectedVersion };
  }
}

// Applies the steps one by one to a new scheduled football event. After each
// step it calls `check` with the event before, the event after and whether
// the command was applied.
function run(
  stepList: readonly Step[],
  check: (before: Event, after: Event, applied: boolean) => void,
): void {
  let event: Event = { ...EVENT_FIELDS, status: "scheduled" };
  for (const next of stepList) {
    const before = structuredClone(event);
    const result = applyCommand(event, toCommand(event, next));
    const after: Event = result.ok ? result.value : event;
    check(before, after, result.ok);
    event = after;
  }
}

const TERMINAL: readonly EventStatus[] = ["finished", "cancelled"];

describe("Lifecycle properties (ADR-0002, ADR-0009, ADR-0026)", () => {
  it("generates sequences that reach both terminal statuses", () => {
    const reached = new Set<EventStatus>();
    for (const stepList of fc.sample(steps, { numRuns: 300, seed: 1 })) {
      run(stepList, (_before, after) => reached.add(after.status));
    }
    expect(reached).toContain("finished");
    expect(reached).toContain("cancelled");
  });

  it("never leaves a terminal status", () => {
    fc.assert(
      fc.property(steps, (stepList) => {
        run(stepList, (before, after) => {
          if (TERMINAL.includes(before.status)) {
            expect(after.status).toBe(before.status);
          }
        });
      }),
    );
  });

  it("advances the version by one for an applied command and never otherwise", () => {
    fc.assert(
      fc.property(steps, (stepList) => {
        run(stepList, (before, after, applied) => {
          expect(after.version).toBe(applied ? before.version + 1 : before.version);
        });
      }),
    );
  });

  it("leaves the event unchanged when a command is refused", () => {
    fc.assert(
      fc.property(steps, (stepList) => {
        run(stepList, (before, after, applied) => {
          if (!applied) {
            expect(after).toEqual(before);
          }
        });
      }),
    );
  });
});
