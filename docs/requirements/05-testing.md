# 05 - Testing and Quality

Brief section 5. Goal: tests that protect the core logic and the boundaries, and a test structure
that keeps working as the system grows.

## Requirements

| ID    | Priority | Requirement                                                                  |
| ----- | -------- | ---------------------------------------------------------------------------- |
| TST-1 | Must     | Automated tests for core domain logic.                                       |
| TST-2 | Must     | Automated tests for boundaries (API input, persistence mapping, DB constraints). |
| TST-3 | Must     | Show how the testing approach scales with system complexity.                 |
| TST-4 | Must     | Use TypeScript to reduce runtime uncertainty (strict compiler settings).     |
| TST-5 | Could    | Property-based tests.                                                        |
| TST-6 | Could    | Contract or API tests.                                                       |
| TST-7 | Could    | Concurrency or failure-mode tests.                                           |

## Acceptance criteria

- One command runs the whole suite; a separate fast command runs unit tests only.
- Test layers are visible in the folder structure, for example:
  - unit: domain invariants and lifecycle transitions, no I/O;
  - integration: repositories against a real database (for example, Testcontainers);
  - API: HTTP-level tests of success and error responses.
- Strict TypeScript: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (or reasons
  for not using them); type-check runs in CI.
- Type-level tests for key invariants where useful (for example, `@ts-expect-error` cases).
- The README explains the test pyramid and why each layer exists.
- CI (GitHub Actions) runs lint, type-check and tests on every push.

## Optional items worth considering

- Property-based tests (fast-check) for the lifecycle state machine and value objects.
- Contract test that checks responses against the OpenAPI spec.
- Concurrency test: two parallel conflicting updates; exactly one succeeds.
- Failure-mode test: database unavailable or transaction rollback leaves no partial data.

## Open decisions

| Decision            | Options                                                          |
| ------------------- | ---------------------------------------------------------------- |
| Test runner         | Vitest vs. Jest vs. `node:test`                                  |
| Database in tests   | Testcontainers vs. Docker Compose service vs. in-memory fake     |
| Optional tests      | Which of TST-5..TST-7 to implement within the time box           |
| Coverage reporting  | Report only vs. threshold gate                                   |

## Evidence for reviewers

- `test/` (or co-located `*.test.ts`) split by layer.
- CI workflow file and a green run on the public repository.
- Testing section in the README.
