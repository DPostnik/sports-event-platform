import { err, ok, type Result } from "#src/domain/result.ts";

// The key of the brand. `declare` means it exists only for the compiler: no
// JavaScript is produced for it, and no code can create or read the field.
declare const brand: unique symbol;

// The brand stops an event ID from being passed where a competitor ID is
// expected (ADR-0033).
export type EventId = string & { readonly [brand]: "EventId" };
export type CompetitorId = string & { readonly [brand]: "CompetitorId" };

export interface InvalidId {
  readonly kind: "InvalidId";
  readonly value: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An ID is kept in lower case, so two IDs can be compared with ===.
export function parseEventId(text: string): Result<EventId, InvalidId> {
  if (!UUID_PATTERN.test(text)) {
    return err({ kind: "InvalidId", value: text });
  }
  return ok(text.toLowerCase() as EventId);
}

export function parseCompetitorId(text: string): Result<CompetitorId, InvalidId> {
  if (!UUID_PATTERN.test(text)) {
    return err({ kind: "InvalidId", value: text });
  }
  return ok(text.toLowerCase() as CompetitorId);
}
