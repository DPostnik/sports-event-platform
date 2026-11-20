import type { FastifyReply } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { z } from "zod";
import type { CreateError, EventNotFound } from "#src/application/event-use-cases.ts";
import type { CommandError } from "#src/domain/commands.ts";
import { EVENT_STATUSES } from "#src/domain/event.ts";

const mediaType = "application/problem+json";

function defineProblem<const Code extends string, const Status extends number, Fields extends z.ZodRawShape>(
  code: Code,
  status: Status,
  title: string,
  fields: Fields,
) {
  const type = `https://example.invalid/problems/${code.toLowerCase().replaceAll("_", "-")}`;
  const schema = z.strictObject({
    ...fields,
    type: z.literal(type),
    title: z.literal(title),
    status: z.literal(status),
    detail: z.string(),
    code: z.literal(code),
  });
  return {
    schema,
    body: (detail: string, extra: z.output<z.ZodObject<Fields>>) => ({
      ...extra, type, title, status, detail, code,
    }),
  };
}

const fieldError = z.strictObject({ field: z.string(), message: z.string() });
const validation = defineProblem("VALIDATION_FAILED", 400, "Validation failed", { errors: z.array(fieldError) });
const notFound = defineProblem("NOT_FOUND", 404, "Not found", {});
const versionConflict = defineProblem("VERSION_CONFLICT", 409, "Version conflict", { currentVersion: z.int() });
const transitionNotAllowed = defineProblem("TRANSITION_NOT_ALLOWED", 409, "Transition not allowed", {
  currentStatus: z.enum(EVENT_STATUSES),
});
const invalidPhase = defineProblem("INVALID_PHASE", 422, "Invalid phase", { sport: z.string(), phase: z.string() });
const sameCompetitor = defineProblem("SAME_COMPETITOR", 422, "Same competitor", { competitorId: z.guid() });
const sportMismatch = defineProblem("COMPETITOR_SPORT_MISMATCH", 422, "Competitor sport mismatch", {
  competitorId: z.guid(), competitorSport: z.string(), eventSport: z.string(),
});
const competitorNotFound = defineProblem("COMPETITOR_NOT_FOUND", 422, "Competitor not found", { competitorId: z.guid() });
const unavailable = defineProblem("UNAVAILABLE", 503, "Unavailable", {});
const internal = defineProblem("INTERNAL", 500, "Internal error", { requestId: z.string() });

function problemResponse(description: string, schema: z.ZodType) {
  return { description, content: { [mediaType]: { schema } } };
}

export const baseErrors = {
  400: problemResponse("Invalid request", validation.schema),
  500: problemResponse("Unexpected error", internal.schema),
};
export const eventErrors = {
  ...baseErrors,
  503: problemResponse("Database unavailable", unavailable.schema),
};
export const singleEventErrors = {
  ...eventErrors,
  404: problemResponse("Event not found", notFound.schema),
};
export const createErrors = {
  ...eventErrors,
  422: problemResponse("Invalid competitors", z.union([sameCompetitor.schema, sportMismatch.schema, competitorNotFound.schema])),
};
export const commandErrors = {
  ...singleEventErrors,
  409: problemResponse("Conflicting event state", z.union([versionConflict.schema, transitionNotAllowed.schema])),
};
export const phaseCommandErrors = {
  ...commandErrors,
  422: problemResponse("Invalid phase for this sport", invalidPhase.schema),
};

interface Problem {
  readonly status: number;
  readonly code: string;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
}

export function sendProblem(reply: FastifyReply, problem: Problem): FastifyReply {
  return reply.code(problem.status).type(mediaType).send(problem);
}

export function eventProblem(error: CreateError | CommandError | EventNotFound): Problem {
  switch (error.kind) {
    case "EventNotFound":
      return notFound.body(`Event ${error.id} does not exist.`, {});
    case "VersionConflict":
      return versionConflict.body(
        `Expected version ${String(error.expectedVersion)}, current version is ${String(error.currentVersion)}.`,
        { currentVersion: error.currentVersion },
      );
    case "TransitionNotAllowed":
      return transitionNotAllowed.body(`Cannot apply ${error.command} to a ${error.status} event.`, { currentStatus: error.status });
    case "InvalidPhase":
      return invalidPhase.body("The phase does not apply to the event's sport.", { sport: error.sport, phase: error.phase });
    case "SameCompetitor":
      return sameCompetitor.body("Home and away must be different competitors.", { competitorId: error.competitorId });
    case "CompetitorSportMismatch":
      return sportMismatch.body("The competitor and event must have the same sport.", {
        competitorId: error.competitorId, competitorSport: error.competitorSport, eventSport: error.eventSport,
      });
    case "CompetitorNotFound":
      return competitorNotFound.body("The competitor does not exist.", { competitorId: error.competitorId });
    default:
      return assertNever(error);
  }
}

function assertNever(error: never): never {
  throw new Error(`Unhandled event error: ${JSON.stringify(error)}`);
}

export function transportProblem(error: unknown): Problem | undefined {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors = error.validation.flatMap((issue) => {
      const field = issue.instancePath.slice(1).replaceAll("/", ".") || error.validationContext || "request";
      const message = issue.message ?? "Invalid value";
      const keys = issue.params.keys;
      if (issue.keyword === "unrecognized_keys" && Array.isArray(keys)) {
        return keys.filter((key): key is string => typeof key === "string")
          .map((key) => ({ field: `${issue.instancePath === "/" ? "" : `${field}.`}${key}`, message }));
      }
      return [{ field, message }];
    });
    return validation.body("One or more request fields are invalid.", { errors });
  }
  if (error instanceof Error && "statusCode" in error &&
      typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
    const message = "The HTTP request could not be parsed or has an unsupported format.";
    return validation.body(message, { errors: [{ field: "request", message }] });
  }
  return undefined;
}

export function unavailableProblem(): Problem {
  return unavailable.body("The database is temporarily unavailable.", {});
}

export function internalProblem(requestId: string): Problem {
  return internal.body("The service could not complete the request.", { requestId });
}

export function routeNotFoundProblem(): Problem {
  return notFound.body("The requested route does not exist.", {});
}
