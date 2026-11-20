import type { Event } from "#src/domain/event.ts";
import type { CompetitorId, EventId } from "#src/domain/ids.ts";
import { err, ok, type Result } from "#src/domain/result.ts";

// What the domain needs to know about a competitor to check a new event.
export interface Competitor {
  readonly id: CompetitorId;
  readonly sport: string;
}

// The caller supplies the ID: the domain generates no IDs (AGENTS.md).
export interface NewEvent {
  readonly id: EventId;
  readonly source: string;
  readonly externalId: string;
  readonly sport: string;
  readonly startsAt: Date;
  readonly home: Competitor;
  readonly away: Competitor;
}

export type CreateEventError =
  | { readonly kind: "SameCompetitor"; readonly competitorId: CompetitorId }
  | {
      readonly kind: "CompetitorSportMismatch";
      readonly competitorId: CompetitorId;
      readonly competitorSport: string;
      readonly eventSport: string;
    };

// ADR-0003: one home and one away competitor, different, both of the sport of
// the event. A new event is scheduled and has version 1 (ADR-0002, ADR-0009).
export function createEvent(input: NewEvent): Result<Event, CreateEventError> {
  if (input.home.id === input.away.id) {
    return err({ kind: "SameCompetitor", competitorId: input.home.id });
  }

  for (const competitor of [input.home, input.away]) {
    if (competitor.sport !== input.sport) {
      return err({
        kind: "CompetitorSportMismatch",
        competitorId: competitor.id,
        competitorSport: competitor.sport,
        eventSport: input.sport,
      });
    }
  }

  return ok({
    id: input.id,
    source: input.source,
    externalId: input.externalId,
    sport: input.sport,
    startsAt: input.startsAt,
    homeCompetitorId: input.home.id,
    awayCompetitorId: input.away.id,
    status: "scheduled",
    version: 1,
  });
}
