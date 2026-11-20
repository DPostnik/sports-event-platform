# ADR-0014: Cache freshness - delete on write for one event, expiry for lists

Status: Accepted, amended by [ADR-0029](0029-list-page-size-parameter.md)

Date: 2026-11-19

## Context

Reads reach 12,000 requests per second at peak and many of them are identical ([ADR-0001](0001-load-assumptions.md)). Design v1 put a cache in front of the database with a tentative 60-second expiry and did not say what happens to cached data after a write.

An event changes a few times in its life ([ADR-0010](0010-write-commands.md)). A cached answer is therefore valid for a long time, until one of those few changes makes it wrong.

## Decision

Two kinds of answers are cached.

| Answer | Cache key | Main freshness mechanism | Safety net |
| ------ | --------- | ------------------------ | ---------- |
| One event | event ID | Delete the entry when the event changes | Expiry after 60 seconds |
| One list page | filters and cursor | Expiry after 60 seconds | - |

- A write command deletes the cache entry of its event after the database commit.
- List pages are never deleted on write. They expire.
- For one event the expiry is not the freshness mechanism. It limits the damage when a delete is lost.

What a consumer sees after an event is cancelled:

| Request | Sees the cancellation |
| ------- | --------------------- |
| The event itself | At once, in the normal case |
| A list that contains it | Within 60 seconds |

This changes one value of [ADR-0001](0001-load-assumptions.md): acceptable staleness of a single event is no longer "up to 5 seconds". It is zero in the normal case and up to 60 seconds in the failure cases below.

## Alternatives considered

- A 5-second expiry for one event, no delete on write. Rejected: events rarely change, so the entry would be reloaded twelve times a minute for no benefit, and a change would still be visible up to 5 seconds late.
- Delete on write with no expiry at all. Rejected: a lost delete leaves wrong data forever. Two cases lose a delete. First, a reader loads the old row, a writer commits and deletes the entry, then the reader stores the old row. Second, the cache is unreachable at the moment of the delete. Both are rare; without an expiry neither repairs itself.
- A longer safety expiry, for example 5 minutes. Considered. Rejected for now: the saving is one database read per event per minute, which is negligible, and one number for the whole system is easier to explain and to test.
- Delete list pages on write as well. Rejected: an event appears in an unknown number of list pages (by day, by sport, by competitor, by cursor). Tracking those keys is complex, and a tracking error leaves data that never refreshes. The accepted list staleness is 60 seconds.
- No cache. Rejected: every read would reach the database.

## Consequences

- No answer is stale for more than 60 seconds while the database is up. [ADR-0016](0016-failure-modes.md) later allows marked older data during a database outage.
- Database read load depends on the number of distinct cache keys in use, not on the request rate. Each key is loaded about once per 60 seconds. This answers the peak concern of [ADR-0001](0001-load-assumptions.md): more viewers of the same data do not add database reads.
- Many distinct keys do add reads. Consumers that use many different time windows or cursors lower the hit rate. Not measured yet.
- After an expiry, many requests for one key can arrive together. This is handled by the failure-mode decision (open question 8).
- Where the cache runs, and what happens when it or the database is down, is still open (open question 8).
