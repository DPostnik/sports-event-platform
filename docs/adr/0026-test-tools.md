# ADR-0026: Test tools and test levels

Status: Accepted

Date: 2026-11-19

## Context

The brief asks for automated tests of core logic and boundaries, a demonstration of how testing scales with system complexity, and names property-based, contract and concurrency tests as optional. [ADR-0021](0021-implementation-boundary.md) requires tests for every part marked as built.

## Decision

Tests are split into three levels. Each level has its own folder and its own command.

| Level | Checks | Needs Docker |
| ----- | ------ | ------------ |
| Domain | Lifecycle transitions, invariants, typed errors, type-level rules | No |
| Persistence | Constraints, indexes, the conditional write, concurrent writers, cache behaviour | Yes |
| API | Routes, error responses, headers, conformance to the OpenAPI description | Yes |

| Tool | Role |
| ---- | ---- |
| Vitest | Test runner for all levels |
| Testcontainers | Starts a real PostgreSQL and a real Redis for the persistence and API levels |
| fast-check | Property-based tests |

- Property-based tests cover the lifecycle: for any sequence of commands, an event never leaves a terminal status, the version never decreases, and a refused command changes nothing.
- Concurrency tests cover [ADR-0009](0009-optimistic-concurrency.md) (two writers with the same `expectedVersion`: exactly one succeeds), [ADR-0007](0007-source-identity.md) (two concurrent creates with the same source identity: one event exists) and [ADR-0016](0016-failure-modes.md) (many concurrent identical reads: one database read).
- Failure tests cover [ADR-0016](0016-failure-modes.md): the cache is stopped, then the database is stopped.

## Alternatives considered

- Jest. Rejected: it needs extra configuration for TypeScript and ES modules. The author has commercial experience with both runners.
- The Node.js built-in test runner. Rejected: fewer features for mocking time and for watch mode, without a benefit here.
- An in-memory database substitute. Rejected: constraints, partial indexes and transaction behaviour are part of what is tested, and a substitute does not run them.
- One shared database started by Docker Compose. Rejected: tests would depend on a manual step and on each other's data.
- Mocking the repository in API tests. Rejected for the API level: the point of that level is the real path. Application code is still unit-tested against in-memory implementations of its ports.

## Consequences

- The domain level runs in seconds without Docker and is the default while writing code.
- The persistence and API levels need Docker and take longer. A reviewer without Docker can still run the domain level.
- The levels show how testing scales: new domain rules add fast tests, new queries add persistence tests, new routes add API tests. No level grows because another one changed.
- Query plans are checked at the persistence level on a populated database ([ADR-0013](0013-indexes.md)).
