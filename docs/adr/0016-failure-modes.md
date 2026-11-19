# ADR-0016: Behaviour when a cache entry expires, the cache fails or the database fails

Status: Accepted

Date: 2026-11-19

## Context

Design v1 listed four failure rules without detail. Three different failures need three different answers.

| Failure | What breaks |
| ------- | ----------- |
| A popular cache entry expires | Many identical requests reach the database together |
| The cache is down | The whole read load reaches the database |
| The database is down | There is no source for data and no place to write |

## Decision

### 1. Identical requests share one database read

- Inside one API instance, concurrent requests for the same cache key share one in-flight promise. The first request reads the database. The others wait for its result.
- This is always on. Design v1 enabled it only during a cache outage, but the same burst happens at every expiry of a popular entry.
- It works per instance. With ten instances, up to ten reads reach the database for one key.

### 2. Database concurrency is capped

- Each instance has a connection pool of fixed size. A request that gets no connection within a short wait is refused with "service overloaded".
- During a cache outage this keeps the database alive. Some consumers get an error. Without the cap all of them would.
- A cache error never fails a request. The read goes to the database.
- Pool size and wait time are configuration. The starting values are estimates and must be tuned by measurement.

### 3. Stale data is served when the database is down

A cache entry has two ages.

| Age | Value | Meaning |
| --- | ----- | ------- |
| Fresh until | 60 seconds | After this, the next request reads the database |
| Kept until | 1 hour | After this, the entry is removed |

| State | Entry younger than 60 seconds | Entry between 60 seconds and 1 hour |
| ----- | ----------------------------- | ----------------------------------- |
| Database up | Served from cache | Database is read, cache is refreshed |
| Database down | Served from cache | Served from cache, marked as possibly stale |

- A read with no cache entry at all is refused with "service unavailable" while the database is down.
- Every write is refused with "service unavailable" while the database is down.
- "Fresh" from design v1 now has an exact meaning: younger than 60 seconds.

### Described, not built

- A short-lived cache inside each instance (a few seconds) that takes over while the shared cache is down. It extends the in-flight promise: the result is kept for a few seconds after the read. Optional; built only if time allows.
- A standby database with automatic failover. The cache bridges the failover window for reads.

## Alternatives considered

- Share the in-flight promise only during a cache outage, as in design v1. Rejected: bursts at expiry are the common case.
- No concurrency cap, let the database queue. Rejected: an overloaded database fails for every consumer, including those it could have served.
- When the database is down, refuse every read whose entry is older than 60 seconds. This was the first proposal. Rejected: schedule data changes rarely, so an hour-old schedule is almost always correct, and a marked stale answer serves consumers better than an error.
- Serve stale data without a mark or without an age limit. Rejected: the consumer must be able to tell, and data of unknown age is not acceptable.
- A long local cache during a cache outage, for example 60 seconds. Rejected: a delete on write does not reach other instances, so instances would disagree for up to a minute ([ADR-0015](0015-shared-cache.md)). A few seconds already removes almost all repeated reads.

## Consequences

- This narrows one statement of [ADR-0014](0014-cache-freshness.md): data is at most 60 seconds stale while the database is up. While it is down, marked data can be up to 1 hour old.
- The service stays readable through a database failover for every key that was requested in the last hour.
- A cancelled event can still be served as scheduled, with the stale mark, during a database outage.
- The in-flight promise map and the pool are per-instance state that lives only for the duration of requests. The service stays stateless across requests.
- The tests must cover: many concurrent identical requests cause one database read; a cache failure does not fail the request; a database failure serves marked stale data and refuses writes.
- How the stale mark and the "overloaded" and "unavailable" answers look in the API is open question 9.
