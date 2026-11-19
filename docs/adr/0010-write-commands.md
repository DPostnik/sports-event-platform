# ADR-0010: Named write commands instead of a generic update

Status: Accepted

Date: 2026-11-19

## Context

Design v1 listed "update" as one operation. [ADR-0002](0002-event-lifecycle.md) defined the lifecycle and [ADR-0009](0009-optimistic-concurrency.md) the concurrency rule. The set of changes a writer can make to an existing event was still open.

A second question came up: a match also produces goals, cards, fouls and substitutions. Whether these belong to this service decides how large the command set becomes.

## Decision

An existing event changes only through six named commands. There is no generic "update event" operation.

| Command | Meaning | Allowed from | Resulting status | Input besides `expectedVersion` |
| ------- | ------- | ------------ | ---------------- | ------------------------------- |
| start | The event has started | `scheduled` | `live` | optional phase |
| finish | The event has ended | `live` | `finished` | none |
| postpone | Delayed, new start time not known | `scheduled` | `postponed` | none |
| reschedule | A new start time is set | `scheduled`, `postponed` | `scheduled` | new start time |
| cancel | The event will not take place | `scheduled`, `postponed` | `cancelled` | none |
| change phase | The live phase changed | `live` | `live` | new phase |

- Each command accepts only its own input. A command cannot carry fields of another command.
- Each command requires `expectedVersion` and advances the version on success.
- A command sent from a status that is not in "Allowed from" is refused as a transition that is not allowed.
- Creating an event is a separate operation ([ADR-0007](0007-source-identity.md)).

Match actions are not part of this service. Goals, cards, fouls, substitutions and the score are a different kind of data.

| | Schedule and status (this service) | Match actions (not this service) |
| - | ---------------------------------- | -------------------------------- |
| Examples | When, who, which status | Goal, card, free kick, substitution |
| Change rate | A few times in the life of an event | Hundreds of times per match |
| Stored as | Current state, one row per event | An append-only log, one row per action |

A match action does not change the status or the start time of an event. If it were built, it would be a separate log with one "append action" operation and a type field, not more commands on the event. Public provider APIs separate these too: Sportradar exposes the schedule and summary of a sport event apart from its timeline and statistics.

## Alternatives considered

- One generic update that accepts new field values (status, start time, phase). Rejected: it allows meaningless combinations, for example status `finished` with a new start time, and the service would have to guess the intent.
- A single "change status" command with the target status as a parameter. Rejected: the commands need different input (reschedule needs a time, cancel does not); one command would carry optional fields that are valid only for some targets.
- Add commands for match actions (goal, card). Rejected: these are log entries of another service, not state changes of the event.

## Consequences

- The transition table of [ADR-0002](0002-event-lifecycle.md) maps to commands one to one. The domain code has one function per command.
- Input validation is exact per command. The type of each command states what it needs.
- Adding a lifecycle change means adding a command. This is deliberate friction: every new change is named and reviewed.
- The command set does not grow with the number of sports. Only the phase values are sport-specific ([ADR-0004](0004-sport-specific-phase.md)).
- Corrections of event data other than status, start time and phase (for example a wrong competitor) are not supported. The event is cancelled and created again. Known limitation.
- Match actions, score and statistics are out of scope. The system diagram shows them as a neighbouring service.
