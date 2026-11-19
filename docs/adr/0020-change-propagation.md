# ADR-0020: Consumers learn about changes by conditional polling

Status: Accepted

Date: 2026-11-19

## Context

Design v1 assumed that consumers poll. Whether the service also publishes change events was open. The load estimate ([ADR-0001](0001-load-assumptions.md)) and the write path depend on the answer.

Schedule data is refreshed within minutes, not at betting latency ([ADR-0001](0001-load-assumptions.md)). Sports data platforms commonly offer two channels: a push feed for real-time delivery and a REST API that consumers also use to fill gaps after a push failure.

## Decision

- This service is the REST channel. Consumers poll.
- Polling is made cheap by [ADR-0019](0019-response-shape.md): `Cache-Control` tells a consumer how often polling is useful, and a request with `If-None-Match` returns `304 Not Modified` without a body when nothing changed.
- Event IDs are stable and are the same in every channel, so data from a push feed and from this API can be joined.
- Publishing change events is described, not built. The design is a transactional outbox: each write command inserts one row describing the change into an outbox table in the same database transaction as the change itself. A separate relay reads the table and publishes to a stream. Consumers of the stream receive each change at least once and use the event version to ignore repeats and old messages.

## Alternatives considered

- Publish to a message broker directly from the request handler after the commit. Rejected: if the process stops between the commit and the publish, the change is lost for subscribers. The outbox makes the change and its message one atomic write.
- Build the outbox and a stream now. Rejected for this scope: it needs a broker, a relay and a consumer to prove anything, and the accepted staleness of 60 seconds is met by polling.
- Server-sent events or WebSockets from this service. Rejected: long-lived connections make instances stateful and change the scaling model; a push feed is a separate product.
- Webhooks to consumers. Rejected for this scope: delivery tracking, retries and consumer endpoint management are a product of their own.

## Consequences

- The read load of [ADR-0001](0001-load-assumptions.md) stays a polling load. The cache and conditional requests carry it.
- The fastest a consumer can see a list change is the 60-second expiry. Consumers that need less must use a push channel, which this service does not provide. Known limitation.
- The write path has one clear hook for the outbox: the transaction of each write command. No domain code changes when it is added.
- The version on every event ([ADR-0009](0009-optimistic-concurrency.md)) already gives stream consumers what they need to order and deduplicate messages.
