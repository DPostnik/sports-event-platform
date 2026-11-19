# ADR-0017: REST over HTTP with command endpoints

Status: Accepted

Date: 2026-11-19

## Context

The brief asks for a thoughtful API style with a justification. The earlier decisions already fix much of the API surface: a small, closed set of read queries ([ADR-0011](0011-read-queries.md)), an index for each of them ([ADR-0013](0013-indexes.md)), a cache keyed by filters and cursor ([ADR-0014](0014-cache-freshness.md)) and six named write commands ([ADR-0010](0010-write-commands.md)).

## Decision

The API is REST over HTTP with JSON.

| Action | Request |
| ------ | ------- |
| Create an event | `POST /events` |
| Get one event | `GET /events/{id}` |
| List events | `GET /events?sport=&status=&from=&to=&competitor=&cursor=` |
| Start | `POST /events/{id}/start` |
| Finish | `POST /events/{id}/finish` |
| Postpone | `POST /events/{id}/postpone` |
| Reschedule | `POST /events/{id}/reschedule` |
| Cancel | `POST /events/{id}/cancel` |
| Change phase | `POST /events/{id}/phase` |

- The write commands are endpoints with a verb in the path. This is deliberate. The service has no generic update ([ADR-0010](0010-write-commands.md)), so there is no `PATCH /events/{id}`.
- Every consumer gets the same representation of an event. There is no field selection.
- The paths above show the shape. Versioning of the API, exact parameter names and the request bodies are fixed in the OpenAPI description.

## Alternatives considered

- GraphQL. Rejected for this service, for three reasons. The cache is the centre of the read path, and with REST the URL with its parameters is the cache key, for the service, for a CDN and for the consumer's own HTTP cache; GraphQL sends every query to one address. The set of queries is closed and each has an index; GraphQL lets a consumer compose queries that no index backs. The data is flat (an event and its competitors), and consumers of schedule data need the same fields, so field selection brings little.
- GraphQL would fit a service whose consumers have many screens with different field sets and deeply nested data. That is not this service.
- REST with `PATCH /events/{id}` for changes. Rejected: it is the generic update that [ADR-0010](0010-write-commands.md) rules out.
- RPC only (for example gRPC). Rejected for the public surface: consumers are web and mobile products and third parties, and HTTP caching is needed. It remains an option for internal callers.
- Both REST and GraphQL. Rejected: two surfaces to secure, document and keep consistent, without a consumer that needs the second one.

## Consequences

- A GET request is cacheable by URL at every layer.
- Load is predictable: consumers can send only the requests the service was designed and indexed for.
- A consumer that needs fewer fields still receives the full event. Acceptable while the event is small.
- A consumer that needs a new query shape needs a change in the service. This is deliberate.
- Verbs in paths depart from strict resource-style REST. The README must state this as a choice.
- The error format, status codes and the stale mark are the remaining part of open question 9.
