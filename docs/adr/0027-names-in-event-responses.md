# ADR-0027: Reference data is seeded and event responses carry names

Status: Accepted

Date: 2026-11-20

## Context

[ADR-0003](0003-sports-and-competitors.md) gives sports and competitors a name. No decision says how a consumer gets it. The first implementation returned competitor IDs only. A consumer could not show "Salzburg vs. Sturm", the example of the brief, without another source of names.

No operation creates or reads sports and competitors either. The API of [ADR-0017](0017-rest-api.md) covers events only.

## Decision

- Sports and competitors are reference data. This service does not create or change them through the API. They are loaded by seed data.
- In production they would come from a reference-data service or from the reconciliation component ([ADR-0008](0008-ingestion-boundary.md)). This is described, not built.
- An event response embeds the names. The `sport` member holds the code and the name. The `competitors` member is a list of `id`, `name` and `role`. The role is `home` or `away`.

```json
{
  "generatedAt": "2025-07-18T15:31:40Z",
  "event": {
    "id": "...",
    "status": "scheduled",
    "sport": { "code": "football", "name": "Football" },
    "competitors": [
      { "id": "...", "name": "Salzburg", "role": "home" },
      { "id": "...", "name": "Sturm", "role": "away" }
    ]
  }
}
```

- Competitors are a list, not two keys `home` and `away`. It matches the link table of [ADR-0003](0003-sports-and-competitors.md) and the provider APIs reviewed there. A third competitor does not break the shape.
- The names are read in the same statement as the event, with joins. There is never one query per event ([ADR-0011](0011-read-queries.md)).
- The names are cached with the event. No write path changes a name, so no delete on write exists for them. A changed name becomes visible after the 60-second expiry ([ADR-0014](0014-cache-freshness.md)).
- The competitor filter of the list still takes the competitor ID. Consumers learn the IDs from event responses.

## Alternatives considered

- Return IDs only and add `GET /competitors/{id}`. Rejected: every screen needs a second request per competitor, or a batch endpoint.
- Add full create, read, update and delete for sports and competitors. Rejected: it is a second resource with its own validation, caching and tests, outside the core of the brief.
- Copy the names onto the event row. Rejected: [ADR-0003](0003-sports-and-competitors.md) already rejected names as text on the event.

## Consequences

- A consumer shows an event from one response.
- A writer must know competitor IDs to create an event. They come from the seed data, and the README lists them. This is a known limitation.
- A rename is a data change outside the API. It reaches consumers after the 60-second expiry.
- The response is slightly larger than with IDs only.
- This amends the content of the event object in [ADR-0019](0019-response-shape.md), the join rule in [ADR-0011](0011-read-queries.md) and the model of [ADR-0003](0003-sports-and-competitors.md), which now states how the names reach consumers.
