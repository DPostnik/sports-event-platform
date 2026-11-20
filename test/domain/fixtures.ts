import { parseCompetitorId, parseEventId, type CompetitorId, type EventId } from "#src/domain/ids.ts";

export function eventId(text: string): EventId {
  const parsed = parseEventId(text);
  if (!parsed.ok) {
    throw new Error(`fixture is not a UUID: ${text}`);
  }
  return parsed.value;
}

export function competitorId(text: string): CompetitorId {
  const parsed = parseCompetitorId(text);
  if (!parsed.ok) {
    throw new Error(`fixture is not a UUID: ${text}`);
  }
  return parsed.value;
}

// The example of the brief: 2025-07-18 18:30 in Austria, football, Salzburg vs. Sturm.
export const SALZBURG = competitorId("0198c5a0-0000-7000-8000-000000000001");
export const STURM = competitorId("0198c5a0-0000-7000-8000-000000000002");

export const EVENT_FIELDS = {
  id: eventId("0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90"),
  source: "manual",
  externalId: "match-1",
  sport: "football",
  startsAt: new Date("2025-07-18T16:30:00Z"),
  homeCompetitorId: SALZBURG,
  awayCompetitorId: STURM,
  version: 1,
};
