# ADR-0013: One index per named query

Status: Accepted, amended by [ADR-0032](0032-duplicate-guard-not-built.md) and [ADR-0035](0035-same-sport-enforced-by-schema.md)

Date: 2026-11-19

## Context

The read queries are fixed ([ADR-0011](0011-read-queries.md)) and the list is paged by a cursor on start time and event ID ([ADR-0012](0012-cursor-pagination.md)). Reads exceed writes by more than 1,000 to 1 ([ADR-0001](0001-load-assumptions.md)).

An index is a separate sorted structure next to the table. It makes reads faster and costs disk space, memory and one extra write for every insert or change of an indexed column.

## Decision

Each query gets one index. There is no index without a named query.

| Query | Index |
| ----- | ----- |
| Event by ID | primary key `events (id)` |
| Events in a time window | `events (start_time, id)` |
| Sport and time window | `events (sport_code, start_time, id)` |
| Status and time window | `events (status, start_time, id)` |
| Events of a competitor | `event_competitors (competitor_id)` |
| Event of a source | unique `events (source, external_id)` - from [ADR-0007](0007-source-identity.md) |
| Exact-duplicate guard | partial unique key - from [ADR-0008](0008-ingestion-boundary.md) |

- Every list index ends with `(start_time, id)`. This is the list order and the cursor. The database selects by the filter and then reads rows that are already in order.
- The primary key of `event_competitors` is `(event_id, competitor_id)`. It also serves loading the competitors of a page of events.

## Alternatives considered

- One index per filter column only (`sport_code`, `status`). Rejected: the database would find the matching rows and then sort them by start time on every request.
- An index for every filter combination (sport and status, sport and competitor, and so on). Rejected: the number of indexes grows quickly, each one costs on every write, and the remaining combinations return few rows.
- No secondary indexes, rely on the cache. Rejected: every cache miss would scan the table, and a cache outage would turn into a database outage.

## Consequences

- The `events` table has six indexes: the primary key, the source key, the `(id, sport_code)` key of [ADR-0035](0035-same-sport-enforced-by-schema.md) and the three list indexes. One new event writes one row and six index entries in `events`, and two rows and six index entries in `event_competitors`. At the peak of 100 writes per second this is small.
- A reschedule or a status change writes a new version of the row and a new entry in each of the six indexes, not only in the indexes that hold the changed column. PostgreSQL skips the index writes only when no indexed column changes.
- The combination "sport and status" has no index of its own. The database uses one of the two indexes and filters the rest. For live events of one sport this is tens of rows. Known compromise.
- The competitor filter orders by a column of another table and needs a join. One competitor has hundreds of events, not millions. Known compromise.
- This table is a design claim until measured. The implementation must check the query plans on a populated database: each query in the table must use its index.
