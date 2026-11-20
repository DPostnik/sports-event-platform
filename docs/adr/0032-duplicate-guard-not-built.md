# ADR-0032: The exact-duplicate guard is described, not built

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0008](0008-ingestion-boundary.md) placed adapters and reconciliation upstream and kept one interim safeguard inside the service: a unique key on the sport, the sorted competitor IDs and the start instant. It refuses an exact copy of an active event that arrives under another `(source, external_id)`.

The first implementation showed what the guard costs.

| Cost | Detail |
| ---- | ------ |
| A derived column | The sorted pair of competitor IDs on the event row. The database cannot check it against the link table. |
| A partial unique index | One more index on every insert and reschedule. |
| A second conflict | Create and reschedule can both be refused as a duplicate, and the service must look up the event it collided with. |
| A race | Two concurrent creates of the same source identity violate both unique keys. The idempotent create handles only its own key, so one of them could be answered with the duplicate conflict. |

The guard catches exact copies only. A start time that differs by one minute passes.

## Decision

- The guard is not built. There is no derived column, no partial unique index and no duplicate conflict.
- Create has one identity rule: it is idempotent on `(source, external_id)` ([ADR-0007](0007-source-identity.md)).
- The same real match sent by two sources becomes two events. Preventing that is the work of the reconciliation component upstream. It is described, not built.
- The guard stays in the documents as a possible stopgap for a deployment without reconciliation.
- The rest of [ADR-0008](0008-ingestion-boundary.md) is unchanged: one canonical format, adapters and reconciliation upstream.

## Alternatives considered

- Keep the guard and fix the race, for example by serialising creates of one source identity. Rejected: more code around a check that catches exact copies only.
- Check for a duplicate in application code before the insert. Rejected: without a lock two creates can both pass the check. A database key is the only correct form of this guard.

## Consequences

- Create is one transaction with one unique key. A repeated create returns the stored event. There is no other special outcome.
- A reschedule cannot be refused because of another event. No command depends on other events.
- The `events` table has one column and one index less. The guard row of the index table in [ADR-0013](0013-indexes.md) is gone.
- The error table of [ADR-0018](0018-error-format.md) loses the `DUPLICATE_EVENT` row.
- In [ADR-0021](0021-implementation-boundary.md) the guard moves from "Built, interim" to "Described".
- Known limitation: the service does not detect duplicates from different sources. The README lists it.
- One reason for PostgreSQL in [ADR-0022](0022-postgresql.md) and one reason for a SQL-first query layer in [ADR-0023](0023-kysely.md) named the partial unique index. Those reasons are gone. The other reasons of both decisions stand.
- This amends [ADR-0008](0008-ingestion-boundary.md), [ADR-0013](0013-indexes.md), [ADR-0018](0018-error-format.md) and [ADR-0021](0021-implementation-boundary.md).
