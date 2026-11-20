import type { CompetitorId, EventId } from "./ids.ts";

// ADR-0002. The list exists at run time for the row mapper and the HTTP schema.
export const EVENT_STATUSES = ["scheduled", "live", "postponed", "finished", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

interface EventFields {
  readonly id: EventId;
  // ADR-0007: the writer and the ID the writer uses for this match.
  readonly source: string;
  readonly externalId: string;
  readonly sport: string;
  // For a postponed event this is the last scheduled start (ADR-0011).
  readonly startsAt: Date;
  readonly homeCompetitorId: CompetitorId;
  readonly awayCompetitorId: CompetitorId;
  // ADR-0009: starts at 1 and advances by 1 on each applied change.
  readonly version: number;
}

// A live event may have a phase (ADR-0004, ADR-0031).
export interface LiveEvent extends EventFields {
  readonly status: "live";
  readonly phase?: string;
}

// An event in any other status has no phase. `never` means "no value is
// allowed here", so the compiler refuses a phase on these statuses.
export interface NotLiveEvent extends EventFields {
  readonly status: "scheduled" | "postponed" | "finished" | "cancelled";
  readonly phase?: never;
}

export type Event = LiveEvent | NotLiveEvent;
