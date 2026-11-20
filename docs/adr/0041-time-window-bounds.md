# ADR-0041: The time window of the list includes its start and excludes its end

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0011](0011-read-queries.md) gives the list a time window with `from` and `to`. It does not say whether an event that starts exactly at `from` or exactly at `to` is inside the window.

Consumers build schedules from adjacent windows: one day, then the next day. Many events start at a full hour, and some start at midnight in UTC.

## Decision

- An event is inside the window when `from <= start time < to`.
- `from` and `to` are both optional. A missing bound does not limit the window on that side.

| Window | Event at 2025-07-19T00:00:00Z |
| ------ | ----------------------------- |
| `from=2025-07-18T00:00:00Z&to=2025-07-19T00:00:00Z` | not included |
| `from=2025-07-19T00:00:00Z&to=2025-07-20T00:00:00Z` | included |

- A window whose `to` is not after its `from` contains no event.

## Alternatives considered

- Include both bounds. Rejected: an event at midnight would appear in the window of both days.
- Exclude both bounds. Rejected: an event at midnight would appear in no day.

## Consequences

- Adjacent windows share no event and lose no event. A consumer uses the `to` of one window as the `from` of the next.
- A consumer that wants a whole day sends the start of the next day as `to`, not 23:59:59.
- The rule is built in the list query and has a persistence test.
- This amends [ADR-0011](0011-read-queries.md).
