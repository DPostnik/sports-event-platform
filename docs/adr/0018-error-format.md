# ADR-0018: One error format with stable error codes

Status: Accepted

Date: 2026-11-19

## Context

The service can refuse a request for many reasons: invalid input, a missing event, a stale version ([ADR-0009](0009-optimistic-concurrency.md)), a transition that is not allowed ([ADR-0002](0002-event-lifecycle.md)), an exact duplicate ([ADR-0008](0008-ingestion-boundary.md)), overload or a database outage ([ADR-0016](0016-failure-modes.md)). If each reason answers in its own shape, every consumer writes separate handling for each.

## Decision

- Every error response uses one format: RFC 9457 Problem Details, as JSON.
- Besides the standard members (`type`, `title`, `status`, `detail`) every error carries a stable `code`.
- Consumers branch on `code`, not on the text. Texts can change. Codes do not.
- An error can carry extra members that the consumer needs to react.

```json
{
  "type": "https://example.invalid/problems/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "detail": "Expected version 3, current version is 4.",
  "code": "VERSION_CONFLICT",
  "currentVersion": 4
}
```

| Situation | Status | Code | Extra members |
| --------- | ------ | ---- | ------------- |
| Invalid input, for example a missing field or a time without a zone | 400 | `VALIDATION_FAILED` | list of field errors |
| Event, competitor or sport not found | 404 | `NOT_FOUND` | - |
| Stale `expectedVersion` | 409 | `VERSION_CONFLICT` | `currentVersion` |
| Transition not allowed from the current status | 409 | `TRANSITION_NOT_ALLOWED` | `currentStatus` |
| Exact duplicate from another source | 409 | `DUPLICATE_EVENT` | `existingEventId` |
| Service overloaded | 503 | `OVERLOADED` | - |
| Database unavailable | 503 | `UNAVAILABLE` | - |
| Unexpected error | 500 | `INTERNAL` | request ID |

- Three situations share status 409. The `code` tells them apart. This is why the HTTP status alone is not enough.
- The domain returns typed errors and does not know HTTP. One place at the API boundary maps each domain error to a status and a code. The compiler checks that the mapping covers every domain error.
- An unexpected error returns only `INTERNAL` and a request ID. The exception text and stack trace go to the log, never to the response.

## Alternatives considered

- HTTP status only, without a body. Rejected: three different conflicts would look the same.
- A custom error format. Rejected: consumers and tools do not know it, and a standard exists.
- Always answer 200 with an `error` member. Rejected: caches and monitoring rely on the status.
- Throw exceptions through the layers and format them in a global handler. Rejected: the set of possible errors would be invisible in the types.

## Consequences

- A consumer writes one error parser and one switch on `code`.
- The codes are part of the public contract. Renaming one is a breaking change.
- A new domain error does not compile until it has a row in the mapping.
- The table above is the full list of errors. The OpenAPI description documents each one per endpoint.
