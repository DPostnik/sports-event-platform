import type { Competitor } from "../domain/create-event.ts";
import type { Event } from "../domain/event.ts";
import type { CompetitorId, EventId } from "../domain/ids.ts";
import type { EventView } from "./event-view.ts";

export interface CreateResult {
  // The stored event: the new one, or the earlier one for a repeated create.
  readonly view: EventView;
  // False when (source, externalId) already existed and nothing was written.
  readonly created: boolean;
}

// What the use cases need from storage. The persistence layer implements it.
export interface EventRepository {
  // ADR-0007: idempotent on (source, externalId). One transaction writes the
  // event and its two competitor links.
  create(event: Event): Promise<CreateResult>;

  findById(id: EventId): Promise<EventView | undefined>;

  // A create needs the sport of each competitor before it can call the domain.
  // Unknown IDs are absent from the result.
  findCompetitors(ids: readonly CompetitorId[]): Promise<readonly Competitor[]>;
}
