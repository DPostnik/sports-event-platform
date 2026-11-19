# 01 - Domain and Type Modeling

Brief section 1. Goal: a domain model that uses the TypeScript type system to make invalid states
hard or impossible to represent.

## Requirements

| ID    | Priority | Requirement                                                                                     |
| ----- | -------- | ----------------------------------------------------------------------------------------------- |
| DOM-1 | Must     | Define the core domain entities and the boundaries between them.                               |
| DOM-2 | Must     | Use the type system intentionally: value objects, discriminated unions, invariants.            |
| DOM-3 | Must     | Model relationships between entities explicitly.                                                |
| DOM-4 | Must     | Model the event lifecycle and its allowed transitions explicitly.                               |
| DOM-5 | Must     | Anticipate extension: new sports, extra metadata, external integrations.                        |
| DOM-6 | Must     | Deliver a description or diagram of the domain model.                                           |
| DOM-7 | Must     | Explain how the types enforce correctness.                                                      |
| DOM-8 | Must     | Document the key modeling trade-offs.                                                           |
| DOM-9 | Should   | Events "may evolve over time": changes (reschedule, status change) must be modeled, not ad hoc. |

## Acceptance criteria

- Domain code has no dependency on the database, HTTP framework or ORM.
- Invalid values cannot be constructed without going through a validating factory
  (for example, branded types for IDs, a non-empty competitor name, a valid start time).
- An event cannot have the same competitor on both sides.
- Lifecycle transitions are defined in one place; an illegal transition is a typed error, not an
  exception thrown from deep inside the code.
- Adding a sport does not require changes in unrelated code; the compiler points to every place
  that must handle the new case (exhaustive `switch` with `never` checks).
- The README (or `docs/`) has a diagram (Mermaid is enough) and a short rationale per decision.

## Domain concepts to cover (minimum)

- Sport event (match): sport, competitors (home / away), scheduled start, status, version.
- Sport: closed set or extensible registry (see open decisions).
- Competitor / team: identity independent of a single event.
- Event status lifecycle, for example: `scheduled -> live -> finished`, plus
  `postponed`, `cancelled` as terminal or semi-terminal states.
- Optional: competition / tournament, venue, sport-specific metadata.

## Open decisions

| Decision                         | Options                                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| Sport representation             | Closed union of literals vs. data-driven registry vs. hybrid            |
| Competitor model                 | Embedded names on the event vs. separate team entity with IDs            |
| Sport-specific data              | Discriminated union per sport vs. generic JSON metadata with schema      |
| Time model                       | UTC instant only vs. instant plus original time zone of the venue        |
| Lifecycle states and transitions | Exact state set; which states are terminal; who triggers transitions     |
| Validation / error style         | Result type (`Result<T, E>`) vs. exceptions at domain boundaries         |
| History of changes               | Current-state only with version vs. stored domain events / audit trail   |

## Evidence for reviewers

- `src/domain/**` with value objects, unions and lifecycle code.
- Unit tests for invariants and transitions (see 05-testing.md).
- Domain section in the README with diagram and trade-offs.
