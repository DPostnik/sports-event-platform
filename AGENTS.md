# Working rules for this repository

These rules apply to every contributor, human or AI agent.

## Source of decisions

- `docs/system-design.md` describes the system. `docs/adr/` holds the accepted decisions. `docs/requirements/` holds the requirements with IDs.
- An accepted ADR is not changed by code. If the implementation shows that a decision is wrong, stop and raise it. The change is a new ADR that replaces the old one, approved by the author.
- `docs/plan.md` lists the implementation steps. Work on one step at a time, in order.
- Do not add features, endpoints, tables or dependencies that no ADR or plan step asks for.

## Layers

```
src/
  domain/          pure TypeScript: types, lifecycle, commands, typed errors
  application/     use cases and ports (interfaces for repository, cache, clock, ID generator)
  infrastructure/
    persistence/   Kysely, migrations, row-to-domain mapper
    cache/         Redis and in-memory implementations of the cache port
  http/            Fastify routes, Zod schemas, error mapping
  config/          environment configuration
  main.ts          composition root: the only place that wires implementations to ports
test/
  domain/          no I/O, no Docker
  persistence/     real PostgreSQL and Redis through Testcontainers
  api/             HTTP level against the real stack
```

Import rules, enforced by the linter:

| Layer | May import |
| ----- | ---------- |
| `domain` | nothing outside `domain`, no third-party runtime library |
| `application` | `domain` |
| `infrastructure` | `application`, `domain` |
| `http` | `application`, `domain` |
| `main.ts` | everything |

`infrastructure` and `http` never import each other.

## TypeScript

- Strict settings stay on: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
- No `any`. No non-null assertion (`!`). No `@ts-ignore`. A type cast (`as`) is allowed only inside a constructor of a branded type or a mapper, directly after validation.
- Identifiers and validated values are branded types created only through a validating constructor.
- State that varies by status or sport is a discriminated union. Every `switch` over a union ends with an exhaustive `never` check.
- Expected failures are values, not exceptions: domain and application functions return a `Result` with a typed error. Exceptions are for bugs and for infrastructure failures, and are translated at the boundary.
- The domain does not read the clock or generate IDs by itself. Time and IDs come in through ports.

## Persistence

- Schema changes are migrations. Constraints and indexes are explicit SQL with a comment that names the ADR.
- A change to an existing event is read, decided by the domain, and written by one statement that is conditional on the version (ADR-0009, ADR-0030). The SQL does not repeat lifecycle rules.
- Each use case that writes runs in one explicit transaction.
- Rows are validated in the mapper before they become domain objects.

## Tests

- Every behaviour marked as built in ADR-0021 has tests at the level named in ADR-0026.
- Name a test after the rule it checks, and reference the requirement ID or ADR in the `describe` title where one applies.
- Do not weaken, skip or delete a failing test to make a step pass. Report the failure.

## Commands

| Command | Purpose |
| ------- | ------- |
| `npm run typecheck` | Compile without emitting |
| `npm run lint` | Lint, including the import rules |
| `npm run test:domain` | Domain tests, no Docker |
| `npm run test:persistence` | Persistence tests, needs Docker |
| `npm run test:api` | API tests, needs Docker |
| `npm test` | All levels |

A step is done when `typecheck`, `lint` and the tests of its level pass. State exactly which commands were run and which were not.

## Commits

- One focused change per commit. A plan step is usually several commits.
- Message: one imperative English sentence, for example `Add lifecycle transition table`. No attribution lines.
- Never commit `brief/`, `notes/`, secrets or local environment files.
- Do not push. Do not rewrite published history.

## Writing

- English. Short plain sentences, active voice. Use a hyphen `-`, never an em dash or en dash.
- Comments explain why, not what. No comments that restate the code.

## AI usage

AI tools are used in this repository. The author reviews every change and records AI usage for `AI_Reflection.txt`. An agent reports, with each step, every place where it chose between alternatives or deviated from the plan.
