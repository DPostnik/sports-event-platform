# ADR-0039: One event is revalidated on every use, and ETags are weak

Status: Accepted

Date: 2026-11-20

## Context

Two decisions disagree about one event.

- [ADR-0014](0014-cache-freshness.md) promises that a change of one event is visible at once. The service deletes its cache entry on every write.
- [ADR-0019](0019-response-shape.md) sends `Cache-Control: max-age=60` with every response. This header speaks to the cache of the consumer and to a CDN. It allows them to reuse the response for 60 seconds without asking the service.

A match is cancelled at 18:00:00. A consumer that fetched the event at 17:59:50 shows it as scheduled until 18:00:50, and the service told it to. "At once" holds only inside the service.

The `ETag` of [ADR-0019](0019-response-shape.md) has a second problem. A strong `ETag` says that two responses are equal byte for byte. The body holds `generatedAt`, which changes with every read of the database while the event stays the same. For a list, an `ETag` "from the content of the page" that includes `generatedAt` changes with every read, and no request ever gets a 304.

## Decision

| Response | `Cache-Control` | `ETag` |
| -------- | --------------- | ------ |
| One event | `no-cache` | `W/"<version>"` |
| A list page | `max-age=60` | `W/"<hash>"` |

- `no-cache` means: a cache may store the response and must ask the service before each reuse. The request carries `If-None-Match` with the stored `ETag`. When the event has the same version, the answer is `304 Not Modified` without a body.
- Every `ETag` is weak. The prefix `W/` says: the meaning is the same, the bytes may differ.
- The `ETag` of one event is its version.
- The `ETag` of a list page is a hash of the ID and the version of each event on the page, in list order, and of the next cursor.
- `generatedAt` is part of no `ETag`.
- The `Age` header and the body of [ADR-0019](0019-response-shape.md) are unchanged.

## Alternatives considered

- Keep `max-age=60` for one event and weaken the promise of [ADR-0014](0014-cache-freshness.md) to "within 60 seconds". Rejected: the delete on write would lose most of its purpose.
- `max-age=5` for one event. Rejected: a change is still late, and a third number has to be explained.
- Strong ETags, with `generatedAt` moved from the body to a header. Rejected: it changes the response shape of [ADR-0019](0019-response-shape.md), and a consumer that reads only the body could no longer judge the age of the data.
- No `ETag` for a list. Considered: a list is fetched once per 60 seconds, so the saving is small. Rejected: the hash is cheap and a 304 saves the largest bodies of the API.

## Consequences

- A cancellation of one event is visible at once to a consumer with an HTTP cache and behind a CDN.
- Every use of one event reaches the service. An unchanged event costs a read of the service cache and a 304 without a body. The load estimate of [ADR-0001](0001-load-assumptions.md) already counts every poll as a request.
- A CDN still takes load for lists. One consequence of [ADR-0019](0019-response-shape.md) changes: a copy that is up to 60 seconds old can exist for a list, not for one event.
- The list `ETag` includes the next cursor, because a new next page changes the response while the events of the page stay the same.
- A changed name of a sport or a competitor changes no `ETag`. Names are reference data and change only by seed ([ADR-0027](0027-names-in-event-responses.md)). Known limitation.
- This amends [ADR-0019](0019-response-shape.md): the `Cache-Control` and `ETag` rows of its header table.
