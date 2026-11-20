# Requirements - Sports Event Platform

This folder turns the engineering exercise brief into concrete, checkable requirements.
The original brief is not included in this repository (it is copyrighted).

## Goal

Build a Sports Event Platform: a backend service that manages scheduled sports matches and exposes
them to downstream consumers (web, mobile, internal services). Treat it as the foundation of a
long-lived, high-traffic service inside a larger platform.

Example events from the brief:

| Start (local)    | Sport      | Match              |
| ---------------- | ---------- | ------------------ |
| 2025-07-18 18:30 | Football   | Salzburg vs. Sturm |
| 2025-10-23 09:45 | Ice Hockey | KAC vs. Capitals   |

## Hard constraints

| ID    | Constraint                                                              |
| ----- | ----------------------------------------------------------------------- |
| CON-1 | Implementation language is TypeScript (strict mode encouraged).         |
| CON-2 | Runtime is Node.js.                                                     |
| CON-3 | Storage is a relational database; the choice is ours.                   |
| CON-4 | ORM or query layer is our choice, including none.                       |
| CON-5 | Every tooling choice is justified in writing.                           |
| CON-6 | It is not a CRUD exercise: the design must show intent beyond CRUD.     |

## Documents

| File                                                     | Area                                  | Brief section |
| -------------------------------------------------------- | ------------------------------------- | ------------- |
| [01-domain-model.md](01-domain-model.md)                 | Domain and type modeling              | 1             |
| [02-persistence.md](02-persistence.md)                   | Relational persistence                | 2             |
| [03-api-service.md](03-api-service.md)                   | Backend service and API               | 3             |
| [04-consumer-interface.md](04-consumer-interface.md)     | Consumer integration (UI or API docs) | 4             |
| [05-testing.md](05-testing.md)                           | Testing and quality                   | 5             |
| [06-docs-and-submission.md](06-docs-and-submission.md)   | Required files and submission rules   | 6, guidelines |
| [evaluation-criteria.md](evaluation-criteria.md)         | How reviewers score, mapped to work   | Evaluation    |

## Requirement IDs

Each requirement has an ID (`DOM-`, `PER-`, `API-`, `CI-`, `TST-`, `DOC-`, `SUB-`). Use the IDs in
commit messages, the README and tests so reviewers can trace a requirement to its evidence.

Priority labels:

- **Must**: stated as a requirement or deliverable in the brief.
- **Should**: stated as an expectation or strongly implied by the evaluation criteria.
- **Could**: marked optional / nice to have in the brief.

## Deliverables checklist

- [ ] Domain model description or diagram, with type-safety rationale and trade-offs (DOM)
- [ ] Relational schema with constraints, indexes and migrations (PER)
- [ ] Running API: create events, get one event, list and query events (API)
- [ ] OpenAPI spec and/or curl examples, or a minimal UI (CI)
- [ ] Automated tests for core logic and boundaries (TST)
- [ ] `README.md` with all required sections (DOC)
- [ ] `AI_Reflection.txt` with all required points (DOC)
- [ ] Public GitHub repository with incremental, deliberate commit history (SUB)

## Scoping principle

The brief says that how we constrain an open-ended task is part of the evaluation. Each document
lists **open decisions**. Record every decision and its rejected alternatives in the README
(design decisions section) rather than leaving them implicit.
