# ADR-0029: The list takes a limit parameter

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0012](0012-cursor-pagination.md) sets a page size of 50 by default and 100 at most. The list request of [ADR-0017](0017-rest-api.md) has no parameter to choose the size. The list cache key of [ADR-0014](0014-cache-freshness.md) holds the filters and the cursor, and no page size. The first implementation showed that the promised maximum cannot be used.

## Decision

- `GET /events` accepts an optional `limit`. It is an integer from 1 to 100. The default is 50.
- A value outside the range, or a value that is not an integer, is rejected with status 400 and the code `VALIDATION_FAILED` of [ADR-0018](0018-error-format.md). The list of field errors names `limit`. The value is never clamped.
- The list cache key holds the filters, the cursor and the limit.
- A cursor stays valid when the limit changes between pages. The cursor is a position after the last event of a page, not a page number.

| Request | Result |
| ------- | ------ |
| `GET /events` | 50 events at most |
| `GET /events?limit=20` | 20 events at most |
| `GET /events?limit=100` | 100 events at most |
| `GET /events?limit=0`, `limit=101`, `limit=abc` | 400 `VALIDATION_FAILED` |

## Alternatives considered

- A fixed page size of 50 with no parameter. Rejected: [ADR-0012](0012-cursor-pagination.md) already promises a maximum of 100, and a small page suits a mobile screen.
- Clamp a value outside the range to the nearest bound. Rejected: the consumer gets a page size it did not ask for and no signal. This follows [ADR-0005](0005-time-in-utc.md), which rejects ambiguous input and does not guess.

## Consequences

- Consumers that use different limits create more distinct cache keys. The hit rate falls. Consumers are advised to use the default.
- The list has one more validated parameter, and one more row in the OpenAPI description.
- A consumer can change the limit while it pages, without starting again.
- This amends the parameter list of [ADR-0017](0017-rest-api.md), the cache key of [ADR-0014](0014-cache-freshness.md) and the page size rule of [ADR-0012](0012-cursor-pagination.md).
