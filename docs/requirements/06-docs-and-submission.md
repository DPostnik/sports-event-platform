# 06 - Documentation, Communication and Submission

Brief section 6 and "Submission Guidelines". Goal: reviewers understand the system, the decisions
and the trade-offs without asking us.

## README.md

| ID    | Priority | The README must include                                        |
| ----- | -------- | -------------------------------------------------------------- |
| DOC-1 | Must     | System overview and architecture.                              |
| DOC-2 | Must     | Design decisions and the alternatives considered.              |
| DOC-3 | Must     | Setup and execution instructions.                              |
| DOC-4 | Must     | Assumptions and known limitations.                             |
| DOC-5 | Must     | What we would change with more time or different trade-offs.   |
| DOC-6 | Must     | Tooling choices with justification (from CON-5).               |

Also cover the deliverables from other sections: domain model and diagram (DOM-6..8), persistence
compromises (PER-7), API style justification (API-6), scalability (API-10), testing approach (TST-3).

## AI_Reflection.txt

| ID     | Priority | The file must describe                                                  |
| ------ | -------- | ----------------------------------------------------------------------- |
| DOC-7  | Must     | How AI tools were used, if at all.                                      |
| DOC-8  | Must     | Which decisions were validated independently, and how.                  |
| DOC-9  | Must     | One significant decision where AI input was explicitly rejected or insufficient. |

Note: keep a running log of AI usage and rejected suggestions during the work, so this file is
written from facts, not memory.

## Submission

| ID    | Priority | Requirement                                                              |
| ----- | -------- | ------------------------------------------------------------------------ |
| SUB-1 | Must     | Public GitHub repository.                                                |
| SUB-2 | Must     | Commit history reflects incremental, deliberate development.             |
| SUB-3 | Must     | Code structure, naming and documentation are treated as part of quality. |
| SUB-4 | Must     | Share the link to the public repository with the reviewers.              |

## Acceptance criteria

- A reviewer with Node.js and Docker can clone, run setup and start the service using only the README.
- Every decision listed under "open decisions" in 01-05 appears in the README with the chosen option
  and the main rejected alternative.
- Commits are small and focused, with clear messages; no single "initial commit" with everything.
- The repository does not contain the copyrighted brief, secrets or local artifacts.
- `AI_Reflection.txt` is plain text at the repository root.

## Evidence for reviewers

- `README.md`, `AI_Reflection.txt` at the root.
- Optional: `docs/adr/` with short architecture decision records.
