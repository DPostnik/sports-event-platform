import { Buffer } from "node:buffer";
import { z } from "zod";
import type { EventCursor, EventFilters } from "#src/application/event-repository.ts";
import type { EventView } from "#src/application/event-view.ts";
import { EVENT_STATUSES } from "#src/domain/event.ts";
import { parseCompetitorId, parseEventId } from "#src/domain/ids.ts";

const uuid = z.guid();
const eventId = uuid.transform((value, context) => {
  const result = parseEventId(value);
  if (result.ok) return result.value;
  context.addIssue({ code: "custom", message: "Expected an event UUID" });
  return z.NEVER;
});
const competitorId = uuid.transform((value, context) => {
  const result = parseCompetitorId(value);
  if (result.ok) return result.value;
  context.addIssue({ code: "custom", message: "Expected a competitor UUID" });
  return z.NEVER;
});

const source = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const sport = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const externalId = z.string().min(1).max(128).refine((value) => !value.includes("\0"), {
  message: "The external ID must not contain a null character",
});
const phase = z.string().min(1);
const version = z.int().min(1).max(2_147_483_647);
const instant = z.iso.datetime({ offset: true })
  .describe("An ISO 8601 date and time with an explicit offset or Z.")
  .transform((value, context) => {
    const date = new Date(value);
    if (Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999) {
      return date;
    }
    context.addIssue({ code: "custom", message: "Expected a UTC instant in years 0001 to 9999" });
    return z.NEVER;
  });

export const eventParams = z.strictObject({ id: eventId });
export const createBody = z.strictObject({
  source,
  externalId,
  sport,
  startsAt: instant,
  homeCompetitorId: competitorId,
  awayCompetitorId: competitorId,
});
export const versionBody = z.strictObject({ expectedVersion: version });
export const startBody = versionBody.extend({ phase: phase.optional() });
export const rescheduleBody = versionBody.extend({ startsAt: instant });
export const phaseBody = versionBody.extend({ phase });

const cursorParts = z.strictObject({ startsAt: instant, id: eventId });
const cursor = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
  .transform((value, context) => {
    const [startsAt, id] = Buffer.from(value, "base64url").toString("utf8").split("|");
    const parsed = cursorParts.safeParse({ startsAt, id });
    if (parsed.success && encodeCursor(parsed.data) === value) return parsed.data;
    context.addIssue({ code: "custom", message: "Expected a cursor from a previous page" });
    return z.NEVER;
  }).describe("Pass nextCursor from the previous page with the same filters.");

export function encodeCursor(cursor: EventCursor): string {
  const position = `${cursor.startsAt.toISOString()}|${cursor.id}`;
  return Buffer.from(position, "utf8").toString("base64url");
}

export const listQuery = z.strictObject({
  sport: sport.optional(),
  status: z.enum(EVENT_STATUSES).optional(),
  from: instant.describe("Inclusive start of the time window.").optional(),
  to: instant.describe("Exclusive end of the time window.").optional(),
  competitor: competitorId.optional(),
  cursor: cursor.optional(),
  limit: z.string().regex(/^(?:[1-9][0-9]?|100)$/).transform(Number)
    .describe("An integer from 1 to 100. Default is 50.").optional(),
});

export function toEventFilters({ sport, status, from, to, competitor }: z.output<typeof listQuery>): EventFilters {
  return {
    ...(sport === undefined ? {} : { sport }),
    ...(status === undefined ? {} : { status }),
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(competitor === undefined ? {} : { competitorId: competitor }),
  };
}

const utc = z.iso.datetime();
const competitor = z.strictObject({
  id: uuid,
  name: z.string(),
  role: z.enum(["home", "away"]),
});
const eventFields = {
  id: uuid,
  source: z.string(),
  externalId: z.string(),
  sport: z.strictObject({ code: z.string(), name: z.string() }),
  startsAt: utc,
  competitors: z.array(competitor),
  version,
};
const eventSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...eventFields, status: z.literal("live"), phase: phase.optional() }),
  z.strictObject({ ...eventFields, status: z.enum(["scheduled", "postponed", "finished", "cancelled"]) }),
]);

export const eventResponse = z.strictObject({ generatedAt: utc, event: eventSchema });
export const listResponse = z.strictObject({
  generatedAt: utc,
  events: z.array(eventSchema),
  nextCursor: z.string().optional(),
});

export function toEventResponse(view: EventView): z.output<typeof eventSchema> {
  const event = view.event;
  const fields = {
    id: event.id,
    source: event.source,
    externalId: event.externalId,
    sport: { code: event.sport, name: view.sportName },
    startsAt: event.startsAt.toISOString(),
    competitors: [
      { id: event.homeCompetitorId, name: view.homeName, role: "home" },
      { id: event.awayCompetitorId, name: view.awayName, role: "away" },
    ] satisfies z.output<typeof competitor>[],
    version: event.version,
  };
  if (event.status === "live") {
    return { ...fields, status: event.status, phase: event.phase };
  }
  return { ...fields, status: event.status };
}
