# ADR-0005: Time as a UTC instant

Status: Accepted

Date: 2026-11-19

## Context

Consumers are spread across time zones. The brief shows start times without a zone ("2025-07-18 18:30"). A start time without a zone does not name one moment: it means a different instant in each zone.

## Decision

- An event start is one instant. The database stores it as `timestamptz`.
- The API returns time only in UTC, in ISO 8601 with `Z`, for example `2025-07-18T16:30:00Z`.
- Consumers convert the instant to the viewer's local time.
- Input must carry an explicit offset or `Z`. A time without a zone is rejected with a validation error, because the instant would be ambiguous. Input with an offset is normalized to UTC.

## Alternatives considered

- Store the venue time zone as well. This is needed to show "18:30 local time at the venue". Rejected for this scope: it needs a venue entity that the model does not have. It is a known limitation.
- Accept zone-less local time and assume UTC. Rejected: a wrong instant is stored without any error.
- Store local time plus offset as text. Rejected: time-window queries and ordering need a real instant.

## Consequences

- Time-window queries and ordering use one indexed column.
- The brief's example times are local times with an unknown zone. The seed data and examples must pick a zone explicitly and say so.
- "Local time at the venue" cannot be shown from this service's data alone.
