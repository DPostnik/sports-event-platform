# Sports Event API

The service tracks match schedules and live status. It stores events in PostgreSQL and caches reads in Redis. A writer creates an event and moves it through its lifecycle with six named commands. A reader gets one event or a filtered, paged list.

This repository holds one TypeScript service, its tests, and the written design: a system description, 42 decision records (ADRs) and the requirements. The README summarizes them and links to the ADR for each decision. Where it says "built", the code and a test exist. Where it says "described", the design is written down and no code exists.

Contents:

1. [Run locally](#run-locally)
2. [Write events locally](#write-events-locally)
3. [System overview and architecture](#system-overview-and-architecture)
4. [Domain model](#domain-model)
5. [Persistence](#persistence)
6. [API](#api)
7. [Behaviour under load and failure](#behaviour-under-load-and-failure)
8. [Testing](#testing)
9. [Tooling choices](#tooling-choices)
10. [Design decisions and alternatives](#design-decisions-and-alternatives)
11. [Assumptions and known limitations](#assumptions-and-known-limitations)
12. [What I would change with more time](#what-i-would-change-with-more-time)
13. [Further reading](#further-reading)

## Run locally

Install Node.js 24 with npm (`.nvmrc` pins 24) and start Docker with Compose v2. Run these commands from the repository root.

```sh
npm ci
docker compose up -d --wait
export DATABASE_URL='postgresql://sports:sports@127.0.0.1:5432/sports'
export REDIS_URL='redis://127.0.0.1:6379'
npm run migrate
npm run seed
npm start 2>&1 | tee -a api.log
```

The start command shows API output in the terminal and appends it to `api.log` in the repository root. The file includes startup errors and request logs and survives restarts. Git ignores it.

The seed creates two matches: Salzburg vs. Sturm (football) and KAC vs. Capitals (ice hockey). In a second terminal, check database readiness and read the football match.

```sh
curl --fail http://127.0.0.1:3000/ready
curl --fail http://127.0.0.1:3000/events/0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90
```

Readiness returns `{"status":"ok"}`. On a fresh database, the match has status `scheduled`, version `1` and a start time of `2025-07-18T16:30:00.000Z`. The service publishes its OpenAPI description at `/openapi.json`.

Press Ctrl-C in the service terminal to stop the API. Run `docker compose down` to stop PostgreSQL and Redis. The PostgreSQL volume retains the event data.

### Commands

Node.js 24 runs the TypeScript files directly, so there is no build step. The compiler only checks types.

| Command | Purpose | Docker |
| ------- | ------- | ------ |
| `npm run typecheck` | Compile without emitting | no |
| `npm run lint` | Lint, including the layer import rules | no |
| `npm run format` | Format files with Prettier | no |
| `npm run format:check` | Check formatting without writing | no |
| `npm run test:domain` | Domain tests | no |
| `npm run test:persistence` | Persistence tests against real PostgreSQL and Redis | yes |
| `npm run test:api` | HTTP-level tests against the real stack | yes |
| `npm test` | All three levels | yes |
| `npm run migrate`, `npm run seed` | Apply migrations, load reference data and example events | needs the Compose database |

The tests start their own containers through Testcontainers and do not use `docker-compose.yml`. The GitHub Actions workflow `.github/workflows/ci.yml` runs on every push and pull request: format check, lint, typecheck, then the domain, persistence and API tests.

### Configuration

The service reads environment variables and validates them at startup. An invalid value stops the service with a message. Integer settings accept 1 to 2,147,483,647.

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `DATABASE_URL` | none, required | PostgreSQL connection URL |
| `REDIS_URL` | unset | Redis URL. When unset, the service runs without a cache |
| `DB_POOL_SIZE` | `10` | Connections per instance ([ADR-0016](docs/adr/0016-failure-modes.md)) |
| `DB_POOL_WAIT_MS` | `200` | Wait for a free connection before refusing as overloaded ([ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)) |
| `DB_STATEMENT_TIMEOUT_MS` | `1000` | PostgreSQL `statement_timeout` ([ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)) |
| `OVERLOADED_RETRY_AFTER_SECONDS` | `1` | `Retry-After` of a 503 `OVERLOADED` |
| `UNAVAILABLE_RETRY_AFTER_SECONDS` | `5` | `Retry-After` of a 503 `UNAVAILABLE` |
| `WRITER_KEYS` | `{}` | JSON object: lowercase SHA-256 key hash to source name. Unset means read-only ([ADR-0042](docs/adr/0042-writer-authentication.md)) |
| `HOST` | `0.0.0.0` | Listen address |
| `PORT` | `3000` | Listen port |

## Write events locally

GET requests are public. POST requests require a bearer key. Set `WRITER_KEYS` to a JSON object that maps lowercase SHA-256 key hashes to source names. Leaving it unset enables read-only access. Create takes the source from the key. Commands require a key for the event's source.

Follow the [API examples](docs/api-examples.md) to generate a local key, create both matches and run a command.

The API does not create sports or competitors. They are reference data loaded by the seed ([ADR-0027](docs/adr/0027-names-in-event-responses.md)). A writer needs these competitor IDs to create an event.

| Competitor ID | Name | Sport |
| ------------- | ---- | ----- |
| `0198c5a0-0000-7000-8000-000000000001` | Salzburg | `football` |
| `0198c5a0-0000-7000-8000-000000000002` | Sturm | `football` |
| `0198c5a0-0000-7000-8000-000000000003` | KAC | `ice_hockey` |
| `0198c5a0-0000-7000-8000-000000000004` | Capitals | `ice_hockey` |

The seed events belong to the source `manual`. The sports are `football` (Football) and `ice_hockey` (Ice Hockey). The example start times are read as Austrian local time, UTC+2 on both dates, because the times have no zone ([ADR-0005](docs/adr/0005-time-in-utc.md)).

## System overview and architecture

The service is one stateless HTTP service. Writers (an operator tool, or a reconciliation component upstream) create and change matches. Readers (web, mobile and internal services) poll. A shared Redis cache sits in front of PostgreSQL, the source of truth. The scope is match schedules and statuses. The live clock, goals, cards and scores belong to a neighbouring service ([ADR-0010](docs/adr/0010-write-commands.md)).

```mermaid
flowchart LR
    Writers[Writers] --> API[API service]
    Readers[Readers] --> API
    API --> Cache[("Shared cache")]
    API --> DB[("Relational database")]
```

[`docs/system-design.md`](docs/system-design.md) has a second diagram: the production target with providers, adapters, reconciliation, CDN, load balancer, replicas, standby and an outbox relay. Only the box "Built" in that diagram exists as code ([ADR-0021](docs/adr/0021-implementation-boundary.md)).

### Layers

```
src/
  domain/          pure TypeScript: types, lifecycle, commands, typed errors
  application/     use cases and ports (repository, cache, clock, ID generator)
  infrastructure/  persistence (Kysely, migrations, mapper) and cache (Redis, in-memory)
  http/            Fastify routes, Zod schemas, error mapping
  config/          environment configuration
  main.ts          composition root: the only place that wires implementations to ports
```

| Layer | May import |
| ----- | ---------- |
| `domain` | nothing outside `domain`, no third-party library |
| `application` | `domain` |
| `infrastructure` | `application`, `domain` |
| `http` | `application`, `domain` |
| `main.ts` | everything |

`infrastructure` and `http` never import each other. ESLint enforces these rules, and a forbidden import fails `npm run lint`. Files are imported by full path (`#src/...`, `#test/...`), never relatively. The cache is a port with a Redis adapter ([ADR-0015](docs/adr/0015-shared-cache.md)). An in-memory adapter exists, but the composition root wires only Redis, and no test uses the in-memory one.

### Create flow

1. The API checks the bearer key and takes the source from it. It validates the body.
2. The use case loads the two competitors, then the domain checks them (different, same sport as the event) and builds a `scheduled` event with version 1.
3. One transaction inserts the event with `ON CONFLICT (source, external_id) DO NOTHING`, inserts the two competitor links when the event is new, and reads the stored event.
4. The response is 201 for a new event and 200 for a repeat. A repeat returns the stored event ([ADR-0038](docs/adr/0038-repeated-create-returns-stored-event.md)).

### Command flow

1. The API checks the key. The use case reads the event and compares its source with the key's source (403 on mismatch).
2. The domain function checks `expectedVersion`, the lifecycle and the input, and returns a new event or a typed error ([ADR-0030](docs/adr/0030-domain-decides-commands.md)).
3. One statement writes the event: `UPDATE ... WHERE id = ? AND version = ?`. If no row changes, another writer was faster and the command is refused with a version conflict. Nothing is retried.
4. After the commit, the API deletes the cache entry of the event.

### Read flow

```mermaid
sequenceDiagram
    participant C as Consumer
    participant A as API
    participant K as Cache
    participant D as Database
    C->>A: GET event or list
    A->>K: lookup key
    alt fresh hit
        K-->>A: cached result
    else miss or older than 60 seconds
        A->>D: read (concurrent identical reads share one)
        D-->>A: rows
        A->>K: populate key
    end
    A-->>C: response with Cache-Control, ETag, Age
```

A cache error never fails a request: the read goes to the database. Details are in [Behaviour under load and failure](#behaviour-under-load-and-failure).

## Domain model

Sports and competitors are reference data. An event links one sport and two competitors, one home and one away. A competitor belongs to exactly one sport ([ADR-0003](docs/adr/0003-sports-and-competitors.md)). In code an event holds the sport code and the two competitor IDs. The names are read with the event and live in the application's `EventView`.

```mermaid
classDiagram
    class Sport {
        code
        name
    }
    class Competitor {
        CompetitorId id
        name
    }
    class Event {
        EventId id
        source
        externalId
        startsAt : Date
        version
        status
        phase : only when live
    }
    Sport "1" --> "*" Competitor : has
    Sport "1" --> "*" Event : has
    Event "1" --> "2" Competitor : home and away
```

The lifecycle has five statuses ([ADR-0002](docs/adr/0002-event-lifecycle.md)). Status changes only through commands from producers. The service never changes status by its own clock.

```mermaid
stateDiagram-v2
    [*] --> scheduled
    scheduled --> live: start
    scheduled --> postponed: postpone
    scheduled --> cancelled: cancel
    scheduled --> scheduled: reschedule
    postponed --> scheduled: reschedule
    postponed --> cancelled: cancel
    live --> live: change phase
    live --> finished: finish
    finished --> [*]
    cancelled --> [*]
```

An event in status `live` may carry a phase: `1st_half` or `2nd_half` for football, `1st_period` to `3rd_period` for ice hockey. Other sports have none ([ADR-0004](docs/adr/0004-sport-specific-phase.md), [ADR-0031](docs/adr/0031-phase-checked-at-run-time.md)).

### How the types enforce correctness

| Technique | Where | What it prevents |
| --------- | ----- | ---------------- |
| Discriminated union on `status` | `src/domain/event.ts` | A phase on a non-live event does not compile (`phase?: never`). A type-level test checks this with `@ts-expect-error` |
| Branded IDs | `src/domain/ids.ts` | An event ID passed where a competitor ID is expected. A validating constructor is the only way to make one ([ADR-0033](docs/adr/0033-branded-types-for-identifiers-only.md)) |
| `Result<T, E>` values | `src/domain/result.ts` | Expected failures are values. The caller must check `ok` before it reads the value ([ADR-0018](docs/adr/0018-error-format.md)) |
| Exhaustive `never` checks | commands, error mapping | A new command, status or error that is not handled fails the compile. ESLint also checks `switch` exhaustiveness |
| Commands as pure functions | `src/domain/commands.ts` | `applyCommand(event, command)` returns a new event or a typed error and changes nothing. It is the only definition of the lifecycle |
| One table of allowed statuses per command | `ALLOWED_FROM` | Transitions are defined in one place. A status that no command allows is terminal |
| Strict compiler settings | `tsconfig.json` | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`. No `any`, no `!`, no `@ts-ignore` |

The domain reads no clock and generates no IDs. It imports no database, HTTP or third-party code.

### Domain trade-offs

- Phase is a string checked at run time against one table per sport. The compiler no longer rejects a wrong sport and phase pair. A new sport with phases is one table entry, with no type change and no migration ([ADR-0031](docs/adr/0031-phase-checked-at-run-time.md)).
- Only the two IDs are branded. Start time is a `Date`, version a `number`, and the format rules of other values live in the HTTP schema and in database constraints. The compiler cannot catch a source passed in place of an external ID ([ADR-0033](docs/adr/0033-branded-types-for-identifiers-only.md)).
- Time is one UTC instant. Input without an offset is rejected. The venue time zone is not stored ([ADR-0005](docs/adr/0005-time-in-utc.md)).
- The service stores the current state and a version only. No history, no actual start or end time ([ADR-0036](docs/adr/0036-current-state-only.md)).
- An event changes only through six commands. There is no generic update ([ADR-0010](docs/adr/0010-write-commands.md)).

## Persistence

PostgreSQL holds four tables, created by four versioned migrations (`src/infrastructure/persistence/migrations/`). `npm run migrate` brings an empty database to the current schema ([ADR-0022](docs/adr/0022-postgresql.md), [ADR-0023](docs/adr/0023-kysely.md)).

```mermaid
erDiagram
    sports ||--o{ competitors : has
    sports ||--o{ events : has
    events ||--|{ event_competitors : has
    competitors ||--o{ event_competitors : "takes part"
    sports {
        text code PK
        text name
    }
    competitors {
        uuid id PK
        text sport_code FK
        text name
    }
    events {
        uuid id PK
        text source
        text external_id
        text sport_code FK
        timestamptz start_time
        text status
        text phase
        int version
        timestamptz created_at
        timestamptz updated_at
    }
    event_competitors {
        uuid event_id PK
        uuid competitor_id PK
        text sport_code
        text role
    }
```

### Constraints

The database rejects invalid data even when the application has a bug.

| Table | Constraints |
| ----- | ----------- |
| `sports` | primary key `code`; code format check; non-empty name |
| `competitors` | primary key; foreign key to `sports`; non-empty name; unique `(id, sport_code)` |
| `events` | primary key; foreign key to `sports`; source format check; external ID length 1 to 128; status in the five values; version above 0; phase is null unless status is `live`; unique `(source, external_id)`; unique `(id, sport_code)` |
| `event_competitors` | primary key `(event_id, competitor_id)`, so one competitor cannot appear twice in an event; role is `home` or `away`; unique `(event_id, role)`; foreign keys `(event_id, sport_code)` and `(competitor_id, sport_code)` that force the competitor and the event to share a sport ([ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)) |

### Indexes

Each index serves a named query ([ADR-0013](docs/adr/0013-indexes.md)). Every list index ends with `(start_time, id)`, which is the list order and the cursor.

| Index | Query it serves |
| ----- | --------------- |
| `events` primary key `(id)` | Get one event |
| `events_start_time_id_idx (start_time, id)` | List in a time window, and the unfiltered list |
| `events_sport_code_start_time_id_idx (sport_code, start_time, id)` | Sport with a time window |
| `events_status_start_time_id_idx (status, start_time, id)` | Status (for example live now) |
| `event_competitors_competitor_id_idx (competitor_id)` | Events of one competitor |
| `events_source_external_id_key (source, external_id)` | Idempotent create and lookup of a stored event |
| `event_competitors` primary key and `(event_id, role)` key | Load the home and away competitors of an event in the same statement |
| `events_id_sport_code_key`, `competitors_id_sport_code_key` | No query. Targets of the composite foreign keys ([ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)) |

The query-plan tests fill 50,000 events and check with `EXPLAIN` that each list query reads its index, without a sort, and that a deep cursor starts inside the index ([ADR-0013](docs/adr/0013-indexes.md), [ADR-0012](docs/adr/0012-cursor-pagination.md)).

### Transaction boundaries

| Operation | Boundary |
| --------- | -------- |
| Create | One explicit transaction: insert the event, insert two link rows, read the stored event. The competitor lookup before it is a separate read |
| Command | One statement, atomic by itself: `UPDATE ... WHERE id = ? AND version = ?`. It sets `updated_at`. It needs no transaction ([ADR-0030](docs/adr/0030-domain-decides-commands.md)) |
| Reads | One statement. Event, sport and both competitors come back through joins, so a list never runs one query per event |

A statement that exceeds the time limit is cancelled, and PostgreSQL rolls back the transaction it belongs to ([ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)).

### Row-to-domain mapper

`src/infrastructure/persistence/mapper.ts` is the one place where a row becomes a domain object. It uses the same ID constructors as the HTTP layer and checks the status and that a phase appears only on a live event. A failing row throws a `CorruptRowError`, which the HTTP layer treats as an unexpected failure (500 `INTERNAL`). Zod is not used in the persistence layer, and Kysely types do not leave it ([ADR-0034](docs/adr/0034-validation-boundaries.md)).

### Compromises

- "Exactly one home and one away competitor" is not one database constraint. The schema limits each role to one per event, and the create transaction writes both links. Nothing in the schema forces both links to exist. The read statements use inner joins, so an event without both links would not be returned ([ADR-0003](docs/adr/0003-sports-and-competitors.md)).
- The lifecycle rules are in the domain only. The database checks the status values and the phase rule, not the transitions ([ADR-0030](docs/adr/0030-domain-decides-commands.md)).
- A command costs two statements (read, then conditional write) and three when it loses a race. Writes are rare, so this is cheap ([ADR-0030](docs/adr/0030-domain-decides-commands.md)).
- The sport and "sport and status" filters have no joint index. The database uses one of the two and filters the rest. The competitor filter joins another table and sorts ([ADR-0013](docs/adr/0013-indexes.md)).
- `events` has six indexes. A reschedule or status change adds an entry to each of them, because PostgreSQL skips index writes only when no indexed column changes. One of the six, the `(id, sport_code)` key, exists only as a foreign-key target, and `competitors` has one more such key ([ADR-0013](docs/adr/0013-indexes.md), [ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)).
- The sport code is stored on the event and repeated on its link rows. The composite keys make a difference impossible ([ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)).
- `updated_at` is internal and not in the API ([ADR-0036](docs/adr/0036-current-state-only.md)).
- The migrations were edited in place while nothing was deployed. After a first deployment, every schema change is a new migration ([ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)).

## API

The API is REST over JSON ([ADR-0017](docs/adr/0017-rest-api.md)). The OpenAPI 3.1 description is generated from the route schemas and served at `/openapi.json`. A test checks that real responses match it. There is no Swagger UI.

| Method and path | Purpose | Auth |
| --------------- | ------- | ---- |
| `POST /events` | Create an event. Body: `externalId`, `sport`, `startsAt`, `homeCompetitorId`, `awayCompetitorId` | bearer key |
| `GET /events/{id}` | Get one event | public |
| `GET /events` | List with `from`, `to`, `sport`, `status`, `competitor`, `cursor`, `limit` | public |
| `POST /events/{id}/start` | `scheduled` to `live`, optional `phase` | bearer key |
| `POST /events/{id}/finish` | `live` to `finished` | bearer key |
| `POST /events/{id}/postpone` | `scheduled` to `postponed` | bearer key |
| `POST /events/{id}/reschedule` | `scheduled` or `postponed` to `scheduled`, new `startsAt` | bearer key |
| `POST /events/{id}/cancel` | `scheduled` or `postponed` to `cancelled` | bearer key |
| `POST /events/{id}/phase` | Change the phase of a `live` event | bearer key |
| `GET /health`, `GET /ready` | Liveness. Readiness runs `SELECT 1` and returns 503 when the database fails | public |
| `GET /openapi.json` | The OpenAPI description | public |

Every command body carries `expectedVersion`. Request bodies and query strings reject unknown fields. [`docs/api-examples.md`](docs/api-examples.md) has copy-paste curl flows.

An event response has this shape. The names come with the event ([ADR-0027](docs/adr/0027-names-in-event-responses.md)).

```json
{
  "generatedAt": "2026-11-20T19:35:21.735Z",
  "event": {
    "id": "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
    "source": "manual",
    "externalId": "seed-football-salzburg-sturm",
    "sport": { "code": "football", "name": "Football" },
    "startsAt": "2025-07-18T16:30:00.000Z",
    "competitors": [
      { "id": "0198c5a0-0000-7000-8000-000000000001", "name": "Salzburg", "role": "home" },
      { "id": "0198c5a0-0000-7000-8000-000000000002", "name": "Sturm", "role": "away" }
    ],
    "version": 1,
    "status": "scheduled"
  }
}
```

A live event also has `phase`.

A list response has `generatedAt`, `events` and, except on the last page, `nextCursor`. There is no envelope and no stale flag ([ADR-0019](docs/adr/0019-response-shape.md)).

### Why REST and not GraphQL

The URL with its parameters is the cache key for the service, a CDN and the consumer's own HTTP cache. GraphQL sends every query to one address. The set of queries is closed and each has an index, while GraphQL would let a consumer compose queries that no index backs. The data is flat and every consumer needs the same fields. Verbs in the command paths (`/events/{id}/start`) depart from strict resource-style REST. This is a deliberate choice: the service has no generic update, so there is no `PATCH /events/{id}`, and each lifecycle change is a named command ([ADR-0017](docs/adr/0017-rest-api.md), [ADR-0010](docs/adr/0010-write-commands.md)). There is no field selection and no path versioning.

### Errors

Every error is RFC 9457 Problem Details (`application/problem+json`) with a stable `code`. Consumers branch on `code`, not on text ([ADR-0018](docs/adr/0018-error-format.md), [ADR-0037](docs/adr/0037-refusals-of-well-formed-input.md), [ADR-0042](docs/adr/0042-writer-authentication.md)).

| Status | Code | When | Extra members |
| ------ | ---- | ---- | ------------- |
| 400 | `VALIDATION_FAILED` | Wrong format, unknown field, a time without a zone, bad `limit` or cursor, unparsable request | `errors` (field and message) |
| 401 | `UNAUTHORIZED` | Missing, malformed or unknown bearer key. Sent with `WWW-Authenticate: Bearer` | none |
| 403 | `FORBIDDEN` | A command on an event of another source | none |
| 404 | `NOT_FOUND` | The event of the URL does not exist, or the route does not exist | none |
| 409 | `VERSION_CONFLICT` | `expectedVersion` is not the stored version | `currentVersion` |
| 409 | `TRANSITION_NOT_ALLOWED` | The command is not allowed from the current status | `currentStatus` |
| 422 | `INVALID_PHASE` | The phase is not a phase of the event's sport | `sport`, `phase` |
| 422 | `SAME_COMPETITOR` | Home and away are the same competitor | `competitorId` |
| 422 | `COMPETITOR_SPORT_MISMATCH` | A competitor belongs to another sport | `competitorId`, `competitorSport`, `eventSport` |
| 422 | `COMPETITOR_NOT_FOUND` | A competitor in the request does not exist | `competitorId` |
| 500 | `INTERNAL` | Unexpected error. The exception goes to the log, not to the response | `requestId` |
| 503 | `OVERLOADED` | No connection from the pool within the wait. `Retry-After` 1 | none |
| 503 | `UNAVAILABLE` | Database down or a statement over the time limit. `Retry-After` 5 | none |

Writers react by status. 400: correct the format. 422: correct the data. 409: read the event again and decide again. 401 comes before payload parsing, and 403 comes before the version and lifecycle checks. The 503 values are configuration.

A client that receives a 503 should add a random delay to the `Retry-After` wait. All clients refused in the same second would otherwise return in the same second ([ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)).

### Idempotent create

Create is idempotent on `(source, external_id)`. The source comes from the key, `externalId` from the body. A new pair returns 201. A known pair returns 200 and the stored event. The data of a repeat is not compared. A repeat never changes an event, even when its start time or competitors differ, and it is never refused for that reason. A writer that ignores the status and body will not notice that its new data was not applied. A match moves only through `reschedule` ([ADR-0038](docs/adr/0038-repeated-create-returns-stored-event.md), [ADR-0007](docs/adr/0007-source-identity.md)).

### Optimistic concurrency

Every command states `expectedVersion`, the version the writer read. The domain compares by equality, and the write is conditional on the same version. A mismatch returns 409 `VERSION_CONFLICT` with `currentVersion`. The service never retries or merges. After a timeout, a repeated command gets a conflict instead of being applied twice, and the writer reads the event to learn what happened ([ADR-0009](docs/adr/0009-optimistic-concurrency.md), [ADR-0030](docs/adr/0030-domain-decides-commands.md)).

### Pagination and filters

The list is ordered by start time, then event ID. A cursor means "continue after this event" and holds that pair. `limit` is an integer from 1 to 100, default 50. A value outside the range is rejected with 400 and never clamped. There is no page number, row skip or total count. The cursor is opaque. A consumer sends it back unchanged with the same filters and may change `limit` between pages. To jump, use the time window. The window includes `from` and excludes `to`, so adjacent windows share no event. A postponed event keeps its last scheduled start and appears on that day with status `postponed` ([ADR-0012](docs/adr/0012-cursor-pagination.md), [ADR-0029](docs/adr/0029-list-page-size-parameter.md), [ADR-0041](docs/adr/0041-time-window-bounds.md), [ADR-0011](docs/adr/0011-read-queries.md)).

### Caching headers and conditional requests

| Response | `Cache-Control` | `ETag` |
| -------- | --------------- | ------ |
| One event | `no-cache` | `W/"<version>"` |
| A list page | `max-age=60` | `W/"<hash of event IDs, versions and next cursor>"` |

`Age` states how long the response sat in the cache. `If-None-Match` with a matching tag returns 304 without a body. One event uses `no-cache`, so a consumer cache or CDN asks the service before each reuse and sees a change at once. Every `ETag` is weak, and `generatedAt` is part of none, because it changes with every database read ([ADR-0019](docs/adr/0019-response-shape.md), [ADR-0039](docs/adr/0039-revalidation-and-weak-etags.md)). A consumer judges stale data from `generatedAt` and `Age`.

### Writer authentication

Create and the six commands need `Authorization: Bearer <key>`. The service hashes the key with SHA-256 and looks it up in `WRITER_KEYS`, which maps hashes to source names. Several hashes may map to one source. The create body has no `source` field. A command on another source's event returns 403. GET routes are public. The OpenAPI description marks the write operations with the bearer scheme ([ADR-0042](docs/adr/0042-writer-authentication.md)).

## Behaviour under load and failure

### Load assumptions

These figures are the author's estimates, not provider data. Real traffic is not public, and real consumers probably cache on their side ([ADR-0001](docs/adr/0001-load-assumptions.md)).

| Parameter | Value |
| --------- | ----- |
| New events per year | 400,000 to 1,000,000, sized for 1,000,000 |
| Rows after 5 years | about 5 million |
| Writes per event over its life | 5 to 10 |
| Write rate | below 1 per second on average, 50 to 100 per second at peak (bulk import) |
| Read rate | 2,400 requests per second on average, 10,000 to 12,000 at peak |
| Acceptable staleness | lists up to 60 seconds. One event: none in the normal case, up to 60 seconds after a lost cache delete ([ADR-0014](docs/adr/0014-cache-freshness.md)) |

Reads exceed writes by more than 1,000 to 1. With a 90% cache hit rate, the peak leaves about 1,200 database reads per second. At a cautious 10 ms per read, about 12 reads are in flight. The measured best case is 1 to 2 ms in the database, on 50,000 events, one connection, all data in memory and a development machine. During a cache outage all 12,000 requests per second reach the database, about 120 in flight, which is more than a small pool. That case is the reason for the pool cap and the refusals below.

### Scalability topics

| Topic | Status | How |
| ----- | ------ | --- |
| Stateless instances, horizontal scaling | Design property, partly tested | The service keeps no state between requests. Per-instance state (the in-flight map and the pool) lives only for requests. One test runs two instances against one Redis and checks that a command's cache delete reaches the other instance. No load balancer or multi-instance deployment is built |
| HTTP caching, ETags | Built | `Cache-Control`, weak `ETag`, `Age`, 304 ([ADR-0019](docs/adr/0019-response-shape.md), [ADR-0039](docs/adr/0039-revalidation-and-weak-etags.md)) |
| Shared cache | Built | Redis, delete on write for one event, 60-second expiry for lists ([ADR-0014](docs/adr/0014-cache-freshness.md), [ADR-0015](docs/adr/0015-shared-cache.md)) |
| CDN, read replicas | Described | A CDN may hold list pages for 60 seconds. Replicas take list reads when the primary is the limit ([ADR-0001](docs/adr/0001-load-assumptions.md)) |
| Index use, keyset pagination | Built | One index per query, cursor on `(start_time, id)`, a page limit of 100 ([ADR-0013](docs/adr/0013-indexes.md), [ADR-0012](docs/adr/0012-cursor-pagination.md)) |
| Partitioning or archiving by date | Described | 5 million rows need no partitioning. It is a future option ([ADR-0001](docs/adr/0001-load-assumptions.md)) |
| Pool limit, back-pressure, timeouts | Built | Fixed pool per instance, 200 ms pool wait, 1 second statement limit, `Retry-After` ([ADR-0016](docs/adr/0016-failure-modes.md), [ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)) |
| Change propagation | Described | Consumers poll. A transactional outbox with a relay and a stream is designed. Each write command would insert a change row in its own transaction ([ADR-0020](docs/adr/0020-change-propagation.md)) |
| Structured logs | Built | Fastify request logs in JSON with a request ID. `INTERNAL` returns that ID so a response can be traced to a log line |
| Metrics, tracing | Described | None built ([ADR-0021](docs/adr/0021-implementation-boundary.md)) |

The service shuts down gracefully on SIGINT and SIGTERM: Fastify closes, then the database pool and the Redis client.

### Failure behaviour

| Failure | Behaviour | Status |
| ------- | --------- | ------ |
| A popular cache entry expires | Concurrent requests for one key inside an instance share one in-flight database read. With ten instances, up to ten reads reach the database | Built, tested |
| The cache is down | A cache error never fails a request. Reads go to the database, capped by the pool. Writes continue. A lost delete is bounded by the 60-second freshness limit. Redis commands time out after 200 ms and are not queued while the client is offline | Built, tested |
| The pool is busy | A request that waits more than 200 ms for a connection gets 503 `OVERLOADED`, `Retry-After` 1 | Built, tested |
| The database is slow | A statement over 1 second is cancelled by PostgreSQL and handled as "database down" for that request | Built, tested |
| The database is down | Entries up to 1 hour old are served, with the age in `generatedAt` and `Age`. A read without an entry and every write gets 503 `UNAVAILABLE`, `Retry-After` 5 | Built, tested |
| Shared cache down, many instances | A few-seconds cache inside each instance would absorb repeated reads | Described |
| Primary database lost | A standby with automatic failover. The cache serves reads during the switch | Described |

A cache entry has two ages. It is fresh for 60 seconds. It is kept for 1 hour, and served after the 60 seconds only while the database is down ([ADR-0016](docs/adr/0016-failure-modes.md)). During a database outage a cancelled event can still be served as scheduled, with its old age visible. The pool size, the waits and the `Retry-After` values are starting estimates. No load test exists in this repository, and they are not tuned by measurement.

## Testing

Tests sit in three folders, one per level. Each level has its own command ([ADR-0026](docs/adr/0026-test-tools.md)).

| Level | Folder | Checks | Why it exists |
| ----- | ------ | ------ | ------------- |
| Domain | `test/domain/` | Invariants, lifecycle, commands, typed errors, type-level rules, use cases against fake ports | Fast, no Docker. The default while writing code |
| Persistence | `test/persistence/` | Constraints, mapper, repository, conditional write, concurrent writers and creates, query plans, Redis cache, seed | Constraints, indexes and transactions are part of what is tested. A substitute would not run them |
| API | `test/api/` | Routes, errors, headers, authentication, OpenAPI conformance, cache across instances, Redis and PostgreSQL outages, time limits | The real path from HTTP to the database |

Persistence and API tests start real PostgreSQL and Redis containers with Testcontainers. A reviewer without Docker can still run the domain level.

| Kind | Examples |
| ---- | -------- |
| Property-based (fast-check) | For any sequence of commands: a terminal status never changes, the version rises by one per applied command and never otherwise, a refused command changes nothing |
| Type-level | `@ts-expect-error` lines in `event.test.ts` and `ids.test.ts`, checked by `npm run typecheck` |
| Concurrency | Two writers with one `expectedVersion`: exactly one wins. Two creates of one source identity: one event. Many identical reads: one database read |
| Failure mode | Redis stopped, PostgreSQL stopped (cached reads, refused writes), statement timeout versus pool wait, `Retry-After` on every 503 |
| Contract | Real responses are validated against the served OpenAPI schemas |
| Query plans | `EXPLAIN` on 50,000 events: each list query uses its index with no sort |
| Constraints | Every database constraint rejects bad data |

Testing grows with the system without one level growing because another changed. A new domain rule adds a fast test. A new query adds a persistence test and a plan check. A new route adds an API test and an OpenAPI check. Every behaviour marked built in [ADR-0021](docs/adr/0021-implementation-boundary.md) has tests at the level that ADR-0026 names. There is no coverage report or threshold.

TypeScript reduces run-time uncertainty with the strict settings listed above. CI runs format check, lint, typecheck and all three levels on every push.

## Tooling choices

| Tool | Why | Main rejected alternative |
| ---- | --- | ------------------------- |
| Node.js 24 with TypeScript run directly | `node src/main.ts` strips the types at load time, so there is no build step and no output folder. `tsconfig.json` sets `noEmit`, `erasableSyntaxOnly` and `allowImportingTsExtensions`, so `tsc` only checks types. `engines` pins `>=24 <25`. No ADR | A compile step with a build output |
| PostgreSQL | Constraints, `timestamptz`, `uuid`, row comparison for the cursor, `UPDATE ... RETURNING`. Several instances can share it ([ADR-0022](docs/adr/0022-postgresql.md)) | MySQL, SQLite |
| Kysely | Typed SQL builder. Every query is visible SQL, and the compiler checks names and types. Rows stay inside the persistence layer ([ADR-0023](docs/adr/0023-kysely.md)) | TypeORM, Prisma, raw SQL, Drizzle |
| Fastify | One route schema gives validation, handler types and OpenAPI ([ADR-0024](docs/adr/0024-fastify.md)) | NestJS, Express, Hono |
| Zod | Validates and converts requests and configuration in one step. Feeds OpenAPI ([ADR-0025](docs/adr/0025-zod.md), [ADR-0034](docs/adr/0034-validation-boundaries.md)) | TypeBox, hand-written validators |
| Redis | One shared cache so a delete on write reaches every instance ([ADR-0015](docs/adr/0015-shared-cache.md)) | A cache in each instance |
| Vitest | One runner, three projects, native TypeScript and ES modules ([ADR-0026](docs/adr/0026-test-tools.md)) | Jest, `node:test` |
| Testcontainers | Real PostgreSQL and Redis per test run, with no manual step ([ADR-0026](docs/adr/0026-test-tools.md)) | Compose service, in-memory database |
| fast-check | Property-based tests of the lifecycle ([ADR-0026](docs/adr/0026-test-tools.md)) | Example-only tests |

Prettier and ESLint with `typescript-eslint` (strict, type-checked) keep format and layer rules consistent. The `uuid` package generates UUID v7 behind the ID generator port ([ADR-0006](docs/adr/0006-identifiers.md)).

## Design decisions and alternatives

| Decision | Chosen | Main rejected alternative | ADR |
| -------- | ------ | ------------------------- | --- |
| Sport representation | Rows in `sports` with a stable code. Phases in a code table | Closed union in code only | [0003](docs/adr/0003-sports-and-competitors.md), [0031](docs/adr/0031-phase-checked-at-run-time.md) |
| Competitor model | Separate entity with its own ID and a link table | Names as text on the event | [0003](docs/adr/0003-sports-and-competitors.md) |
| Sport-specific data | One optional live `phase`, checked per sport | Free-form JSON metadata; union per sport | [0004](docs/adr/0004-sport-specific-phase.md), [0031](docs/adr/0031-phase-checked-at-run-time.md) |
| Time model | UTC instant, `timestamptz`, input needs an offset | Instant plus venue time zone | [0005](docs/adr/0005-time-in-utc.md) |
| Lifecycle | Five statuses, transitions only by producer commands | Derive status from the clock | [0002](docs/adr/0002-event-lifecycle.md) |
| Validation and error style | `Result` values in the domain, one mapping to Problem Details | Exceptions through the layers | [0018](docs/adr/0018-error-format.md), [0037](docs/adr/0037-refusals-of-well-formed-input.md) |
| History of changes | Current state and version only | Stored domain events or audit trail | [0036](docs/adr/0036-current-state-only.md) |
| Database | PostgreSQL | MySQL, SQLite | [0022](docs/adr/0022-postgresql.md) |
| Query layer | Kysely | TypeORM, Prisma, raw SQL, Drizzle | [0023](docs/adr/0023-kysely.md) |
| Migrations tool | Kysely migrator, SQL in migrations | A standalone tool (no ADR of its own) | [0023](docs/adr/0023-kysely.md) |
| ID strategy | UUID v7 generated by the service | Database sequence, UUID v4 | [0006](docs/adr/0006-identifiers.md) |
| Time storage | `timestamptz` only | Plus an IANA time zone column | [0005](docs/adr/0005-time-in-utc.md) |
| Concurrency control | Optimistic, version equality, conditional write | `SELECT ... FOR UPDATE`; last write wins | [0009](docs/adr/0009-optimistic-concurrency.md), [0030](docs/adr/0030-domain-decides-commands.md) |
| Idempotency of creation | Unique `(source, external_id)` | Idempotency key table or `(sourceId, requestId)` | [0007](docs/adr/0007-source-identity.md), [0038](docs/adr/0038-repeated-create-returns-stored-event.md) |
| Pagination | Cursor on `(start_time, id)` | Offset | [0012](docs/adr/0012-cursor-pagination.md), [0029](docs/adr/0029-list-page-size-parameter.md) |
| API style | REST with command endpoints | GraphQL | [0017](docs/adr/0017-rest-api.md) |
| HTTP framework | Fastify | NestJS, Express, Hono | [0024](docs/adr/0024-fastify.md) |
| Validation | Zod at the HTTP and configuration boundaries | TypeBox | [0025](docs/adr/0025-zod.md), [0034](docs/adr/0034-validation-boundaries.md) |
| Architecture | Layers with ports, import rules enforced by ESLint, one composition root. No ADR of its own | A framework-imposed structure ([ADR-0024](docs/adr/0024-fastify.md)) | `AGENTS.md`, [0015](docs/adr/0015-shared-cache.md) |
| Write operations | Create plus six named commands | One generic update | [0010](docs/adr/0010-write-commands.md) |
| Change publishing | Outbox described, polling built | Publish from the request handler; build the outbox now | [0020](docs/adr/0020-change-propagation.md) |
| Consumer interface | OpenAPI plus curl examples, no UI | A minimal UI. No ADR | [`docs/api-examples.md`](docs/api-examples.md) |
| Spec source | Generated from route schemas, checked by a test | Hand-written specification | [0024](docs/adr/0024-fastify.md), [0025](docs/adr/0025-zod.md) |
| Interactive docs | None. Only `/openapi.json`. No ADR | Swagger UI or Scalar at `/docs` | none |
| Seed data | Seed script with fixed IDs and the two example matches | Only curl create commands | [0027](docs/adr/0027-names-in-event-responses.md) |
| Test runner | Vitest | Jest, `node:test` | [0026](docs/adr/0026-test-tools.md) |
| Database in tests | Testcontainers | Compose service, in-memory database | [0026](docs/adr/0026-test-tools.md) |
| Optional tests | Property, contract, concurrency and failure-mode tests are all built | Skip them | [0026](docs/adr/0026-test-tools.md) |
| Coverage reporting | None. No ADR | Report or threshold gate | none |
| Load assumptions | Explicit numbers, sized for 1,000,000 events a year | Design without numbers | [0001](docs/adr/0001-load-assumptions.md) |
| Provider formats, duplicates | Adapters and reconciliation upstream. No duplicate guard | Reconciliation inside the service; exact-duplicate guard | [0008](docs/adr/0008-ingestion-boundary.md), [0032](docs/adr/0032-duplicate-guard-not-built.md) |
| List queries | Four optional filters, fixed order | One endpoint per screen; free sort | [0011](docs/adr/0011-read-queries.md) |
| Time window bounds | `from` included, `to` excluded | Include both bounds | [0041](docs/adr/0041-time-window-bounds.md) |
| Indexes | One index per named query | An index per filter combination | [0013](docs/adr/0013-indexes.md) |
| Cache freshness | Delete on write for one event, 60-second expiry for lists | A 5-second expiry for one event | [0014](docs/adr/0014-cache-freshness.md) |
| Cache location | One shared Redis | A cache in each instance | [0015](docs/adr/0015-shared-cache.md) |
| Failure modes | In-flight sharing, pool cap, stale data on database outage | No cap; refuse all reads on outage | [0016](docs/adr/0016-failure-modes.md) |
| Time limits | 200 ms pool wait, 1 second statement limit, `Retry-After` on every 503 | One limit for the whole request | [0040](docs/adr/0040-time-limits-and-retry-after.md) |
| Error format | Problem Details with stable codes; 400, 422 and 409 kept apart | Status only; custom format | [0018](docs/adr/0018-error-format.md), [0037](docs/adr/0037-refusals-of-well-formed-input.md) |
| Response shape | `generatedAt` plus standard headers | Envelope with a `stale` flag | [0019](docs/adr/0019-response-shape.md) |
| Revalidation | `no-cache` and weak ETag for one event | `max-age=60` for one event | [0039](docs/adr/0039-revalidation-and-weak-etags.md) |
| Names in responses | Seeded reference data, names embedded | Only IDs plus a competitor endpoint | [0027](docs/adr/0027-names-in-event-responses.md) |
| Command logic | Domain decides, SQL checks only the version | Rules in the `WHERE` clause | [0030](docs/adr/0030-domain-decides-commands.md) |
| Branded types | Event and competitor IDs only | Seven brands | [0033](docs/adr/0033-branded-types-for-identifiers-only.md) |
| Same-sport rule | Composite foreign keys | Domain check only; trigger | [0035](docs/adr/0035-same-sport-enforced-by-schema.md) |
| Repeated create | 200 and the stored event, nothing compared | Compare and refuse with 409 | [0038](docs/adr/0038-repeated-create-returns-stored-event.md) |
| Writer security | Bearer keys from the environment, source taken from the key | Accept a source claim; keys in PostgreSQL | [0042](docs/adr/0042-writer-authentication.md) |
| Implementation boundary | Built, extension point, described | Build more of the platform | [0021](docs/adr/0021-implementation-boundary.md) |

## Assumptions and known limitations

### Assumptions

- The load figures above are estimates ([ADR-0001](docs/adr/0001-load-assumptions.md)).
- Data is refreshed within minutes, not at betting latency. A 60-second list staleness is acceptable.
- Writers are systems that can read an event before they change it: an operator tool or a reconciliation component. A provider that only pushes messages needs reconciliation in front of the service ([ADR-0009](docs/adr/0009-optimistic-concurrency.md)).
- Providers' formats, ordering and duplicates are handled upstream ([ADR-0008](docs/adr/0008-ingestion-boundary.md)).
- Sports and competitors are reference data from a source outside the API ([ADR-0027](docs/adr/0027-names-in-event-responses.md)).
- Matches have two sides, one home and one away.
- The example start times are Austrian local time ([ADR-0005](docs/adr/0005-time-in-utc.md)).

### Security

[ADR-0042](docs/adr/0042-writer-authentication.md) builds writer authentication and source ownership. This part is open:

- Keys come from the `WRITER_KEYS` environment variable. The service has no endpoint to issue, list or rotate keys. An operator generates keys outside the service and deploys a new mapping to change access. A source that already owns events needs a key before it can write them again.
- There is no per-consumer rate limiting ([ADR-0021](docs/adr/0021-implementation-boundary.md)).
- Bearer keys need TLS. The service speaks plain HTTP and expects TLS to be provided in front of it.
- GET routes are public. Anyone who can reach the service can read all events.

### Described, not built

Every row below is a known limitation of this implementation ([ADR-0021](docs/adr/0021-implementation-boundary.md)).

| Part | Consequence |
| ---- | ----------- |
| Provider adapters, reconciliation | The service accepts one canonical format only |
| Ordering of one provider's messages | Out-of-order or repeated provider messages are not detected here ([ADR-0009](docs/adr/0009-optimistic-concurrency.md)) |
| Exact-duplicate guard | The same real match sent by two sources becomes two events. A start time one minute off would pass such a guard anyway ([ADR-0032](docs/adr/0032-duplicate-guard-not-built.md)) |
| Change events: outbox and stream | A list change is visible after the 60-second expiry at the earliest, and there is no push channel ([ADR-0020](docs/adr/0020-change-propagation.md)) |
| Match actions, score, statistics | Out of scope. A neighbouring service owns them ([ADR-0010](docs/adr/0010-write-commands.md)) |
| Load balancer, several instances, CDN | Only the single-process service is built and tested |
| Read replicas, standby database, date partitioning | Not built ([ADR-0001](docs/adr/0001-load-assumptions.md), [ADR-0016](docs/adr/0016-failure-modes.md)) |
| Local cache during a Redis outage | Not built. During an outage every read goes to the database ([ADR-0016](docs/adr/0016-failure-modes.md)) |
| Rate limiting per consumer | Not built |
| Metrics and tracing | Not built. Structured logs are built |

Extension points ([ADR-0021](docs/adr/0021-implementation-boundary.md)): a new sport is a row in `sports`, and phases for it are one table entry. The schema allows more than two competitors per event, but create and the commands do not. The cache port has an in-memory adapter next to Redis.

### Other limitations

- Names and reference data ([ADR-0027](docs/adr/0027-names-in-event-responses.md), [ADR-0039](docs/adr/0039-revalidation-and-weak-etags.md)): no endpoint creates or changes sports and competitors. A writer must know competitor IDs, which the seed lists. A rename reaches consumers after the 60-second expiry and changes no `ETag`.
- Stored state ([ADR-0036](docs/adr/0036-current-state-only.md)): the actual start and end times, the time and reason of a cancellation, and earlier start times are not stored. A postponed event keeps its last scheduled start.
- Repeated create ([ADR-0038](docs/adr/0038-repeated-create-returns-stored-event.md)): create never changes an event. A writer that ignores status 200 and the body will not see that its data was dropped.
- Lifecycle ([ADR-0002](docs/adr/0002-event-lifecycle.md), [ADR-0004](docs/adr/0004-sport-specific-phase.md), [ADR-0010](docs/adr/0010-write-commands.md)): an interrupted match, extra time, shoot-outs and breaks cannot be represented. Corrections of other data (a wrong competitor) are not supported: the event is cancelled and created again. The create needs a new external ID, because the old pair returns the cancelled event. The order of phases is not enforced.
- Time ([ADR-0005](docs/adr/0005-time-in-utc.md)): local time at the venue cannot be shown from this service's data.
- Queries ([ADR-0011](docs/adr/0011-read-queries.md), [ADR-0012](docs/adr/0012-cursor-pagination.md), [ADR-0017](docs/adr/0017-rest-api.md)): no text search, no custom sort, no filter by source, no total count, no jump to page N. A reschedule during paging can show an event twice or not at all. Every consumer gets the full event, and a new query shape needs a change in the service.
- Consistency ([ADR-0016](docs/adr/0016-failure-modes.md), [ADR-0019](docs/adr/0019-response-shape.md), [ADR-0009](docs/adr/0009-optimistic-concurrency.md)): during a database outage data up to 1 hour old is served, with its age visible in `generatedAt` and `Age`. A CDN may hold a list page for 60 seconds. A conflict after a timeout is ambiguous, and the writer resolves it by reading.
- Cache ([ADR-0014](docs/adr/0014-cache-freshness.md)): many distinct time windows or limits lower the hit rate. It is not measured.
- Types ([ADR-0031](docs/adr/0031-phase-checked-at-run-time.md), [ADR-0033](docs/adr/0033-branded-types-for-identifiers-only.md)): the compiler does not catch a wrong sport and phase pair, or a source passed as an external ID. A `Date` can hold an invalid date. Code that calls the domain without the HTTP layer must pass valid values.
- Measurement ([ADR-0013](docs/adr/0013-indexes.md), [ADR-0016](docs/adr/0016-failure-modes.md), [ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)): query plans are checked on 50,000 events. No load test exists. Pool size, waits and timeouts are untuned estimates.
- Schema ([ADR-0035](docs/adr/0035-same-sport-enforced-by-schema.md)): the sport of an event or competitor cannot change while a link row refers to it.

## What I would change with more time

These items come from the "described" parts above and from the consequences recorded in the ADRs.

- Move key management into the system: issue and rotate keys, keep them in PostgreSQL instead of an environment variable, and add per-consumer rate limiting. Terminate TLS in front of the service ([ADR-0042](docs/adr/0042-writer-authentication.md), [ADR-0021](docs/adr/0021-implementation-boundary.md)).
- Build the adapters and the reconciliation component upstream. Until then, bring back the exact-duplicate guard as a stopgap if the service runs without reconciliation ([ADR-0008](docs/adr/0008-ingestion-boundary.md), [ADR-0032](docs/adr/0032-duplicate-guard-not-built.md)).
- Add the transactional outbox, a relay and a stream, so consumers that need less than 60 seconds can subscribe ([ADR-0020](docs/adr/0020-change-propagation.md)).
- Run a load test and tune the pool size, the waits, the timeouts and the cache hit rate against it ([ADR-0014](docs/adr/0014-cache-freshness.md), [ADR-0016](docs/adr/0016-failure-modes.md), [ADR-0040](docs/adr/0040-time-limits-and-retry-after.md)).
- Add metrics and tracing hooks next to the structured logs ([ADR-0021](docs/adr/0021-implementation-boundary.md)).
- Add the short cache inside each instance for a Redis outage, run several instances behind a load balancer and a CDN, and add read replicas and a standby database when the primary becomes the limit ([ADR-0016](docs/adr/0016-failure-modes.md), [ADR-0001](docs/adr/0001-load-assumptions.md)).
- Add an API for sports and competitors, or take them from a reference-data service ([ADR-0027](docs/adr/0027-names-in-event-responses.md)).
- Add a flag that the scheduled start is confirmed, and leave actual start and end times to the match-actions service ([ADR-0036](docs/adr/0036-current-state-only.md)).
- Move phases into a table if the number of sports with phases grows ([ADR-0004](docs/adr/0004-sport-specific-phase.md), [ADR-0031](docs/adr/0031-phase-checked-at-run-time.md)).
- Store the venue time zone, which needs a venue entity ([ADR-0005](docs/adr/0005-time-in-utc.md)).
- Support events with more than two competitors in create and the commands ([ADR-0003](docs/adr/0003-sports-and-competitors.md)).
- Model `suspended` and `abandoned` for interrupted matches ([ADR-0002](docs/adr/0002-event-lifecycle.md)).
- Compare the data of a repeated create and refuse a different repeat with a 409, for writers that ignore the response ([ADR-0038](docs/adr/0038-repeated-create-returns-stored-event.md)).

## Further reading

- [`docs/system-design.md`](docs/system-design.md): the full system description with both diagrams and the request flows.
- [`docs/adr/`](docs/adr/): 42 decision records, each with context, alternatives and consequences.
- [`docs/requirements/`](docs/requirements/): the requirements with IDs and acceptance criteria.
- [`docs/api-examples.md`](docs/api-examples.md): runnable curl flows.
- [`docs/plan.md`](docs/plan.md): the implementation steps.
- [`AI_Reflection.txt`](AI_Reflection.txt): how AI tools were used and which decisions were checked independently.
