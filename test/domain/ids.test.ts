import { describe, expect, it } from "vitest";
import { parseCompetitorId, parseEventId, type EventId } from "#src/domain/ids.ts";

const UUID = "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90";

describe("Branded identifiers (ADR-0006, ADR-0033)", () => {
  it("accepts a UUID and returns it in lower case", () => {
    expect(parseEventId(UUID.toUpperCase())).toEqual({ ok: true, value: UUID });
  });

  it("refuses text that is not a UUID", () => {
    expect(parseCompetitorId("salzburg")).toEqual({
      ok: false,
      error: { kind: "InvalidId", value: "salzburg" },
    });
  });

  it("does not compile when a competitor ID is used as an event ID", () => {
    const competitorId = parseCompetitorId(UUID);
    if (!competitorId.ok) {
      throw new Error("the fixture UUID must parse");
    }
    // @ts-expect-error a competitor ID is not an event ID
    const eventId: EventId = competitorId.value;
    expect(eventId).toBe(UUID);
  });
});
