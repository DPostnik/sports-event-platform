# ADR-0034: Zod at the HTTP and configuration boundaries, domain checks in the row mapper

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0025](0025-zod.md) put Zod at three boundaries: HTTP requests, rows read from the database, and environment configuration.

The first implementation showed that a row was checked twice. A Zod schema checked its shape. Then the domain constructors checked its values. Both steps answered the same question.

A row is not untrusted in the way a request is. Its shape is fixed by the migrations and typed by the query layer ([ADR-0023](0023-kysely.md)). Its values are limited by the database constraints.

## Decision

- Zod validates HTTP requests and environment configuration. This part of [ADR-0025](0025-zod.md) is unchanged.
- Rows are not parsed with Zod.
- The mapper stays the one place where a row becomes a domain object. It checks what the domain defines:

| Check | How |
| ----- | --- |
| Event ID and competitor IDs | The validating constructors of [ADR-0033](0033-branded-types-for-identifiers-only.md) |
| Status | One of the five statuses of [ADR-0002](0002-event-lifecycle.md) |
| Phase | Present only on a live event |

- A row that fails a check becomes a named corrupt-row error. It never becomes a wrong domain object.
- The mapper does not repeat what a column type already guarantees, for example that a `NOT NULL` text column holds a string.

## Alternatives considered

- Keep Zod on rows. Rejected: two checks of the same row in two styles.
- No check in the mapper, trust the database constraints. Rejected: data can be changed by hand and a migration can be wrong. The check costs a few lines, and without it a bad row would become a wrong domain object.

## Consequences

- The persistence layer does not import Zod.
- The mapper is short and uses the same constructors as the HTTP layer, so an ID rule exists once.
- A corrupt row is an infrastructure failure. It is thrown and translated at the HTTP boundary, like a database error.
- This amends [ADR-0025](0025-zod.md): Zod covers two boundaries, not three. "One style for input, database rows and configuration" no longer includes rows.
