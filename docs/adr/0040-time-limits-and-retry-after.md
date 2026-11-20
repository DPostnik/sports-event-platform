# ADR-0040: Two time limits on database work, and Retry-After on every 503

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0016](0016-failure-modes.md) handles a database that is overloaded and a database that is down. It leaves three gaps.

- A database that is up and very slow, for example because a disk is busy or a statement waits for a lock. A request takes a connection and waits without a limit. The next requests do the same, the pool runs empty, and every new request is refused as "overloaded" while the cause is the database. Connections of consumers hang until the consumers give up.
- The "short wait" for a connection has no number.
- Nothing tells a consumer when to try again after a 503. A typical client retries at once. When all clients do, the refused load returns as a wave and keeps the service overloaded.

## Decision

Two limits, both configuration.

| Limit | Starting value | When it is exceeded |
| ----- | -------------- | ------------------- |
| Wait for a connection from the pool | 200 ms | 503 `OVERLOADED` |
| Run time of one statement, the `statement_timeout` of PostgreSQL | 1 second | Treated as "database down" for this request |

- The database enforces the statement limit. It cancels the statement and frees the connection.
- A request that hits the statement limit follows rule 3 of [ADR-0016](0016-failure-modes.md). A read is answered from a cache entry up to 1 hour old. A read without an entry, and every write, is refused with 503 `UNAVAILABLE`.
- The pool wait must lie between two bounds. It is much longer than a normal read, about 10 ms ([ADR-0001](0001-load-assumptions.md)), so that a short burst waits and is served. It is much shorter than the patience of a consumer, usually 1 to 5 seconds, so that the service answers before the consumer gives up.

Every 503 carries a `Retry-After` header. The values are configuration.

| Code | `Retry-After` | Reason |
| ---- | ------------- | ------ |
| `OVERLOADED` | 1 second | An overload is usually short |
| `UNAVAILABLE` | 5 seconds | A database does not return at once |

## Alternatives considered

- Only the pool wait, no statement limit. Rejected: a slow database would look like an overload and would hold every connection.
- One time limit for the whole HTTP request. Rejected: the statement keeps running in the database and holds its connection after the service has answered.
- A long pool wait, for example the 30 seconds that some pool libraries use by default. Rejected: in a real overload a longer queue adds no capacity. Every request waits longer for the same refusal.
- No `Retry-After`, only advice in the README. Rejected: a client that did not read the README retries at once.
- `Retry-After` only for `OVERLOADED`. Rejected: a wave of retries hurts in both cases.

## Consequences

- A slow database fails fast and with the right code. The pool is free again after one second at most.
- The starting values are estimates. They must be tuned by measurement, like the pool size of [ADR-0016](0016-failure-modes.md).
- A statement that the limit cancels wrote nothing: the database rolls it back with its transaction.
- All clients that were refused in the same second return in the same second. A client should add a random delay to the wait. The README gives this advice.
- The tests must cover: a statement over the limit gives a cached answer for a read and 503 `UNAVAILABLE` for a write; every 503 carries `Retry-After`.
- This amends [ADR-0016](0016-failure-modes.md) (the slow database and the number of the pool wait) and [ADR-0018](0018-error-format.md) (the header of the two 503 answers).
