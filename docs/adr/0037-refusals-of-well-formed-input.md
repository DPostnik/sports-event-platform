# ADR-0037: A well-formed request that breaks a rule gets status 422 and its own code

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0018](0018-error-format.md) says that its table is the full list of errors, and that the compiler checks that every domain error has a row. The table has two kinds of refusal of a request: status 400 for input in a wrong format, and status 409 for a conflict with the stored state.

The domain refuses three more cases, and the create use case a fourth. None has a row.

| Case | Example |
| ---- | ------- |
| The phase is not a phase of the sport | `3rd_period` for a football event |
| Home and away are the same competitor | Salzburg vs. Salzburg |
| A competitor belongs to another sport | KAC in a football event |
| A competitor in the request does not exist | an ID that no competitor has |

In all four the JSON is correct and the stored event did not change. Sending the same request again never helps. The writer must correct its data.

[ADR-0018](0018-error-format.md) also maps "competitor or sport not found" to status 404. Status 404 says that the resource of the URL does not exist. In a create the URL is `/events`, and the competitor is named in the body.

## Decision

- A request in a correct format that breaks a rule of the domain is refused with status 422.
- Each rule has its own code.
- Status 404 is used only when the event of the URL does not exist.

The full list of errors, which replaces the table of [ADR-0018](0018-error-format.md):

| Situation | Status | Code | Extra members |
| --------- | ------ | ---- | ------------- |
| Invalid input, for example a missing field or a time without a zone | 400 | `VALIDATION_FAILED` | list of field errors |
| The event of the URL does not exist | 404 | `NOT_FOUND` | - |
| Stale `expectedVersion` | 409 | `VERSION_CONFLICT` | `currentVersion` |
| Transition not allowed from the current status | 409 | `TRANSITION_NOT_ALLOWED` | `currentStatus` |
| The phase is not a phase of the sport | 422 | `INVALID_PHASE` | `sport`, `phase` |
| Home and away are the same competitor | 422 | `SAME_COMPETITOR` | `competitorId` |
| A competitor belongs to another sport | 422 | `COMPETITOR_SPORT_MISMATCH` | `competitorId`, `competitorSport`, `eventSport` |
| A competitor in the request does not exist | 422 | `COMPETITOR_NOT_FOUND` | `competitorId` |
| Service overloaded | 503 | `OVERLOADED` | - |
| Database unavailable | 503 | `UNAVAILABLE` | - |
| Unexpected error | 500 | `INTERNAL` | request ID |

What a writer does with each status:

| Status | Meaning | Reaction |
| ------ | ------- | -------- |
| 400 | The request is in a wrong format | Correct the format |
| 422 | The format is correct, the data breaks a rule | Correct the data |
| 409 | The stored event is not what the writer expects | Read the event again and decide again |

- A sport code that does not exist needs no code of its own. No competitor belongs to that sport, so the request is refused with `COMPETITOR_SPORT_MISMATCH`.

## Alternatives considered

- Put the four cases under status 400 and `VALIDATION_FAILED`. Rejected: a consumer could not tell a broken request from a broken rule, and four typed domain errors would become one code.
- Status 409 for the four cases. Rejected: no stored state is in conflict, and reading the event again does not help.
- Keep status 404 for an unknown competitor. Rejected: the writer would read it as "the address `/events` does not exist".

## Consequences

- Four new codes join the public contract. Renaming one is a breaking change.
- The three domain errors and the missing competitor each map to one row. The mapping at the API boundary compiles only when every error has a row.
- `COMPETITOR_NOT_FOUND` is found by the create use case, not by the domain: the repository returns fewer competitors than the request named.
- The `DUPLICATE_EVENT` row stays removed ([ADR-0032](0032-duplicate-guard-not-built.md)).
- This amends [ADR-0018](0018-error-format.md): the table above is now the full list.
