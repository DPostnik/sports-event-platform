import { describe, expect, it } from "vitest";
import { isPhaseOfSport } from "../../src/domain/phases.ts";

describe("Phases per sport (ADR-0004, ADR-0031)", () => {
  it("accepts a phase of the sport", () => {
    expect(isPhaseOfSport("football", "2nd_half")).toBe(true);
  });

  it("refuses a phase of another sport", () => {
    expect(isPhaseOfSport("football", "1st_period")).toBe(false);
  });

  it("refuses every phase for a sport without phases", () => {
    expect(isPhaseOfSport("tennis", "1st_set")).toBe(false);
  });
});
