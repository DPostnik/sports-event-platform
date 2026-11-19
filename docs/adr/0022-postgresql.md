# ADR-0022: PostgreSQL as the database

Status: Accepted

Date: 2026-11-19

## Context

The brief requires a relational database of the author's choice and asks to justify tooling decisions. Several earlier decisions need specific database features.

## Decision

The database is PostgreSQL.

| Earlier decision | Needs from the database | PostgreSQL feature |
| ---------------- | ----------------------- | ------------------ |
| Exact-duplicate guard that ignores cancelled events ([ADR-0008](0008-ingestion-boundary.md)) | Uniqueness over a subset of rows | Partial unique index |
| Phase only while the status is `live` ([ADR-0004](0004-sport-specific-phase.md)) | A rule across columns | `CHECK` constraint |
| Time as a UTC instant ([ADR-0005](0005-time-in-utc.md)) | An instant type | `timestamptz` |
| Service-generated identifiers ([ADR-0006](0006-identifiers.md)) | A native UUID type | `uuid` |
| Cursor on start time and ID ([ADR-0012](0012-cursor-pagination.md)) | Comparing a pair of values on an index | Row comparison `(a, b) > (x, y)` |
| One conditional write ([ADR-0009](0009-optimistic-concurrency.md)) | Knowing whether the row changed, and its new state | `UPDATE ... RETURNING` |

## Alternatives considered

- MySQL. Workable. Rejected: it has no partial indexes, so the duplicate guard would need a workaround.
- SQLite. Simplest to run, no container. Rejected: one writer at a time and no network access, so several service instances cannot share it.
- SQL Server or Oracle. Technically fit. Rejected: licensing and a heavy setup for a reviewer.

## Consequences

- Three decisions (partial unique index, row comparison, `RETURNING`) use PostgreSQL-specific or PostgreSQL-friendly SQL. Moving to another engine would mean rewriting those parts of the persistence layer. The domain would not change.
- A reviewer needs Docker to run the service. The setup is one Compose file with PostgreSQL and Redis.
- The integration tests run against a real PostgreSQL, not an in-memory substitute, because the constraints and indexes are part of what is tested.
