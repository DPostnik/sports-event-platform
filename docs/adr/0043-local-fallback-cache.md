# ADR-0043: Local fallback cache while the shared cache is down

Status: Accepted

Date: 2026-11-20

## Context

When Redis fails, every read goes to the database. [ADR-0016](0016-failure-modes.md) described a short-lived cache inside each instance for this case and marked it optional. [ADR-0021](0021-implementation-boundary.md) lists it as described. The in-memory implementation of the cache port already exists, but nothing uses it. A cache outage is the case where the database is most exposed.

## Decision

- Add an adapter of the cache port that wraps two caches: Redis as the primary and the in-memory cache as the local one. The function is `createFallbackCache` in `src/infrastructure/cache/fallback-cache.ts`. The composition root wires it when `REDIS_URL` is set. The HTTP layer still talks to the cache port.
- Read from Redis first. When Redis fails, the local cache answers.
- Write to Redis first. When Redis fails, store the entry in the local cache for at most 5 seconds, whatever lifetime the caller asked for.
- Write the local cache only when Redis fails. In normal operation it stays empty. No second copy exists, and no instance serves a local copy that another instance has already deleted from Redis.
- Delete on write removes the entry from the local cache and from Redis.
- The local cache holds at most 1,000 entries. When it is full, it evicts the oldest entry.
- Log every Redis failure as a warning.
- Without `REDIS_URL` the service still runs with no cache at all.
- The 5 seconds and the 1,000 entries are starting estimates. They are configuration, like the pool limits of [ADR-0016](0016-failure-modes.md): `LOCAL_CACHE_TTL_SECONDS` and `LOCAL_CACHE_MAX_ENTRIES`. The Redis command timeout, 200 ms by default, is configuration too: `REDIS_COMMAND_TIMEOUT_MS`.
- Test the two adapters without Docker in `test/persistence/in-memory-cache.test.ts` and `test/persistence/fallback-cache.test.ts`. `test/api/redis-outage.test.ts` checks on the real stack that a repeated read is answered locally for the configured lifetime while Redis is down.

## Alternatives considered

- Write every entry to both caches all the time. This puts a second copy in every instance in normal operation, and a local copy could outlive a delete made by another instance.
- A longer local lifetime, for example 60 seconds. [ADR-0016](0016-failure-modes.md) already rejected it: instances would disagree for up to a minute.
- Use the local cache when `REDIS_URL` is not set. That makes a cache inside each instance the primary cache, which [ADR-0015](0015-shared-cache.md) rejected.
- Keep it described only. The in-memory adapter already existed without a use, and a cache outage is the case where the database is most exposed.

## Consequences

- This amends [ADR-0015](0015-shared-cache.md): the in-memory implementation is now the local fallback of the running service, not a test-only part. It amends [ADR-0016](0016-failure-modes.md): the optional local cache is built. It amends [ADR-0021](0021-implementation-boundary.md): the row "Local cache during a shared-cache outage" becomes built.
- While Redis is down, a delete on write reaches only the instance that handled the command. Another instance can serve the old state of an event for up to 5 seconds. In normal operation nothing changes.
- During a Redis outage the database load drops from one read per request to at most one read per key, per instance, per 5 seconds, for the 1,000 keys the local cache holds. With Redis and the database both down, a local entry is served for at most 5 seconds. The 1-hour stale copies of [ADR-0016](0016-failure-modes.md) live in Redis and are not available.
- A slow but connected Redis still costs each request up to the 200 ms command timeout before the local cache answers. No circuit breaker is built.
- The local cache is lost on restart and is not shared.
