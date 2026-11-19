# 02 - Persistence Layer

Brief section 2. Goal: a relational schema that protects data integrity on its own, and a mapping
layer that keeps the domain free of persistence details.

## Requirements

| ID    | Priority | Requirement                                                                               |
| ----- | -------- | ----------------------------------------------------------------------------------------- |
| PER-1 | Must     | Use a relational database.                                                                |
| PER-2 | Must     | Define the schema with explicit constraints (PK, FK, NOT NULL, UNIQUE, CHECK).            |
| PER-3 | Must     | Index for the expected access patterns, and document the reasoning.                       |
| PER-4 | Must     | Map domain types to rows and back consistently, in one place.                             |
| PER-5 | Must     | Define clear transactional boundaries.                                                    |
| PER-6 | Must     | Avoid leaky abstractions between persistence and domain logic.                            |
| PER-7 | Must     | Document every compromise made in the persistence design.                                 |
| PER-8 | Should   | Schema changes are versioned migrations, reproducible from an empty database.             |
| PER-9 | Should   | Concurrent updates are safe (for example, optimistic locking with a version column).      |

## Acceptance criteria

- The database rejects invalid data even if application code has a bug
  (for example, `CHECK (home_competitor_id <> away_competitor_id)`, status limited to known values).
- Each index maps to a named query pattern in the documentation; no index without a reason.
- Domain objects never expose ORM entities, query builders or raw rows.
- Row-to-domain mapping validates data; a corrupt row produces a typed error, not a silent bad object.
- Each use case that writes data runs in a single, explicit transaction.
- Migrations run with one command on a fresh database (local and in tests).

## Expected access patterns (to validate during design)

- Get one event by ID.
- List upcoming events in a time window, ordered by start time, with pagination.
- Filter by sport (and optionally status) within a time window.
- Events for a given competitor.
- Detect duplicates on create (same sport, competitors and start time; see open decisions).

## Open decisions

| Decision                | Options                                                                 |
| ----------------------- | ----------------------------------------------------------------------- |
| Database                | PostgreSQL (likely) vs. other relational engines                       |
| Query layer             | Raw SQL vs. query builder (Kysely, Knex) vs. ORM (Prisma, Drizzle, TypeORM) |
| Migrations tool         | Tool from the query layer vs. standalone                                |
| ID strategy             | UUID v7 / ULID vs. database sequences                                   |
| Time storage            | `timestamptz` only vs. plus IANA time zone column                       |
| Concurrency control     | Optimistic (version column) vs. pessimistic (`SELECT ... FOR UPDATE`)   |
| Idempotency of creation | Idempotency key table vs. natural unique key vs. both                   |
| Pagination              | Keyset (cursor) vs. offset                                              |

## Evidence for reviewers

- `migrations/**` (or equivalent) with commented constraints and indexes.
- Repository implementation plus mapper with tests against a real database.
- Persistence section in the README: schema diagram, index table, compromises.
