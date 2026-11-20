import { describe, expect, it } from "vitest";
import type { Event } from "#src/domain/event.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";

// The lines under @ts-expect-error are checked by `npm run typecheck`: if one
// of them ever compiles, the type check fails.
describe("Only a live event has a phase (ADR-0004, ADR-0031)", () => {
  it("accepts a phase on a live event", () => {
    const live: Event = { ...EVENT_FIELDS, status: "live", phase: "1st_half" };
    expect(live.phase).toBe("1st_half");
  });

  it("does not compile with a phase on an event that is not live", () => {
    // @ts-expect-error only a live event has a phase
    const finished: Event = { ...EVENT_FIELDS, status: "finished", phase: "2nd_half" };
    expect(finished.status).toBe("finished");
  });

  it("does not compile when a live event is copied into another status with its phase", () => {
    const live: Event = { ...EVENT_FIELDS, status: "live", phase: "2nd_half" };
    // @ts-expect-error the copy still carries the phase
    const finished: Event = { ...live, status: "finished" };
    expect(finished.status).toBe("finished");
  });
});
