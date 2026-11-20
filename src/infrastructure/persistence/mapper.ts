import type { EventView } from "../../application/event-view.ts";
import { EVENT_STATUSES, type Event, type EventStatus } from "../../domain/event.ts";
import { parseCompetitorId, parseEventId } from "../../domain/ids.ts";

// What every read statement returns: one event joined with its sport and its
// two competitors.
export interface EventRow {
  readonly id: string;
  readonly source: string;
  readonly external_id: string;
  readonly sport_code: string;
  readonly sport_name: string;
  readonly start_time: Date;
  readonly status: string;
  readonly phase: string | null;
  readonly version: number;
  readonly home_competitor_id: string;
  readonly home_competitor_name: string;
  readonly away_competitor_id: string;
  readonly away_competitor_name: string;
}

// A stored row that breaks a domain rule. The database constraints make this
// unlikely, so it means a bug or a manual change of the data (ADR-0034).
export class CorruptRowError extends Error {
  constructor(eventId: string, reason: string) {
    super(`corrupt event row ${eventId}: ${reason}`);
    this.name = "CorruptRowError";
  }
}

function isEventStatus(value: string): value is EventStatus {
  return EVENT_STATUSES.some((status) => status === value);
}

// The one place where a row becomes a domain object (PER-4).
export function toEventView(row: EventRow): EventView {
  const id = parseEventId(row.id);
  const home = parseCompetitorId(row.home_competitor_id);
  const away = parseCompetitorId(row.away_competitor_id);
  if (!id.ok || !home.ok || !away.ok) {
    throw new CorruptRowError(row.id, "an ID is not a UUID");
  }

  const fields = {
    id: id.value,
    source: row.source,
    externalId: row.external_id,
    sport: row.sport_code,
    startsAt: row.start_time,
    homeCompetitorId: home.value,
    awayCompetitorId: away.value,
    version: row.version,
  };

  return {
    event: toEvent(row, fields),
    sportName: row.sport_name,
    homeName: row.home_competitor_name,
    awayName: row.away_competitor_name,
  };
}

function toEvent(row: EventRow, fields: Omit<Event, "status" | "phase">): Event {
  const { status, phase } = row;
  if (!isEventStatus(status)) {
    throw new CorruptRowError(row.id, `unknown status ${status}`);
  }
  if (status === "live") {
    return phase === null ? { ...fields, status } : { ...fields, status, phase };
  }
  if (phase !== null) {
    throw new CorruptRowError(row.id, `phase on a ${status} event`);
  }
  return { ...fields, status };
}
