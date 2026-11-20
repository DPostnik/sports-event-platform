# Implementation plan

The implementation is built layer by layer. Each step leaves a working, tested layer. The decisions behind each step are in `docs/adr/`.

Order of cuts when time runs short is fixed in [ADR-0021](adr/0021-implementation-boundary.md): step 5 shrinks first; steps 2 to 4 are not cut.

## Step 1 - Skeleton

- `package.json`, Node.js version pin, strict `tsconfig`, ESM.
- Linter with the layer import rules of `AGENTS.md`.
- Vitest with three projects: domain, persistence, API.
- Docker Compose with PostgreSQL and Redis.
- Empty layer folders and one trivial test per level.

Done when: `typecheck`, `lint` and `test:domain` pass; a deliberate forbidden import fails the linter.

## Step 2 - Domain

- Branded types for the event ID and the competitor ID. Other values are plain types (ADR-0033).
- Event as a discriminated union over the five statuses, with the live phase checked per sport at run time (ADR-0002, ADR-0004, ADR-0031).
- The six commands as pure functions: current event and input in, new event or typed error out (ADR-0010).
- Create with exactly one home and one away competitor of the event's sport (ADR-0003).
- Typed domain errors.
- Unit tests, type-level tests, and property-based tests of the lifecycle (ADR-0026).

Done when: `test:domain` passes without Docker and the domain imports nothing outside itself.

## Step 3 - Persistence

- Migrations: `sports`, `competitors`, `events`, `event_competitors`, constraints and the indexes of ADR-0013.
- Kysely schema types and the row-to-domain mapper with validation.
- Repository: idempotent create (ADR-0007), version-checked write (ADR-0009, ADR-0030), get, list with filters and cursor (ADR-0011, ADR-0012).
- Seed data: two sports, four competitors, the two example events of the brief.
- Tests: each constraint rejects bad data; concurrent writers; concurrent creates; cursor stability; query plans on a populated database.

Done when: `test:persistence` passes against a real PostgreSQL.

## Step 4 - API

- Application use cases on top of the repository port.
- Fastify routes of ADR-0017 with Zod schemas (ADR-0025).
- Error mapping (ADR-0018) and response shape (ADR-0019), without caching headers yet.
- Generated OpenAPI description, served by the service.
- Configuration from environment, validated at startup; health and readiness endpoints; graceful shutdown.
- Tests: every route, every error code, conformance of responses to the OpenAPI description.

Done when: `test:api` passes and the two example events of the brief can be created and read with curl.

## Step 5 - Cache and failure behaviour

- Cache port, Redis and in-memory implementations (ADR-0015).
- Read-through for one event and for list pages; delete on write; 60-second expiry (ADR-0014).
- `Cache-Control`, `ETag`, `Age`, conditional requests (ADR-0019).
- In-flight read sharing and the connection pool cap (ADR-0016).
- Stale data during a database outage (ADR-0016).
- Tests: delete on write is visible at once; many identical reads cause one database read; cache stopped; database stopped.

Done when: `npm test` passes on all levels.

## Step 6 - Submission

- `README.md` with every section the brief requires, built from the ADRs.
- `AI_Reflection.txt`.
- `docs/api-examples.md` with curl commands and sample responses.
- GitHub Actions: lint, typecheck and all test levels.
- A fresh clone check: follow the README from zero on a clean checkout.

Done when: a reviewer with Node.js and Docker can clone, start and exercise the service using only the README.
