# ADR-0007: Source identity and single ownership of an event

Status: Accepted, amended by [ADR-0028](0028-source-ownership-needs-authentication.md)

Date: 2026-11-19

## Context

Design v1 made create idempotent with a mapping `(sourceId, requestId) -> matchId`. A request ID identifies one request attempt, not the real match. The same match sent again in a new request would create a duplicate.

Data providers already have their own ID for each match. They cannot be expected to store this service's ID: a provider sends the same message to many receivers.

## Decision

- A source is a system that writes events into the service. It is a data provider, or `manual` for an operator tool.
- Every event stores `source` and `external_id`. The `external_id` is the ID the source uses for that match. The pair is unique.
- The service still generates its own ID ([ADR-0006](0006-identifiers.md)).

| Party | ID it uses |
| ----- | ---------- |
| Source, when writing | its own `external_id` |
| Consumers, when reading | the service ID |
| Inside the service | the service ID |

- Create is idempotent on `(source, external_id)`. A repeated create with the same pair returns the stored event and creates nothing. This replaces the `(sourceId, requestId)` mapping of design v1. No separate mapping table is needed.
- An event has exactly one source, and it never changes. A source can change only its own events. A source owns many events.
- Sequence or version numbers of different sources are never compared with each other.

## Alternatives considered

- Keep `(sourceId, requestId)`. Rejected: it does not stop the same match arriving in a new request.
- Require sources to store and send the service ID. Rejected: it pushes this service's identity into every provider.
- Let several sources update one event. Rejected: their updates would overwrite each other, and their version numbers are not comparable. Deciding between sources is reconciliation, see [ADR-0008](0008-ingestion-boundary.md).

## Consequences

- One unique constraint replaces a mapping table.
- A source addresses its event by `(source, external_id)`. A consumer addresses it by the service ID.
- The same real match sent by two sources becomes two events unless something upstream prevents it. This is not solved here.
- How a source's own out-of-order or repeated updates are handled is decided in [ADR-0009](0009-optimistic-concurrency.md).
