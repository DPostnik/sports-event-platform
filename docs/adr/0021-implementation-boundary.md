# ADR-0021: Implementation boundary - built, extension point, described

Status: Accepted, amended by [ADR-0031](0031-phase-checked-at-run-time.md) and [ADR-0032](0032-duplicate-guard-not-built.md)

Date: 2026-11-19

## Context

The brief describes an open-ended system and says that how it is constrained is part of the evaluation. The design document describes a whole platform; the implementation is one service. Each part needs an explicit place on one side of the line.

## Decision

Three categories:

- **Built**: implemented and tested in this repository.
- **Extension point**: the code has a named place where the feature attaches, and the mechanism is shown with at least one case.
- **Described**: explained in the documentation and drawn on the diagram. No code.

| Part | Category | Decision |
| ---- | -------- | -------- |
| Domain model: events, competitors, sports, lifecycle, typed errors | Built | [ADR-0002](0002-event-lifecycle.md), [ADR-0003](0003-sports-and-competitors.md) |
| Relational schema, constraints, migrations, indexes | Built | [ADR-0013](0013-indexes.md) |
| REST API: create, get, list, six write commands | Built | [ADR-0017](0017-rest-api.md), [ADR-0010](0010-write-commands.md) |
| Idempotent create on source identity | Built | [ADR-0007](0007-source-identity.md) |
| Exact-duplicate guard | Built, interim | [ADR-0008](0008-ingestion-boundary.md) |
| Optimistic concurrency | Built | [ADR-0009](0009-optimistic-concurrency.md) |
| Cursor pagination and list filters | Built | [ADR-0011](0011-read-queries.md), [ADR-0012](0012-cursor-pagination.md) |
| Shared cache with delete on write and expiry | Built | [ADR-0014](0014-cache-freshness.md), [ADR-0015](0015-shared-cache.md) |
| In-flight read sharing, database concurrency cap, stale data on database outage | Built | [ADR-0016](0016-failure-modes.md) |
| Error format, response shape, conditional requests | Built | [ADR-0018](0018-error-format.md), [ADR-0019](0019-response-shape.md) |
| OpenAPI description and runnable examples | Built | - |
| Sport-specific phases | Extension point: two sports typed, others generic | [ADR-0004](0004-sport-specific-phase.md) |
| New sports | Extension point: a row in the sports table | [ADR-0003](0003-sports-and-competitors.md) |
| Cache technology | Extension point: cache port with two implementations | [ADR-0015](0015-shared-cache.md) |
| Events with more than two competitors | Extension point: the schema allows it, the commands do not | [ADR-0003](0003-sports-and-competitors.md) |
| Provider adapters | Described | [ADR-0008](0008-ingestion-boundary.md) |
| Reconciliation of providers | Described | [ADR-0008](0008-ingestion-boundary.md) |
| Ordering of one provider's messages | Described, owned upstream | [ADR-0009](0009-optimistic-concurrency.md) |
| Change events: outbox and stream | Described | [ADR-0020](0020-change-propagation.md) |
| Match actions, score, statistics | Described as a neighbouring service | [ADR-0010](0010-write-commands.md) |
| Load balancer, several instances, CDN | Described | - |
| Read replicas, standby database with failover, partitioning by date | Described | [ADR-0001](0001-load-assumptions.md), [ADR-0016](0016-failure-modes.md) |
| Local cache during a shared-cache outage | Described; built only if time allows | [ADR-0016](0016-failure-modes.md) |
| Authentication, authorization, rate limiting per consumer | Described | - |
| Metrics and tracing | Described; structured logs are built | - |

Two rows have no earlier decision and are decided here:

- Authentication and authorization are not built. In this exercise the `source` of a write is taken from the request. In production it must come from the caller's credentials, so that a source cannot write as another source. Until then the single-ownership rule of [ADR-0007](0007-source-identity.md) is a convention, not a guarantee.
- The service is built and tested as one instance. It keeps no state between requests, so it can run as several instances. This is a design property, not a tested one.

## Alternatives considered

- Build more of the platform (adapters, a stream, several services). Rejected: breadth would replace depth in the one service the brief asks for.
- Build only create and read, describe the rest. Rejected: concurrency, caching and failure behaviour are where the design is hardest and they can only be judged in code.
- Leave the boundary implicit. Rejected: a reader could not tell a missing feature from a deliberate cut.

## Consequences

- Every "Described" row is a known limitation of the implementation and is listed as such in the README.
- Every "Built" row must have tests. A row without tests is moved to "Described" or the tests are written.
- The security gap is the most serious limitation and is stated first in the README.
- When time runs short, the order of cuts is: local cache during a cache outage, then stale data on database outage, then the conditional-request support. The domain, persistence and concurrency rows are not cut.
