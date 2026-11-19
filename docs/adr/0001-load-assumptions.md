# ADR-0001: Load and data volume assumptions

Status: Accepted

Date: 2026-11-19

## Context

The brief asks for the foundation of a long-lived, high-traffic service but gives no numbers. Design v1 had only a read estimate. Sizing decisions (cache, pagination, indexes, concurrency control) need explicit numbers.

## Decision

The service is sized for these values.

| Parameter | Value | Basis |
| --------- | ----- | ----- |
| New events per year | 400,000 to 1,000,000; sized for 1,000,000 | Lower figure was mentioned for the Sports Media product during the interview process; upper figure is Sportradar's public company-wide number |
| New events per day | about 2,700 on average, up to 10,000 on a peak day | Derived; peak on weekends (estimate) |
| Rows after 5 years | about 5 million | Derived |
| Writes per event over its life | 5 to 10 (create, reschedule, start, finish, corrections) | Estimate |
| Write rate, average | below 1 per second | Derived: about 10 million writes per year |
| Write rate, peak | 50 to 100 per second | Estimate: bulk schedule import |
| Read rate, average | 2,400 requests per second | Estimate: 24,000 concurrent viewers polling every 10 seconds |
| Read rate, peak | 10,000 to 12,000 requests per second | Estimate: factor 5 on a major tournament day |
| Acceptable staleness, lists | up to 60 seconds | The interview process described this data as refreshed within minutes, not at betting latency |
| Acceptable staleness, single event | up to 5 seconds | Estimate |

Values marked as estimates are the author's assumptions, not Sportradar data. Real traffic figures are not public. The direct consumers are likely backend systems of media companies that cache on their side, so real load may be lower and burstier.

## Alternatives considered

- Keep only the v1 read estimate. Rejected: it says nothing about data volume, writes or staleness.
- Size for the lower figure of 400,000 events per year. Rejected: the upper bound costs nothing at this scale and is safer.
- Design without numbers. Rejected: the choices could not be justified.

## Consequences

- About 5 million rows is small for a single relational database. There is no sharding. Indexes are enough. Date-based partitioning is a described future option.
- Reads exceed writes by more than 1,000 to 1 on average. This justifies a read cache and, later, read replicas.
- Writes are rare, so conflicts will be rare. This favors optimistic concurrency control.
- A 60-second list TTL fits the accepted staleness.
- At peak, 12,000 requests per second with a 90% cache hit rate leaves 1,200 database reads per second. At the v1 assumption of 100 ms per read, that is about 120 reads in flight. This exceeds a small connection pool. The cache decision (open question 8) must address this with a higher hit rate, faster indexed reads, or replicas.
