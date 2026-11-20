import type { Competitor } from "../domain/create-event.ts";
import type { Event, EventStatus } from "../domain/event.ts";
import type { CompetitorId, EventId } from "../domain/ids.ts";
import type { EventView } from "./event-view.ts";

export interface CreateResult {
  // The stored event: the new one, or the earlier one for a repeated create.
  readonly view: EventView;
  // False when (source, externalId) already existed and nothing was written.
  readonly created: boolean;
}

// ADR-0011: every filter is optional. The ones that are set must all match.
export interface EventFilters {
  // The time window includes `from` and excludes `to`, so two adjacent windows
  // never share an event.
  readonly from?: Date;
  readonly to?: Date;
  readonly sport?: string;
  readonly status?: EventStatus;
  // Matches the event when this competitor is its home or its away side.
  readonly competitorId?: CompetitorId;
}

// ADR-0012: "continue after this event". The text form that a consumer sees
// belongs to the HTTP layer.
export interface EventCursor {
  readonly startsAt: Date;
  readonly id: EventId;
}

export interface EventPage {
  readonly views: readonly EventView[];
  // Absent on the last page.
  readonly nextCursor?: EventCursor;
}

// What the use cases need from storage. The persistence layer implements it.
export interface EventRepository {
  // ADR-0007: idempotent on (source, externalId). One transaction writes the
  // event and its two competitor links.
  create(event: Event): Promise<CreateResult>;

  findById(id: EventId): Promise<EventView | undefined>;

  // ADR-0030: writes an event that the domain changed, only when the stored
  // version still equals `expectedVersion`. False means that nothing was
  // written: another writer was faster, or the event does not exist.
  update(event: Event, expectedVersion: number): Promise<boolean>;

  // ADR-0011, ADR-0012: ordered by start time, then by ID. The caller checks
  // that `limit` is from 1 to 100 (ADR-0029).
  list(filters: EventFilters, cursor: EventCursor | undefined, limit: number): Promise<EventPage>;

  // A create needs the sport of each competitor before it can call the domain.
  // Unknown IDs are absent from the result.
  findCompetitors(ids: readonly CompetitorId[]): Promise<readonly Competitor[]>;
}
