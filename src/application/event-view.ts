import type { Event } from "../domain/event.ts";

// ADR-0027: what a read returns. The event, and the names a consumer needs to
// show it. The names are reference data, so they are not part of the event.
export interface EventView {
  readonly event: Event;
  readonly sportName: string;
  readonly homeName: string;
  readonly awayName: string;
}
