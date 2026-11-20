# ADR-0012: Cursor pagination on start time and event ID

Status: Accepted, amended by [ADR-0029](0029-list-page-size-parameter.md)

Date: 2026-11-19

## Context

A list can match thousands of events ([ADR-0011](0011-read-queries.md)). The response must be cut into pages. Design v1 used a page number, and the list cache key contained "the filters and the page".

A page number has two problems:

- Cost grows with distance. To return page 60 with 50 events per page, the database reads 3,000 rows and discards 2,950.
- The list shifts under the reader. If an event is created or cancelled between two requests, every later position moves. The reader sees a duplicate or misses an event.

## Decision

- The list uses a cursor. A cursor means "continue after this event". It holds the start time and the ID of the last event of the previous page.
- The order is start time, then event ID ([ADR-0011](0011-read-queries.md)). The ID makes the position unique when many events start at the same time.
- Page size is 50 by default and 100 at most.
- The response carries `nextCursor`. It is absent on the last page.
- The cursor is opaque to consumers. They send it back unchanged, with the same filters.
- There is no page number, no row skip and no total count.
- A consumer that wants to jump uses the time-window filter, not a page number.

This replaces the page number of design v1.

## Alternatives considered

- Page number (offset). Rejected for the two problems above. It is the natural choice only where a person browses numbered pages of a table.
- Cursor plus an optional bounded row skip, so a consumer can move several pages ahead. This is technically possible: the database starts at the cursor and discards the skipped rows. Rejected: the cost grows with the skip distance again, the shifting problem returns, and a second mechanism with its own limit has to be explained. The time-window filter gives a direct jump without reading skipped rows.
- Return a total count with each page. Rejected: counting all matches costs a full scan of the matching range on every request.

## Consequences

- A list request that has its own index in [ADR-0013](0013-indexes.md) reads one page of rows from that index, however deep the consumer is in the list. Two requests read more. Sport with status reads the rows of one index and drops the rows that fail the other filter. The competitor filter reads all events of the competitor and sorts them. Both are known compromises of [ADR-0013](0013-indexes.md).
- Events created or cancelled during paging do not cause duplicates or gaps for events that still match.
- An index cannot answer "the row 250 positions after this one" without walking those rows. It stores values in order, not row numbers. This is why a jump by page count is not free, with or without a cursor.
- Consumers cannot show "page 3 of 60" or jump to an arbitrary page. Known limitation, acceptable for schedule screens.
- The list cache key contains the filters and the cursor (open question 8).
- A reschedule moves an event in the order. A reader in the middle of paging may see it twice or not at all. This is inherent in paging over changing data and is documented for consumers.
