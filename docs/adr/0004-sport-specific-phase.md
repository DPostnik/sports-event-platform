# ADR-0004: Sport-specific data as a live phase

Status: Accepted, amended by [ADR-0031](0031-phase-checked-at-run-time.md)

Date: 2026-11-19

## Context

Sports differ. Football has halves, ice hockey has periods, tennis has sets. [ADR-0003](0003-sports-and-competitors.md) left open where such differences live.

The public APIs reviewed in ADR-0003 keep the schedule-level event identical across sports. They put sport-specific detail into a second, detailed match status next to the generic one. Sportradar exposes both `status` and `match_status`.

A further concern: every sport-specific value becomes something each consumer must map and handle.

## Decision

The generic status from [ADR-0002](0002-event-lifecycle.md) stays the only status. It is the same for all sports.

An event in status `live` may carry one optional sport-specific field, `phase`. In every other status `phase` is absent.

| Sport | Phases |
| ----- | ------ |
| football | `1st_half`, `2nd_half` |
| ice_hockey | `1st_period`, `2nd_period`, `3rd_period` |
| any other sport | no phase (always absent) |

In code the phase is a discriminated union keyed by the sport code.

```ts
type LivePhase =
  | { sport: 'football'; phase: '1st_half' | '2nd_half' }
  | { sport: 'ice_hockey'; phase: '1st_period' | '2nd_period' | '3rd_period' }
  | { sport: string; phase?: never }; // sketch only - the real type must keep the first two cases narrow
```

The sketch shows intent. The exact type is an implementation detail.

The phase is set by the command that starts the event and changed by a separate command. Each change advances the version and requires `expectedVersion`.

Consumer contract:

- The generic status is complete on its own. A consumer that ignores `phase` still shows correct data.
- `phase` is additive detail.
- Consumers must tolerate phase values they do not know.
- The API documentation lists the phases per sport.

## Alternatives considered

- No sport-specific data at all. Simplest. Rejected: the brief asks to anticipate additional sports and to use the type system intentionally. One small field shows the extension mechanism.
- Sport-specific values inside the single status field (for example `2nd_half` as a status). Rejected: every consumer would have to know every sport to answer "is it live?".
- A JSON column with free-form sport-specific fields. Rejected: the reviewed provider APIs show no sport-specific fields at schedule level, and untyped JSON gives the compiler nothing to check.
- Phases stored as rows in a database table. More flexible with many sports. Rejected for now: the compiler could not check phases. It is an option when the number of typed sports grows.

## Consequences

- Adding phases for a sport is one new union case. Exhaustive checks point to every place that must handle it. No schema migration is needed.
- The database stores `phase` as nullable text with a check that it is null unless the status is `live`. Whether a value fits the sport is validated in code, on write and when a row is mapped back to the domain.
- The order of phases is not enforced, so a producer can correct a wrong phase.
- Known limitations: extra time, overtime, penalty shoot-outs and breaks are not modeled. Scores and statistics are out of scope.
- Consumers carry a mapping from phase codes to display text. The contract above keeps that optional.
