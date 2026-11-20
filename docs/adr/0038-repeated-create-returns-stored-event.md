# ADR-0038: A repeated create returns the stored event and compares nothing

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0007](0007-source-identity.md) makes create idempotent on `(source, external_id)`: a repeated create returns the stored event and creates nothing. This protects a writer that repeats a request after a timeout.

Two things are not decided.

- The status of the response. [ADR-0017](0017-rest-api.md) names the request and no status.
- A repeat with different data. A source creates a match for 18:30 and later sends a create with the same pair for 20:00. It can be a repeat of an old mistake, or the source can believe that this is how a match is moved.

## Decision

- `POST /events` answers 201 when it stored a new event, and 200 when the pair `(source, external_id)` already existed.
- In both cases the body is the stored event.
- The data of a repeated create is not compared with the stored event. A repeat never changes an event and is never refused because its data differs.
- An event changes only through the six commands of [ADR-0010](0010-write-commands.md). A match is moved with `reschedule`.

| Request | Stored before | Result |
| ------- | ------------- | ------ |
| Create, pair is new | nothing | 201, the new event |
| Create, same pair, same data | the event | 200, the stored event |
| Create, same pair, other start time | the event | 200, the stored event with its old start time |

## Alternatives considered

- Compare the data and refuse a different repeat with status 409 and a new code. Rejected: it needs a rule for "the same data", one more error code and one more test, for a case that the response already shows. Considered the safer option for a writer that ignores the response.
- Update the stored event with the data of the repeat. Rejected: the change would pass without `expectedVersion` and break [ADR-0009](0009-optimistic-concurrency.md).
- Answer 201 for a repeat as well. Rejected: the writer could not tell whether its request stored anything.

## Consequences

- A writer learns from status 200 and from the body that the event already existed and what is stored.
- A writer that ignores the status and the body does not notice that its new data was not applied. Known limitation. The README states that create never changes an event.
- There is no new error code.
- This amends [ADR-0007](0007-source-identity.md) (a repeat with different data) and [ADR-0017](0017-rest-api.md) (the status of a create).
