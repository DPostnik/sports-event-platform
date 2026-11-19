# ADR-0023: Kysely as the query layer

Status: Accepted

Date: 2026-11-19

## Context

The brief leaves the ORM or query layer open ("your choice, or none") and expects no leaky abstractions between persistence and domain logic. Several accepted decisions are stated in terms of SQL: one conditional write ([ADR-0009](0009-optimistic-concurrency.md)), a cursor that compares a pair of values ([ADR-0012](0012-cursor-pagination.md)), a partial unique index ([ADR-0008](0008-ingestion-boundary.md)).

The author's commercial experience is with TypeORM on PostgreSQL. That counts for a choice the author must defend.

## Decision

- The query layer is Kysely, a typed SQL query builder, on the `pg` driver.
- Queries are written as SQL in TypeScript. The compiler checks table names, column names and result types against the schema types.
- Schema changes are versioned migrations run by Kysely's migrator. Constraints and indexes are written as explicit SQL inside the migrations.
- Kysely row types stay inside the persistence layer. A mapper converts rows to domain types and validates them. The domain does not import Kysely.

## Alternatives considered

- TypeORM, the tool the author knows. Rejected. Its usual way of working is "load an entity, change it, save it", which is the read-then-write that [ADR-0009](0009-optimistic-concurrency.md) rules out. The conditional write and the cursor comparison need its query builder or raw SQL anyway. Entity classes with database decorators tend to become the domain objects, which is the leak the brief warns about. TypeORM in data-mapper mode with separate domain types was the fallback.
- Raw SQL through the driver. Full control. Rejected: the compiler cannot see inside a query string, so a wrong column name or a wrong result type shows only at run time. The brief asks to use TypeScript to reduce runtime uncertainty, and the database boundary is where such errors cost most.
- Prisma. Rejected: its own schema language and generated client hide the SQL; partial indexes and row comparison need raw queries.
- Drizzle. Close to Kysely in spirit. Not chosen: Kysely stays nearer to plain SQL and has no schema-definition layer of its own to learn.

## Consequences

- Every query is visible SQL. The author must be able to read and explain each one. Kysely does not reduce the SQL knowledge needed; it adds type checking on top.
- The query layer is new to the author. This is a stated risk, accepted because the tool is small and maps one to one to SQL.
- The schema types must match the migrations. They are generated from the database or checked by the integration tests, so they cannot drift silently.
- Popularity is not the reason for the choice, but the tool is not exotic: in the week of 2026-11-12 npm reported about 32 million downloads for `kysely` and about 7 million for `typeorm`. Download counts include CI runs and transitive use, so they show adoption only roughly.
