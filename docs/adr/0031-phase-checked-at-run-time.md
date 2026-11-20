# ADR-0031: The phase is a string checked at run time

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0004](0004-sport-specific-phase.md) made the phase a discriminated union keyed by the sport code, so the compiler rejects a football event with a hockey phase. [ADR-0003](0003-sports-and-competitors.md) made sports data: a new sport is a row, not a release.

The first implementation showed that the two decisions pull apart. The sport code became two types, literals for the sports with phases and a branded string for the rest. The union needed a mapped type, a generic helper and a type guard.

The gain was small. A phase always enters the service as text, from a request or from a database row. It is checked at run time in any case. The compiler check protected only code that writes a phase as a literal, and only tests do that.

## Decision

- A sport code is one validated string type, the same for every sport.
- An event in status `live` has an optional `phase`, a string. An event in any other status has no `phase` field. This part stays a discriminated union over the status ([ADR-0002](0002-event-lifecycle.md)).
- The domain holds one table from sport code to the list of its phases.

| Sport | Phases |
| ----- | ------ |
| football | `1st_half`, `2nd_half` |
| ice_hockey | `1st_period`, `2nd_period`, `3rd_period` |
| any other sport | none |

- One domain function checks a phase against the table. The commands start and change phase call it.
- A phase that is not in the list of the sport of the event is refused with a typed error. A sport without an entry has no phases, so any phase is refused.
- The phase values, the consumer contract and the storage of [ADR-0004](0004-sport-specific-phase.md) are unchanged.

## Alternatives considered

- Keep the union with mapped and generic types. This was the first implementation. Rejected: it is hard to read, and the same check runs at run time anyway.
- Write the union by hand for the two sports. Rejected: the sport code still splits into literals and "other", and each new sport with phases changes types and every `switch` over them.
- Phases as rows in a database table. Not chosen now: it adds a table and a read to each command. It stays the option for many sports, as in [ADR-0004](0004-sport-specific-phase.md).

## Consequences

- Adding phases for a sport is one entry in the table. No type changes and no migration.
- The compiler no longer rejects a wrong pair of sport and phase written in code. The run-time check and its tests do.
- "Only a live event has a phase" stays a compile-time rule, and the database check keeps it for stored rows.
- A new sport needs no code change, so there is no place for the compiler to point to. Exhaustive checks cover statuses, commands and errors.
- The extension point for phases in [ADR-0021](0021-implementation-boundary.md) is now the table: two sports have an entry, the others have none.
- This amends [ADR-0004](0004-sport-specific-phase.md): the phase in code is no longer a union keyed by the sport.
