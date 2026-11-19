# ADR-0024: Fastify as the HTTP framework

Status: Accepted

Date: 2026-11-19

## Context

Three accepted decisions land on the HTTP framework: input is validated at the boundary so the domain receives typed values only; the OpenAPI description must not drift from the code; one place maps domain errors to responses ([ADR-0018](0018-error-format.md)). The API has nine routes ([ADR-0017](0017-rest-api.md)).

The author's commercial experience is with NestJS and Express.

## Decision

- The HTTP framework is Fastify.
- Every route declares a schema for its input and its responses. That schema is the single source for three things: runtime validation, the TypeScript types of the handler, and the OpenAPI description.
- Fastify stays in the transport layer. Handlers translate between HTTP and application use cases. Domain and application code do not import Fastify.
- The error mapping of [ADR-0018](0018-error-format.md) lives in one Fastify error handler.

## Alternatives considered

- NestJS, which the author knows. Rejected. It brings its own architecture (modules, controllers, providers, dependency injection), so a reader would see the framework's structure where the brief asks for the author's layering decisions. Decorators also pull a framework dependency into layers that should be free of it. For nine routes it is more framework than the service needs.
- Express, which the author also knows. It does not prevent a good design and does not help with one. Validation, handler types and OpenAPI would be three separate libraries wired by hand, and the OpenAPI description would need a test to stay in sync. This was the fallback.
- Hono. Similar in spirit to Fastify. Not chosen: its strengths are edge and multi-runtime targets, which this service does not need, and Fastify's schema and OpenAPI tooling on Node.js is more established.
- No framework, plain `node:http`. Rejected: routing, parsing and validation would be hand-written code that proves nothing about the problem.

## Consequences

- The OpenAPI description is generated from the route schemas. It cannot drift from the running code.
- A handler cannot read an input field that its schema does not declare; the compiler rejects it.
- Fastify is the second tool that is new to the author, after Kysely ([ADR-0023](0023-kysely.md)). The risk is smaller: it is close to Express in style, a route and a handler function.
- Replacing the framework would touch only the transport layer.
- The schema library used with Fastify is decided together with the test tools (open question 10).
