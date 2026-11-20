import { describe, expect, it } from "vitest";
import { CorruptRowError, toEventView, type EventRow } from "#src/infrastructure/persistence/mapper.ts";

const ROW: EventRow = {
  id: "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
  source: "manual",
  external_id: "match-1",
  sport_code: "football",
  sport_name: "Football",
  start_time: new Date("2025-07-18T16:30:00Z"),
  status: "scheduled",
  phase: null,
  version: 1,
  home_competitor_id: "0198c5a0-0000-7000-8000-000000000001",
  home_competitor_name: "Salzburg",
  away_competitor_id: "0198c5a0-0000-7000-8000-000000000002",
  away_competitor_name: "Sturm",
};

describe("Row mapper (ADR-0034, PER-4)", () => {
  it("maps a row to an event with the names of its sport and competitors", () => {
    expect(toEventView(ROW)).toEqual({
      event: {
        id: ROW.id,
        source: "manual",
        externalId: "match-1",
        sport: "football",
        startsAt: ROW.start_time,
        homeCompetitorId: ROW.home_competitor_id,
        awayCompetitorId: ROW.away_competitor_id,
        status: "scheduled",
        version: 1,
      },
      sportName: "Football",
      homeName: "Salzburg",
      awayName: "Sturm",
    });
  });

  it("maps the phase of a live event", () => {
    const view = toEventView({ ...ROW, status: "live", phase: "2nd_half" });
    expect(view.event).toMatchObject({ status: "live", phase: "2nd_half" });
  });

  it("refuses a row with an ID that is not a UUID", () => {
    expect(() => toEventView({ ...ROW, home_competitor_id: "salzburg" })).toThrow(CorruptRowError);
  });

  it("refuses a row with an unknown status", () => {
    expect(() => toEventView({ ...ROW, status: "suspended" })).toThrow(CorruptRowError);
  });

  it("refuses a row with a phase on an event that is not live", () => {
    expect(() => toEventView({ ...ROW, status: "finished", phase: "2nd_half" })).toThrow(CorruptRowError);
  });
});
