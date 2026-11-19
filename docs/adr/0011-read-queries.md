# ADR-0011: Two read operations - one event, and one filtered list

Status: Accepted

Date: 2026-11-19

## Context

Design v1 had "read" and "list" with unspecified filters. The consumers are sports sites and apps. Their typical screens decide which queries the service must answer efficiently.

| Consumer screen | Query |
| --------------- | ----- |
| Event page | One event by ID |
| "Today's events" | Events in a time window |
| "Football this week" | Time window and sport |
| "Live now" | Status `live` |
| Competitor page | Events of one competitor |

## Decision

- Two read operations: get one event by its service ID, and list events.
- The list has four optional filters that can be combined: time window (`from`, `to`), sport, status, competitor.
- The list has one fixed order: by start time, then by event ID as a tie-breaker.
- Every list response is limited in size. Pagination is a separate decision (open question 7).
- A `postponed` event keeps its last scheduled start time. In a time-window list it appears on its original date with status `postponed`. Consumers show it as postponed on that day.

Not supported:

- Text search by competitor name.
- Sort orders chosen by the consumer.
- Filtering by source. Consumers do not know sources ([ADR-0007](0007-source-identity.md)).

## Alternatives considered

- One endpoint per screen ("today", "live now", "by competitor"). Rejected: each new combination would need a change in the service. One list with filters covers them.
- Free sort order. Rejected: every order needs its own index and its own pagination key.
- A general query language (for example GraphQL filters or OData). Rejected: the access patterns are few and known; an open query surface makes index design and load prediction impossible.
- Hide postponed events from time-window lists. Rejected: a consumer showing a day's schedule needs to tell users that an event of that day is postponed.

## Consequences

- The set of filter combinations is small and known. Each one can be backed by a named index (open question 7).
- The competitor filter needs the link table of [ADR-0003](0003-sports-and-competitors.md). The list must load competitors for all events of a page in one query, not one query per event.
- The fixed order makes cache keys and pagination simple.
- Text search and custom sorting are known limitations.
- The start time of a `postponed` event is not a confirmed time. The response must make this visible through the status.
