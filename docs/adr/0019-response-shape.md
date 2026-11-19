# ADR-0019: Response shape and freshness through standard HTTP headers

Status: Accepted

Date: 2026-11-19

## Context

[ADR-0016](0016-failure-modes.md) serves cached data up to 1 hour old while the database is down and says the consumer must be able to tell. The first proposal wrapped every response in `data` and `meta` with a `stale` flag. That forces every consumer to unwrap the envelope and to handle the flag.

Public provider APIs were checked. Sportradar puts one timestamp, `generated_at`, at the top of the payload and states the cache lifetime in the `Cache-Control` header (`max-age`); some feeds also carry `ETag`. Sportmonks uses an envelope (`data` with `pagination` and `rate_limit`) but no stale flag. The HTTP `Warning` header, once used to mark stale responses, was obsoleted by RFC 9111.

## Decision

Success responses have a small fixed shape and no `meta` block.

One event:

```json
{
  "generatedAt": "2025-07-18T15:31:40Z",
  "event": { "id": "...", "status": "scheduled" }
}
```

A list page:

```json
{
  "generatedAt": "2025-07-18T15:31:40Z",
  "events": [],
  "nextCursor": "..."
}
```

- `generatedAt` is the instant the data was read from the database. A cached response keeps the value it was stored with.
- There is no `stale` flag. A consumer that cares compares `generatedAt` with the current time. A consumer that does not care does nothing.

Freshness is stated with standard HTTP headers.

| Header | Value | Meaning |
| ------ | ----- | ------- |
| `Cache-Control` | `max-age=60` | The response is fresh for 60 seconds |
| `ETag` | derived from the event version, or from the content of a list page | Lets a consumer ask "has it changed?" |
| `Age` | seconds | How long the response has been in the cache |

- A request with `If-None-Match` and a matching `ETag` gets `304 Not Modified` without a body.
- During a database outage a stale response looks like any other. Its `generatedAt` is old and its `Age` is greater than `max-age`.

## Alternatives considered

- An envelope with `data` and `meta` and a `stale` flag in every response. Rejected: every consumer must unwrap it and handle a flag that is almost always false.
- The `Warning: 110` header. Rejected: obsoleted by RFC 9111.
- A custom header such as `X-Data-Stale`. Rejected: `Age` and `Cache-Control` already express it in a standard way that HTTP caches and CDNs understand.
- Return the bare event object, and a bare array for lists. Rejected: a list needs a place for the cursor, and a bare array cannot grow without a breaking change. One event uses the same shape for consistency.

## Consequences

- Consumers handle no special case for stale data.
- A consumer that reads only the body can still judge freshness from `generatedAt`.
- CDNs and consumer-side HTTP caches can cache GET responses without custom rules. This lowers load before it reaches the service.
- Polling with `If-None-Match` is cheap: an unchanged answer costs no body.
- A CDN can serve a response for up to 60 seconds after a delete on write. The "at once" of [ADR-0014](0014-cache-freshness.md) holds for requests that reach the service, not for copies held by caches in front of it.
- `generatedAt` and the header names follow what Sportradar's own APIs do, so the shape is familiar to their consumers.
