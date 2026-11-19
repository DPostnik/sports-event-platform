# Evaluation Criteria

How reviewers score the exercise, and which requirements provide the evidence for each criterion.

| Criterion (from the brief)                         | Main evidence                                   | Requirements                |
| -------------------------------------------------- | ----------------------------------------------- | --------------------------- |
| Strength of architectural and domain design        | Domain model, layer separation, diagrams        | DOM-1..9, API-5, PER-6      |
| Depth of TypeScript usage and correctness          | Branded types, unions, exhaustive checks, strict config | DOM-2, DOM-7, TST-4, API-12 |
| Code quality and maintainability                   | Structure, naming, small modules, lint, CI      | SUB-3, TST-1..3             |
| Awareness of scalability, reliability, evolution   | Indexes, pagination, concurrency control, scaling section | PER-3, PER-9, API-8..10, DOM-5 |
| Ability to communicate trade-offs clearly          | README decisions, limitations, "with more time" | DOC-2, DOC-4, DOC-5, PER-7  |
| Evidence of senior-level ownership and judgment    | Deliberate scoping, commit history, AI reflection | DOC-7..9, SUB-2             |

## Notes from the brief

- There is no single correct solution.
- Engineering judgment matters more than completeness.
- The task is intentionally open-ended; how we constrain it is part of the evaluation.

## Practical consequences

- Prefer a smaller scope done well and explained over many shallow features.
- Make every scope cut visible in the README (assumptions, limitations, future work).
- Show "correctness under change": lifecycle transitions, versioning, migrations, typed errors.
