# ADR-0008: Adapters and reconciliation sit upstream; the service keeps an exact-duplicate guard

Status: Accepted, amended by [ADR-0032](0032-duplicate-guard-not-built.md)

Date: 2026-11-19

## Context

Providers send data in their own formats, and two providers can report the same real match. Both problems are real, and neither is what this service is built for.

Names differ between providers ("Salzburg", "FC Red Bull Salzburg"), and start times can differ by minutes. Matching records is a product of its own.

## Decision

- The service accepts one canonical format only and knows no provider format.
- Format conversion belongs to adapters, one small component per provider, upstream of the service. Described and drawn, not built.
- Deciding whether two provider records are the same real match, and whose data wins, belongs to a reconciliation component upstream of the service. Described and drawn, not built.
- Inside the service, create has one interim safeguard: an exact-duplicate guard. If an active event already exists with the same sport, the same set of competitors and the same start instant, but a different `(source, external_id)`, create is refused with a conflict that names the existing event ID.
- The guard is a database-level unique key derived from the sport, the sorted competitor IDs and the start instant. It ignores cancelled events and is recomputed on reschedule.
- The guard is explicitly a stopgap. It catches exact copies only.

## Alternatives considered

- Build reconciliation inside the service. Rejected: fuzzy matching of names and times, trust rules and manual review are a separate product, and it would hide the core of the service.
- No guard at all. Rejected: an exact copy is cheap to stop at the database and gives the caller a meaningful conflict.
- Fuzzy matching in the guard, for example a time tolerance. Rejected: false positives would block legitimate events. That judgment belongs to reconciliation.

## Consequences

- Adding a provider means adding an adapter. The service does not change.
- Consumers see one event per real match only if reconciliation upstream does its work.
- The guard does not catch different competitor records for the same team, or start times that differ by minutes. The underlying problem lies deeper than this check.
- Swapped home and away with the same sport and instant counts as a duplicate, because the key sorts competitor IDs.
- The guard adds one derived column and one partial unique index.
