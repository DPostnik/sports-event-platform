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

Project files are imported by the full path from the project root: `#src/...` and `#test/...`. Relative imports are not used. The `imports` field of `package.json` maps the two prefixes to the folders.

## TypeScript

- Strict settings stay on: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`.
- No `any`. No non-null assertion (`!`). No `@ts-ignore`. A type cast (`as`) is allowed only inside a constructor of a branded type or a mapper, directly after validation.
- Event and competitor identifiers are branded types created only through a validating constructor (ADR-0033). Other values are plain `string`, `number` and `Date`, checked at the HTTP boundary.
- State that varies by status is a discriminated union. Every `switch` over a union ends with an exhaustive `never` check.
- Expected failures are values, not exceptions: domain and application functions return a `Result` with a typed error. Exceptions are for bugs and for infrastructure failures, and are translated at the boundary.
- The domain does not read the clock or generate IDs by itself. Time and IDs come in through ports.

## Persistence

- Schema changes are migrations. Constraints and indexes are explicit SQL with a name. The reasons are in the ADRs and the README, not in comments.
- A change to an existing event is read, decided by the domain, and written by one statement that is conditional on the version (ADR-0009, ADR-0030). The SQL does not repeat lifecycle rules.
- A write of more than one statement runs in one explicit transaction. A write of one statement is atomic by itself and needs none. A command that gains a second statement gets a transaction with it.
- Rows are checked in the mapper with the domain constructors before they become domain objects (ADR-0034). No Zod in the persistence layer.

## Tests

- Every behaviour marked as built in ADR-0021 has tests at the level named in ADR-0026.
- Name a test after the rule it checks, and reference the requirement ID or ADR in the `describe` title where one applies.
- One test per rule. Do not add a second test that proves the same rule at the same level.
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
