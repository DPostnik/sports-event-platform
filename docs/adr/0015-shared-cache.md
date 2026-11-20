# ADR-0015: One shared cache for all instances

Status: Accepted, amended by [ADR-0043](0043-local-fallback-cache.md)

Date: 2026-11-19

## Context

The API service runs as several identical instances. [ADR-0014](0014-cache-freshness.md) deletes the cache entry of an event when the event changes. Where the cache lives decides whether that delete reaches every instance.

## Decision

- The cache is one shared system outside the API instances. All instances read from it and write to it.
- The implementation is Redis. It runs next to the database in the local Docker Compose setup.
- Domain and application code depend on a cache interface (a port), not on Redis.
- There are two implementations of the port: Redis for the running service, and an in-memory one used only in fast tests.

## Alternatives considered

- A cache inside each instance. No extra system and the fastest reads. Rejected: a delete on write reaches only the instance that handled the write. The other instances serve the old answer for up to 60 seconds, so a consumer sees the change appear and disappear depending on which instance answers.
- A cache inside each instance plus delete messages broadcast between instances. Rejected: it rebuilds a shared cache in a more complex way.
- Describe the shared cache but ship only the in-memory implementation. Rejected: the delete-on-write decision could not be shown to work across instances, and the design's central read path would stay unverified.

## Consequences

- A delete on write is visible to every instance at once.
- The cache is one more system that can fail. Its outage must not take the service down (open question 8).
- Every cached read costs one network round trip to the cache.
- Swapping the cache technology means writing one adapter.
- The service still keeps no state of its own between requests, so instances can be added or removed freely.
