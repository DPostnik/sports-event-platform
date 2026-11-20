# ADR-0033: Branded types for identifiers only

Status: Accepted

Date: 2026-11-20

## Context

The brief asks to use the type system intentionally. [ADR-0006](0006-identifiers.md) asks for branded ID types, so an event ID cannot be passed where a competitor ID is expected.

The first implementation went further and branded seven values: event ID, competitor ID, sport code, source, external ID, start instant and version. Each had a validating constructor, an error path and tests. The instant was a branded number with its own ISO 8601 parser, converted to and from `Date` at the database boundary. The version was a branded number with nothing to be confused with.

A brand pays off where two values of the same primitive type travel together and can be swapped. That is true for the two IDs. Both are UUID strings, and they appear together in create, in the link rows and in the list filters.

## Decision

Only the event ID and the competitor ID are branded types.

| Value | Type in the domain | Where its format is checked |
| ----- | ------------------ | --------------------------- |
| Event ID, competitor ID | branded string | The validating constructor, called by the HTTP schema and by the row mapper |
| Start time | `Date` | HTTP schema: ISO 8601 with an offset or `Z` ([ADR-0005](0005-time-in-utc.md)). Database: `timestamptz` |
| Version | `number` | HTTP schema: a positive integer. Database: a check |
| Sport code | `string` | HTTP schema. Database: foreign key to `sports` |
| Source, external ID | `string` | HTTP schema. Database: checks |

- The rules of [ADR-0005](0005-time-in-utc.md) are unchanged. Input without a zone is rejected, and output is UTC with `Z`. The HTTP layer enforces both.
- Domain functions receive values whose format is already checked. They check the rules between values: the lifecycle, the version equality, the phase of the sport, two different competitors of the sport of the event.

## Alternatives considered

- Keep all seven brands. Rejected: constructors, error paths and tests for values that cannot be confused with anything, and a time type that must be converted at every boundary.
- Brand the three strings as well (sport code, source, external ID). Rejected: source and external ID appear together only in create. The cost of three more constructors is higher than the risk.
- No brands at all. Rejected: two UUID strings are easy to swap, and [ADR-0006](0006-identifiers.md) asks for the protection.

## Consequences

- The domain has two value types of its own. The rest is `string`, `number` and `Date`.
- The compiler does not catch a source passed in place of an external ID.
- The format rules of the unbranded values live in the HTTP schema and in database constraints, not in the domain. Code that calls the domain without the HTTP layer must pass valid values. Today only tests do that.
- A `Date` can hold an invalid date. The HTTP schema rejects it on input, and the database cannot store one.
- The state of an event stays typed: the status is a discriminated union ([ADR-0002](0002-event-lifecycle.md)) and only a live event has a phase ([ADR-0031](0031-phase-checked-at-run-time.md)).
