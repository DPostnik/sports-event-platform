# 03 - Backend Service Design and Implementation

Brief section 3. Goal: an API for managing and reading sports events, with a clean architecture and
explicit behavior under errors, concurrency and growth.

## Core capabilities

| ID    | Priority | Requirement                                                         |
| ----- | -------- | ------------------------------------------------------------------- |
| API-1 | Must     | Create a sports event.                                              |
| API-2 | Must     | Retrieve a single event.                                            |
| API-3 | Must     | Retrieve collections of events.                                     |
| API-4 | Must     | Support common query patterns efficiently (filters, time windows).  |

## Architectural expectations

| ID     | Priority | Requirement                                                                     |
| ------ | -------- | ------------------------------------------------------------------------------- |
| API-5  | Must     | Clear separation of concerns (transport, application, domain, persistence).     |
| API-6  | Must     | Thoughtful API style (REST, GraphQL, other) with a written justification.       |
| API-7  | Must     | Explicit error-handling strategy, consistent across the API.                    |
| API-8  | Must     | No naive data-access patterns (N+1 queries, unbounded result sets).             |
| API-9  | Must     | No naive concurrency patterns (lost updates, read-then-write races).            |
| API-10 | Must     | Describe how the service behaves under growing load and data volume.            |
| API-11 | Should   | Lifecycle changes (reschedule, status update) are exposed as explicit commands. |
| API-12 | Should   | Input is validated at the boundary; the domain receives typed values only.      |

## Acceptance criteria

- Every endpoint has a request schema; invalid input returns a structured client error.
- One error format for all failures (for example, RFC 9457 Problem Details) with stable error codes.
- Domain errors map to HTTP status codes in one place (404, 409, 422, and so on).
- Collection endpoints are always paginated and have a maximum page size.
- Create is safe to retry (idempotent) or the README says why not.
- Concurrent conflicting updates produce a conflict response, not a silent overwrite.
- Unexpected errors are logged with context and return a generic 500 without internal details.
- Configuration comes from environment variables, validated at startup.
- The service has health / readiness endpoints and shuts down gracefully.

## Scalability topics to address in the README

- Stateless service instances behind a load balancer; horizontal scaling.
- Read-heavy traffic: caching (HTTP caching headers, ETags, CDN), read replicas.
- Data growth: index usage, keyset pagination, partitioning or archiving of old events.
- Connection pool limits and back-pressure; timeouts.
- Change propagation to consumers: outbox pattern / event stream (described, not necessarily built).
- Observability: structured logs, metrics, tracing hooks.

## Open decisions

| Decision          | Options                                                            |
| ----------------- | ------------------------------------------------------------------ |
| API style         | REST vs. GraphQL vs. both                                          |
| HTTP framework    | Fastify vs. Express vs. NestJS vs. Hono                            |
| Validation        | Zod / TypeBox / Valibot; schema shared with OpenAPI generation     |
| Architecture      | Hexagonal (ports and adapters) vs. layered; how strict             |
| Write operations  | Create only vs. create plus lifecycle commands (reschedule, cancel) |
| Change publishing | Transactional outbox implemented vs. documented only               |

## Evidence for reviewers

- `src/` structure that shows the layers.
- API section in the README with the justification of the API style.
- Integration / API tests for success and failure paths (see 05-testing.md).
