# ADR-0036: The service stores the current state only; actual start and end times are not stored

Status: Accepted

Date: 2026-11-20

## Context

`docs/requirements/01-domain-model.md` lists "History of changes: current-state only with version vs. stored domain events / audit trail" as an open decision. No ADR closed it.

A common alternative model gives each status its own data: `started_at` on a live event, `finished_at` on a finished one, `cancelled_at` and a cancellation reason on a cancelled one. The question is whether these belong to this service.

[ADR-0010](0010-write-commands.md) already separates schedule and status (this service) from match actions (another service).

## Decision

- An event row holds the plan and the current state: sport, competitors, scheduled start time, status, phase and version. It holds no history.
- These are not stored:

| Not stored | Example |
| ---------- | ------- |
| Actual start time | when the first whistle blew |
| Actual end time | when the match ended |
| Time of a cancellation or postponement | when the producer sent the command |
| Reason of a cancellation | "pitch unplayable" |
| Earlier start times | the start before a reschedule |

- The rule for any new field: a plan or the current state belongs to this service. A fact about the course of the match belongs to the match-actions service of [ADR-0010](0010-write-commands.md). The actual start is the first match action. Taking it would bring the period starts, the match clock and the end time with it.
- "When did this service last change the row" is this service's own fact. The `updated_at` column holds it. It is internal and is not part of the API.
- Earlier values and the time of each transition belong to the change events of [ADR-0020](0020-change-propagation.md). Each outbox row records one change and its time. Described, not built.
- A cancellation reason is free text from a producer. It is a case of the metadata extension that the brief names, not part of the lifecycle.
- A possible extension inside this scope is a flag that the scheduled start is confirmed. One provider's public API has `start_time_confirmed` on a sport event. Its timeline endpoint lists `match_started` and `match_ended` as timeline entries, apart from the sport event itself. Not built.

## Alternatives considered

- Store `started_at`, `finished_at` and `cancelled_at` on the event, with values sent by the producer. Rejected: these are facts about the course of the match, two services would hold them, and the service has nothing to check them against because real matches start late.
- The same columns filled from the service clock. Rejected: that is the time the service received the command, not the time of the match. Consumers would read it as the kick-off. The receive time is already `updated_at`.
- A table of transitions in this service. Rejected: it is the outbox of [ADR-0020](0020-change-propagation.md) under another name.

## Consequences

- A consumer cannot read the actual start or end time from this API. Known limitation, listed in the README.
- A rescheduled event does not show its earlier start time. A postponed event keeps its last scheduled start ([ADR-0011](0011-read-queries.md)). Known limitation.
- The event type differs by status only in the phase. The union carries little status-specific data. Known compromise.
- Every statement that changes an event sets `updated_at`.
- This closes the open decision "History of changes" of the domain requirements. It amends no ADR. It applies [ADR-0010](0010-write-commands.md) and [ADR-0020](0020-change-propagation.md).
