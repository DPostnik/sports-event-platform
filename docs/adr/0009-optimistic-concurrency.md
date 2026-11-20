# ADR-0009: One optimistic concurrency rule for every writer

Status: Accepted, amended by [ADR-0030](0030-domain-decides-commands.md)

Date: 2026-11-19

## Context

Design v1 made a status update conditional on `expectedVersion`. It did not say who the writers are or what happens on a mismatch.

A data provider that only pushes messages cannot know the version stored in this service. After [ADR-0008](0008-ingestion-boundary.md) providers do not write to the service directly. The writers are the reconciliation component upstream and operator tools. Both can read an event before they change it.

## Decision

- Every event has a `version`. It starts at 1 and advances by 1 on each applied change.
- Every change to an existing event must state `expectedVersion`: the version the writer read before deciding.
- The change is applied only if `expectedVersion` equals the stored version. The check is equality, not "greater or equal".
- On a mismatch the service refuses the change with a conflict that carries the current version. The writer reads the event again and decides again. The service does not retry or merge.
- The check and the write are one conditional database statement. There is no read-then-write in application code.
- The rule is the same for every writer. The service has no second mechanism for provider messages.
- Ordering of one provider's messages (late or repeated deliveries) is the responsibility of the reconciliation component. It knows the provider's sequence numbers; this service does not.

| Situation | Result |
| --------- | ------ |
| An operator and the reconciliation component change one event at the same time | One change is applied. The other gets a conflict. |
| Two workers of the reconciliation component process one event | The same. |
| A command is repeated after a timeout | The version has advanced. The repeat gets a conflict and is not applied twice. |

## Alternatives considered

- Last write wins, no version check. Rejected: a writer silently overwrites a change it never saw.
- Accept any `expectedVersion` that is greater than or equal to the stored version. Rejected: a writer cannot have read a version that does not exist yet, so a greater value is an error, not a newer state.
- Pessimistic locking (`SELECT ... FOR UPDATE` across a read and a write). Rejected: it holds a connection and a row lock for the whole decision. Writes are rare ([ADR-0001](0001-load-assumptions.md)), so conflicts are rare and optimistic control is cheaper.
- Also store each provider's message sequence in the service and skip stale messages. Rejected: the service would have to know providers, which [ADR-0008](0008-ingestion-boundary.md) places upstream.

## Consequences

- A writer must read before it writes. A pushing system needs the reconciliation component in front of the service.
- A conflict after a timeout is ambiguous for the writer: its first attempt may have been applied. The writer resolves this by reading the event.
- One conditional statement covers both the version check and the lifecycle check ([ADR-0002](0002-event-lifecycle.md)). When no row is updated, the service reads the event once to tell apart "not found", "stale version" and "transition not allowed".
- Out-of-order provider messages are not detected by this service. This is a known limitation, owned upstream.
- The version also serves as the basis for cache validation (open question 8).
- The exact response format and status code are open question 9.
