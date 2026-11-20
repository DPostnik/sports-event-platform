# ADR-0028: Source ownership is recorded, and enforcing it requires authentication

Status: Superseded by [ADR-0042](0042-writer-authentication.md)

Date: 2026-11-20

## Context

[ADR-0007](0007-source-identity.md) says that a source can change only its own events. The write commands ([ADR-0010](0010-write-commands.md), [ADR-0017](0017-rest-api.md)) address an event by its service ID and carry no source. The `source` of a create comes from the request body.

The service does not know who calls it. It cannot enforce the rule, and the first implementation does not. [ADR-0021](0021-implementation-boundary.md) already says that authentication is not built.

## Decision

- Every event records its source, as in [ADR-0007](0007-source-identity.md). Create stays idempotent on `(source, external_id)`. The unique key enforces it.
- The rule "a source changes only its own events" is not enforced by this implementation.
- The rule is restated as a requirement on the production system:
  - Writers are authenticated.
  - The source is taken from the credentials of the caller and never from the request body.
  - A command on an event of another source is refused as forbidden.
- Authentication of writers is a production requirement, not an optional extra. It is described, not built ([ADR-0021](0021-implementation-boundary.md)).

The check attaches in two places:

| Place | Change |
| ----- | ------ |
| Create use case | The `source` field is filled from the credentials, not from the body |
| Command use cases | One comparison of the source of the caller with the source of the event, before the conditional write |

## Alternatives considered

- Add a `source` field to every command and compare it with the event. Rejected: a claim that nobody verifies proves nothing, and it adds a field to six commands.
- Build API-key authentication now. Rejected for this scope: issue, storage and rotation of keys are a separate concern, and it would not change the design of the event service.
- Drop the source from the event. Rejected: idempotent create needs it.

## Consequences

- Until authentication exists, any caller can change any event. This is the most serious known limitation. The README states it first ([ADR-0021](0021-implementation-boundary.md)).
- Adding authentication later changes no stored data, because the source is already on every event.
- The error table of [ADR-0018](0018-error-format.md) gains a "forbidden" case at that point.
- This amends [ADR-0007](0007-source-identity.md): the single-ownership rule is a requirement and not a guarantee of this implementation.
