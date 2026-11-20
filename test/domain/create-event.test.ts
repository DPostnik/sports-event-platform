import { describe, expect, it } from "vitest";
import { createEvent, type NewEvent } from "../../src/domain/create-event.ts";
import { EVENT_FIELDS, SALZBURG, STURM } from "./fixtures.ts";

const newEvent: NewEvent = {
  id: EVENT_FIELDS.id,
  source: EVENT_FIELDS.source,
  externalId: EVENT_FIELDS.externalId,
  sport: "football",
  startsAt: EVENT_FIELDS.startsAt,
  home: { id: SALZBURG, sport: "football" },
  away: { id: STURM, sport: "football" },
};

describe("Create an event (ADR-0003)", () => {
  it("creates a scheduled event with version 1", () => {
    expect(createEvent(newEvent)).toEqual({
      ok: true,
      value: { ...EVENT_FIELDS, status: "scheduled", version: 1 },
    });
  });

  it("refuses the same competitor on both sides", () => {
    const result = createEvent({ ...newEvent, away: { id: SALZBURG, sport: "football" } });
    expect(result).toEqual({ ok: false, error: { kind: "SameCompetitor", competitorId: SALZBURG } });
  });

  it("refuses a competitor of another sport", () => {
    const result = createEvent({ ...newEvent, away: { id: STURM, sport: "ice_hockey" } });
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "CompetitorSportMismatch",
        competitorId: STURM,
        competitorSport: "ice_hockey",
        eventSport: "football",
      },
    });
  });
});
