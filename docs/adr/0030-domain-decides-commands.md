# ADR-0030: The domain decides a command, the write checks only the version

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0009](0009-optimistic-concurrency.md) made the check and the write one conditional database statement and ruled out any read before the write. That statement had to check the version and the lifecycle ([ADR-0002](0002-event-lifecycle.md)), and the phase of [ADR-0004](0004-sport-specific-phase.md).

The first implementation showed the cost. The lifecycle rules existed twice: once in the domain function, once in the `WHERE` clause of the update. When the update changed no row, the service read the event and ran the domain function anyway, only to name the reason of the refusal.

The read was never the problem. A lost update happens when a write does not check what it overwrites.

## Decision

A command is applied in three steps.

1. Read the event.
2. The domain function takes the event and the command. It checks the version, the status and the command input. It returns the new event or a typed error.
3. Write the new event with one statement that is conditional on the version: `UPDATE ... WHERE id = ? AND version = ?`.

- The lifecycle rules live only in the domain. The SQL does not repeat them.
- The version check in the write is what makes this safe. Every applied change advances the version. If the stored version still equals `expectedVersion`, the stored event is the event the domain judged.
- If the write changes no row, another writer was faster. The command is refused with a version conflict. The service reads the event once more to report the current version. Nothing is retried.
- The rest of [ADR-0009](0009-optimistic-concurrency.md) is unchanged: `expectedVersion` is required, the check is equality, the rule is the same for every writer.

| Situation | Step that refuses | Result |
| --------- | ----------------- | ------ |
| The event does not exist | 1 | Not found |
| `expectedVersion` is not the stored version | 2 | Version conflict |
| The command is not allowed from the status | 2 | Transition not allowed |
| Another writer changes the event between step 1 and step 3 | 3 | Version conflict |

## Alternatives considered

- Keep one conditional statement with the rules in SQL. Rejected: every lifecycle rule is written twice and the two copies can drift. The domain function would exist mainly for tests.
- Generate the `WHERE` clause from the transition table of the domain. This was the first implementation. Rejected: one copy of the table, but the phase check and the mapping of a refused write to an error still needed a second code path.
- Read and write inside one transaction with `SELECT ... FOR UPDATE`. Rejected for the reason given in [ADR-0009](0009-optimistic-concurrency.md): it holds a row lock for the whole decision, and the version check already gives the same safety.

## Consequences

- The rule of requirement API-9 holds. This is a read before a write, not a read-then-write race: the write is refused when the event changed after the read.
- A successful command costs two statements, not one. A lost race costs three. Writes are rare ([ADR-0001](0001-load-assumptions.md)), so the cost is small.
- The domain function is the only definition of the lifecycle. It is tested without a database.
- The database keeps its constraints on the shape of a row, for example the list of statuses. They are a safety net, not a second copy of the transitions.
- The repository becomes smaller: read one event, and write one event if its version is unchanged.
- This amends [ADR-0009](0009-optimistic-concurrency.md), which ruled out the read, and one consequence of [ADR-0002](0002-event-lifecycle.md): the update no longer uses the transition table.
- One argument of [ADR-0023](0023-kysely.md) against TypeORM is weaker now: "load, change, save" is acceptable when the save checks the version. The other arguments of that decision stand.
