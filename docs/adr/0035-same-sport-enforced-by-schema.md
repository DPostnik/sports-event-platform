# ADR-0035: The database enforces that a competitor belongs to the sport of its event

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0003](0003-sports-and-competitors.md) lists three constraints of `event_competitors`. Two are unique keys in the schema. The third, "a competitor must belong to the same sport as the event", is checked only by the domain when an event is created.

The schema cannot check it as built: a link row holds the event, the competitor and the role, and no sport.

A writer that does not go through the domain can break the rule. Seed data, a manual correction or a future ingestion component can link an ice hockey competitor to a football event. In the brief's examples Salzburg vs. Sturm is football and KAC is ice hockey.

Requirement PER-2 asks that the database rejects bad data by itself.

## Decision

- `event_competitors` gets a `sport_code` column, `NOT NULL`.
- Two composite foreign keys replace the two single-column ones.

| Foreign key | References |
| ----------- | ---------- |
| `(event_id, sport_code)` | `events (id, sport_code)` |
| `(competitor_id, sport_code)` | `competitors (id, sport_code)` |

- `events` and `competitors` each get a unique key on `(id, sport_code)`, so that the foreign keys have a target.
- One link row has one `sport_code`, and both keys must match it. So the sport of the event equals the sport of the competitor.
- The constraint names follow the PostgreSQL default naming already used in the migrations.

| Constraint | Table |
| ---------- | ----- |
| `competitors_id_sport_code_key` | `competitors` |
| `events_id_sport_code_key` | `events` |
| `event_competitors_event_id_sport_code_fkey` | `event_competitors` |
| `event_competitors_competitor_id_sport_code_fkey` | `event_competitors` |

- The domain check stays. It names the refusal as a typed error before any write. The schema is the second line.
- No database has been deployed from these migrations. The change is made in the existing migration files, not in a new migration, so that the schema reads as one design.

## Alternatives considered

- Keep the rule in the domain only and say so in [ADR-0003](0003-sports-and-competitors.md). Rejected: the check is cheap in the schema, and PER-2 asks for it.
- A trigger that compares the two sports. Rejected: it is procedural code in the database and is not visible when reading the table definition. A foreign key is declarative.
- A new migration that alters the tables. Rejected for now: nothing is deployed, so there is no data to migrate. After the first deployment every schema change is a new migration.

## Consequences

- The sport of an event is stored on the event and repeated on each of its link rows. The composite keys make a difference impossible, so the copy cannot drift.
- Two more unique indexes exist, one on `events` and one on `competitors`. No query reads them. They exist only as targets of the foreign keys. This is an exception to "no index without a named query" in [ADR-0013](0013-indexes.md).
- Each write to `events` maintains one more index. At the peak of 100 writes per second ([ADR-0001](0001-load-assumptions.md)) this is small.
- The sport of an event or of a competitor cannot change while a link row refers to it. No command changes either.
- The create transaction writes `sport_code` on both link rows. It is still three rows in one transaction.
- The persistence tests gain one rule: the database refuses a link whose competitor belongs to another sport.
- This amends [ADR-0003](0003-sports-and-competitors.md) (the third constraint is now in the schema) and [ADR-0013](0013-indexes.md) (two unique indexes without a named query).
