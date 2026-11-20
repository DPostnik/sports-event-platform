import swagger from "@fastify/swagger";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Cache } from "#src/application/cache.ts";
import type { Clock } from "#src/application/clock.ts";
import type { EventUseCases } from "#src/application/event-use-cases.ts";
import type { EventView } from "#src/application/event-view.ts";
import type { Command } from "#src/domain/commands.ts";
import type { EventId } from "#src/domain/ids.ts";
import {
  baseErrors,
  commandErrors,
  createErrors,
  eventErrors,
  eventProblem,
  internalProblem,
  phaseCommandErrors,
  routeNotFoundProblem,
  sendProblem,
  singleEventErrors,
  transportProblem,
  databaseProblem,
} from "#src/http/problems.ts";
import {
  createBody,
  encodeCursor,
  eventParams,
  eventResponse,
  listQuery,
  listResponse,
  phaseBody,
  rescheduleBody,
  startBody,
  toEventResponse,
  versionBody,
} from "#src/http/schemas.ts";

interface AppOptions {
  readonly events: Pick<EventUseCases, "create" | "get" | "list" | "command">;
  readonly clock: Clock;
  readonly cache: Cache | undefined;
  readonly checkReadiness: () => Promise<void>;
  readonly databaseFailure: (error: unknown) => "OVERLOADED" | "UNAVAILABLE" | undefined;
  readonly retryAfterSeconds: Readonly<Record<"OVERLOADED" | "UNAVAILABLE", number>>;
  readonly logger?: boolean;
}

const healthResponse = z.strictObject({ status: z.literal("ok") });
function matchesIfNoneMatch(header: string | undefined, opaqueTag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;

  // A quoted tag may contain a comma. Compare its opaque value for a weak match.
  const tags = /[ \t]*(?:W\/)?("[^"]*")[ \t]*(?:,|$)/gy;
  let matched = false;
  while (tags.lastIndex < header.length) {
    const tag = tags.exec(header);
    if (!tag) return false;
    if (tag[1] === opaqueTag) matched = true;
  }
  return matched;
}

const emptyQuery = z.strictObject({});

export async function buildApp(options: AppOptions) {
  const { events, clock, cache, checkReadiness, databaseFailure, retryAfterSeconds, logger = false } = options;
  function sendDatabaseProblem(reply: FastifyReply, code: "OVERLOADED" | "UNAVAILABLE") {
    return sendProblem(reply.header("Retry-After", retryAfterSeconds[code]), databaseProblem(code));
  }

  function handleError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
    const invalid = transportProblem(error);
    if (invalid !== undefined) return sendProblem(reply, invalid);

    const failure = databaseFailure(error);
    if (failure !== undefined) {
      request.log.warn({ err: error, code: failure }, "Database request failed");
      return sendDatabaseProblem(reply, failure);
    }
    request.log.error({ err: error }, "Unexpected request failure");
    return sendProblem(reply, internalProblem(request.id));
  }

  const app = Fastify({
    logger,
    frameworkErrors(error, request, reply) {
      handleError(error, request, reply);
    },
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  app.setNotFoundHandler((_request, reply) => sendProblem(reply, routeNotFoundProblem()));

  await app.register(swagger, {
    openapi: { openapi: "3.1.0", info: { title: "Sports Events API", version: "1.0.0" } },
    transform: jsonSchemaTransform,
  });

  function singleEvent(view: EventView): z.output<typeof eventResponse> {
    return { generatedAt: clock.now().toISOString(), event: toEventResponse(view) };
  }

  async function readCachedEvent(key: string, id: EventId) {
    const raw = await cache?.get(key);
    if (raw === undefined) return undefined;
    const body = eventResponse.parse(JSON.parse(raw));
    const age = Math.floor((clock.now().getTime() - Date.parse(body.generatedAt)) / 1000);
    return body.event.id === id && age >= 0 && age < 60 ? { body, age } : undefined;
  }

  app.post("/events", {
    schema: {
      summary: "Create an event or return the stored event for the source identity",
      querystring: emptyQuery,
      body: createBody,
      response: { 200: eventResponse, 201: eventResponse, ...createErrors },
    },
  }, async (request, reply) => {
    const result = await events.create(request.body);
    if (!result.ok) return sendProblem(reply, eventProblem(result.error));
    const { view, created } = result.value;
    return reply.code(created ? 201 : 200).send(singleEvent(view));
  });

  app.get("/events/:id", {
    schema: {
      summary: "Get an event",
      params: eventParams,
      querystring: emptyQuery,
      headers: z.looseObject({ "if-none-match": z.string().optional() }),
      response: { 200: eventResponse, 304: z.null().describe("Event version unchanged"), ...singleEventErrors },
    },
  }, async (request, reply) => {
    const id = request.params.id;
    const key = `event:${id}`;
    let entry = await readCachedEvent(key, id).catch((err: unknown) => {
      request.log.warn({ err }, "Failed to read cached event");
      return undefined;
    });
    if (!entry) {
      const result = await events.get(id);
      if (!result.ok) return sendProblem(reply, eventProblem(result.error));
      const body = singleEvent(result.value);
      await cache?.set(key, JSON.stringify(body), 3600).catch((err: unknown) => {
        request.log.warn({ err }, "Failed to cache event");
      });
      entry = { body, age: 0 };
    }
    const opaqueTag = `"${String(entry.body.event.version)}"`;
    reply.header("ETag", `W/${opaqueTag}`).header("Cache-Control", "no-cache").header("Age", String(entry.age));
    if (matchesIfNoneMatch(request.headers["if-none-match"], opaqueTag)) {
      return reply.code(304).send(null);
    }
    return entry.body;
  });

  app.get("/events", {
    schema: {
      summary: "List events by start time and ID",
      querystring: listQuery,
      response: { 200: listResponse, ...eventErrors },
    },
  }, async (request) => {
    const { sport, status, from, to, competitor, cursor, limit = 50 } = request.query;
    const page = await events.list({
      ...(sport === undefined ? {} : { sport }),
      ...(status === undefined ? {} : { status }),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
      ...(competitor === undefined ? {} : { competitorId: competitor }),
    }, cursor, limit);
    return {
      generatedAt: clock.now().toISOString(),
      events: page.views.map(toEventResponse),
      nextCursor: page.nextCursor === undefined ? undefined : encodeCursor(page.nextCursor),
    };
  });

  async function runCommand(id: EventId, command: Command, reply: FastifyReply) {
    const result = await events.command(id, command);
    if (!result.ok) return sendProblem(reply, eventProblem(result.error));
    await cache?.delete(`event:${id}`).catch((err: unknown) => {
      reply.log.warn({ err }, "Failed to invalidate cached event");
    });
    return reply.code(200).send(singleEvent(result.value));
  }

  const basicCommandSchema = {
    params: eventParams,
    querystring: emptyQuery,
    body: versionBody,
    response: { 200: eventResponse, ...commandErrors },
  };
  app.post("/events/:id/start", {
    schema: {
      ...basicCommandSchema,
      summary: "Start a scheduled event",
      body: startBody,
      response: { 200: eventResponse, ...phaseCommandErrors },
    },
  }, (request, reply) => {
    const { expectedVersion, phase } = request.body;
    return runCommand(request.params.id, {
      kind: "start",
      expectedVersion,
      ...(phase === undefined ? {} : { phase }),
    }, reply);
  });
  app.post("/events/:id/finish", {
    schema: { ...basicCommandSchema, summary: "Finish a live event" },
  }, (request, reply) => runCommand(request.params.id, { ...request.body, kind: "finish" }, reply));
  app.post("/events/:id/postpone", {
    schema: { ...basicCommandSchema, summary: "Postpone a scheduled event" },
  }, (request, reply) => runCommand(request.params.id, { ...request.body, kind: "postpone" }, reply));
  app.post("/events/:id/reschedule", {
    schema: { ...basicCommandSchema, summary: "Set a new start time", body: rescheduleBody },
  }, (request, reply) => runCommand(request.params.id, { ...request.body, kind: "reschedule" }, reply));
  app.post("/events/:id/cancel", {
    schema: { ...basicCommandSchema, summary: "Cancel a scheduled or postponed event" },
  }, (request, reply) => runCommand(request.params.id, { ...request.body, kind: "cancel" }, reply));
  app.post("/events/:id/phase", {
    schema: {
      ...basicCommandSchema,
      summary: "Change the phase of a live event",
      body: phaseBody,
      response: { 200: eventResponse, ...phaseCommandErrors },
    },
  }, (request, reply) => runCommand(request.params.id, { ...request.body, kind: "changePhase" }, reply));

  app.get("/health", {
    schema: {
      summary: "Check service liveness",
      querystring: emptyQuery,
      response: { 200: healthResponse, ...baseErrors },
    },
  }, () => ({ status: "ok" }));
  app.get("/ready", {
    schema: {
      summary: "Check database readiness",
      querystring: emptyQuery,
      response: { 200: healthResponse, ...eventErrors },
    },
  }, async (request, reply) => {
    try {
      await checkReadiness();
    } catch (error) {
      request.log.warn({ err: error }, "Database readiness check failed");
      return sendDatabaseProblem(reply, databaseFailure(error) ?? "UNAVAILABLE");
    }
    return { status: "ok" };
  });
  app.get("/openapi.json", {
    schema: { hide: true, querystring: emptyQuery, response: { 200: z.looseObject({}), ...baseErrors } },
  }, () => ({ ...app.swagger() }));

  return app;
}
