# 04 - Consumer Interface

Brief section 4. Goal: show how downstream consumers (web, mobile, internal services) integrate
with the service. A full frontend is not required.

## Requirements

| ID   | Priority | Requirement                                                                      |
| ---- | -------- | -------------------------------------------------------------------------------- |
| CI-1 | Must     | Provide either a minimal UI or well-documented API examples.                     |
| CI-2 | Must     | The material demonstrates real integration flows, not only a list of endpoints.  |
| CI-3 | Should   | An OpenAPI spec that matches the running service (generated or contract-tested). |
| CI-4 | Should   | Copy-paste curl examples for the main flows, with sample responses.              |
| CI-5 | Could    | A minimal UI or Swagger UI page served by the service.                           |

## Acceptance criteria

- A reviewer can start the service and run every documented example without edits.
- Examples cover: create the two example events from the brief, get one event, list upcoming events,
  filter by sport, paginate, and at least two error cases (validation error, not found or conflict).
- The OpenAPI spec cannot drift silently from the code: it is generated from the route schemas or
  checked by a test.
- Error responses are documented with their codes.

## Open decisions

| Decision          | Options                                                              |
| ----------------- | -------------------------------------------------------------------- |
| Form              | OpenAPI + curl (likely) vs. minimal UI vs. both                      |
| Spec source       | Generated from code schemas vs. hand-written and contract-tested     |
| Interactive docs  | Swagger UI / Scalar served at `/docs` vs. none                       |
| Seed data         | Seed script with the brief's examples vs. only curl create commands  |

## Evidence for reviewers

- `openapi.yaml` (or a `/openapi.json` endpoint).
- `docs/api-examples.md` or a section in the README with curl commands.
