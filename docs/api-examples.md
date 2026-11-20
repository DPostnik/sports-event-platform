# API examples

Run the database setup and seed commands in the [README](../README.md). Stop any running API before starting it with writer credentials.

Run the blocks in this file in order, in one shell, on a freshly seeded database. Every command is copy-paste ready. The sample responses were captured from the running service. Event IDs, `generatedAt` and cursors differ on every run, so your values will differ. The service returns compact JSON. The samples are pretty-printed, show only the headers that matter, and shorten the `competitors` list to `[ ... ]` after the first sample. Where a list holds more events than the sample, a note says so.

The snippet sets the connection settings and a temporary key in the shell that will make the requests. The SHA-256 hash of the key grants access to the `manual` source used by the seed events.

```sh
export DATABASE_URL='postgresql://sports:sports@127.0.0.1:5432/sports'
export REDIS_URL='redis://127.0.0.1:6379'
WRITER_KEY="$(node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(randomBytes(32).toString("hex"));')"
export WRITER_KEYS="$(WRITER_KEY="$WRITER_KEY" node --input-type=module -e 'import { createHash } from "node:crypto"; const hash = createHash("sha256").update(process.env.WRITER_KEY).digest("hex"); process.stdout.write(JSON.stringify({ [hash]: "manual" }));')"
npm start 2>&1 | tee -a api.log &
export API_URL='http://127.0.0.1:3000'
curl --fail-with-body --retry 10 --retry-connrefused "$API_URL/ready"
```

## Create the football and ice hockey matches

A writer creates an event with its own external ID. The examples use external IDs distinct from the seed. The first request for each ID returns 201. The `-i` option prints the status line and the headers.

```sh
curl -i --fail-with-body "$API_URL/events" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "externalId": "example-football",
    "sport": "football",
    "startsAt": "2025-07-18T18:30:00+02:00",
    "homeCompetitorId": "0198c5a0-0000-7000-8000-000000000001",
    "awayCompetitorId": "0198c5a0-0000-7000-8000-000000000002"
  }'

curl --fail-with-body "$API_URL/events" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "externalId": "example-ice-hockey",
    "sport": "ice_hockey",
    "startsAt": "2025-10-23T09:45:00+02:00",
    "homeCompetitorId": "0198c5a0-0000-7000-8000-000000000003",
    "awayCompetitorId": "0198c5a0-0000-7000-8000-000000000004"
  }'
```

The first command returns the new event with source `manual`, status `scheduled` and version `1`. The service stores the time in UTC ([ADR-0005](adr/0005-time-in-utc.md)).

```http
HTTP/1.1 201 Created

{
  "generatedAt": "2026-11-20T19:35:21.676Z",
  "event": {
    "id": "01a1fa74-cf45-7088-bd0a-6f65cccd120f",
    "source": "manual",
    "externalId": "example-football",
    "sport": { "code": "football", "name": "Football" },
    "startsAt": "2025-07-18T16:30:00.000Z",
    "competitors": [
      { "id": "0198c5a0-0000-7000-8000-000000000001", "name": "Salzburg", "role": "home" },
      { "id": "0198c5a0-0000-7000-8000-000000000002", "name": "Sturm", "role": "away" }
    ],
    "version": 1,
    "status": "scheduled"
  }
}
```

A writer that retries after a timeout sends the same request again. The service returns 200 and the stored event, and creates nothing ([ADR-0038](adr/0038-repeated-create-returns-stored-event.md)).

```sh
curl -i --fail-with-body "$API_URL/events" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{
    "externalId": "example-football",
    "sport": "football",
    "startsAt": "2025-07-18T18:30:00+02:00",
    "homeCompetitorId": "0198c5a0-0000-7000-8000-000000000001",
    "awayCompetitorId": "0198c5a0-0000-7000-8000-000000000002"
  }'
```

```http
HTTP/1.1 200 OK
```

The body has the same event ID (`01a1fa74-cf45-7088-bd0a-6f65cccd120f` in this run) and version `1`.

## Get one event and revalidate it

A consumer reads one event by ID. GET needs no key. The `ETag` is the event version, and `Cache-Control: no-cache` tells caches to revalidate before they reuse the response ([ADR-0039](adr/0039-revalidation-and-weak-etags.md)). This example reads the seeded football match.

```sh
EVENT_URL="$API_URL/events/0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90"
curl -i "$EVENT_URL"
```

```http
HTTP/1.1 200 OK
etag: W/"1"
cache-control: no-cache
age: 0

{
  "generatedAt": "2026-11-20T19:35:21.735Z",
  "event": {
    "id": "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
    "source": "manual",
    "externalId": "seed-football-salzburg-sturm",
    "sport": { "code": "football", "name": "Football" },
    "startsAt": "2025-07-18T16:30:00.000Z",
    "competitors": [ ... ],
    "version": 1,
    "status": "scheduled"
  }
}
```

A consumer that polls sends the tag back in `If-None-Match`. While the event is unchanged, the service answers 304 with no body, so the poll costs almost nothing.

```sh
curl -i "$EVENT_URL" -H 'If-None-Match: W/"1"'
```

```http
HTTP/1.1 304 Not Modified
etag: W/"1"
cache-control: no-cache
age: 0
```

## List events

A consumer lists the events in a time window. `from` is inclusive and `to` is exclusive ([ADR-0041](adr/0041-time-window-bounds.md)). The service sorts events by start time, then by ID. A list is cached for 60 seconds (`Cache-Control: max-age=60`) and has its own `ETag`.

```sh
curl -i "$API_URL/events?from=2025-01-01T00:00:00Z&to=2026-01-01T00:00:00Z"
```

```http
HTTP/1.1 200 OK
etag: W/"xj5p_-ya0m0Sry7efLQFQGnEUyHNQPDddzeQteoEj-Q"
cache-control: max-age=60
age: 0
```

The response holds four events: the two seeded events and the two created above. It has the same shape as the first page below, without `nextCursor`.

Filter by sport with `sport` (the sport code) and by status with `status` (`scheduled`, `live`, `postponed`, `finished` or `cancelled`). The first command returns the two ice hockey events. Nothing is live yet, so the second command asks for the scheduled events and returns all four. The `competitor` parameter filters by competitor ID, and the filters combine.

```sh
curl -i "$API_URL/events?sport=ice_hockey"
curl -i "$API_URL/events?status=scheduled"
```

## Paginate

A consumer pages through a long list with `limit` (1 to 100, default 50). When more events follow, the response has a `nextCursor`. The consumer sends it back as `cursor` with the same filters ([ADR-0012](adr/0012-cursor-pagination.md)). The last page has no `nextCursor`.

```sh
curl -i "$API_URL/events?limit=1"
```

```json
{
  "generatedAt": "2026-11-20T19:35:21.846Z",
  "events": [
    {
      "id": "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
      "source": "manual",
      "externalId": "seed-football-salzburg-sturm",
      "sport": { "code": "football", "name": "Football" },
      "startsAt": "2025-07-18T16:30:00.000Z",
      "competitors": [ ... ],
      "version": 1,
      "status": "scheduled"
    }
  ],
  "nextCursor": "MjAyNS0wNy0xOFQxNjozMDowMC4wMDBafDAxOThjNWEwLTdiMWUtN2QzYS05YzRlLTJmNmE4YjFkNWU5MA"
}
```

This command stores the cursor of the first page in a shell variable. The Node.js one-liner reads the response from standard input. Then the second command reads the next page.

```sh
CURSOR="$(curl -s "$API_URL/events?limit=1" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).nextCursor')"
curl -i "$API_URL/events?limit=1&cursor=$CURSOR"
```

The second page holds the football match created above and its own `nextCursor`.

## Start a seeded match and read it

A writer runs a command with the version it last read. On a freshly seeded database, the start command returns 200 with status `live`, version `2` and the phase. The command uses the `EVENT_URL` from above.

```sh
curl -i --fail-with-body "$EVENT_URL/start" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"expectedVersion":1,"phase":"1st_half"}'
```

```json
{
  "generatedAt": "2026-11-20T19:35:21.959Z",
  "event": {
    "id": "0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90",
    "source": "manual",
    "externalId": "seed-football-salzburg-sturm",
    "sport": { "code": "football", "name": "Football" },
    "startsAt": "2025-07-18T16:30:00.000Z",
    "competitors": [ ... ],
    "version": 2,
    "status": "live",
    "phase": "1st_half"
  }
}
```

The consumer now polls with its old tag `W/"1"`. The version changed, so the service answers 200 with the new event and the new tag `W/"2"`, not 304.

```sh
curl -i "$EVENT_URL" -H 'If-None-Match: W/"1"'
```

```http
HTTP/1.1 200 OK
etag: W/"2"
cache-control: no-cache
age: 0
```

The body is the live event from the start response, with a new `generatedAt`.

A list page is cached for 60 seconds, so `GET /events?status=live` can show the started match up to 60 seconds later ([ADR-0014](adr/0014-cache-freshness.md)). A read of one event shows the change at once.

## Error responses

Errors use the `application/problem+json` format with a stable `code` ([ADR-0018](adr/0018-error-format.md)). The examples use `curl -i`, which prints the status and does not stop a pasted block.

A validation error returns 400 and lists the invalid fields. This request has a start time that is not an ISO 8601 date.

```sh
curl -i "$API_URL/events" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"externalId":"bad","sport":"football","startsAt":"tomorrow","homeCompetitorId":"0198c5a0-0000-7000-8000-000000000001","awayCompetitorId":"0198c5a0-0000-7000-8000-000000000002"}'
```

```http
HTTP/1.1 400 Bad Request
content-type: application/problem+json; charset=utf-8

{
  "errors": [{ "field": "startsAt", "message": "Invalid ISO datetime" }],
  "type": "https://example.invalid/problems/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more request fields are invalid.",
  "code": "VALIDATION_FAILED"
}
```

An unknown event returns 404.

```sh
curl -i "$API_URL/events/0198c5a0-0000-7000-8000-00000000ffff"
```

```http
HTTP/1.1 404 Not Found
content-type: application/problem+json; charset=utf-8

{
  "type": "https://example.invalid/problems/not-found",
  "title": "Not found",
  "status": 404,
  "detail": "Event 0198c5a0-0000-7000-8000-00000000ffff does not exist.",
  "code": "NOT_FOUND"
}
```

A stale `expectedVersion` returns 409 `VERSION_CONFLICT` with the current version ([ADR-0009](adr/0009-optimistic-concurrency.md)). Someone else changed the event first. Here the football match is at version `2`, but the writer still sends `1`.

```sh
curl -i "$EVENT_URL/phase" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"expectedVersion":1,"phase":"2nd_half"}'
```

```http
HTTP/1.1 409 Conflict
content-type: application/problem+json; charset=utf-8

{
  "currentVersion": 2,
  "type": "https://example.invalid/problems/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "detail": "Expected version 1, current version is 2.",
  "code": "VERSION_CONFLICT"
}
```

A writer that gets 409 reads the event again, checks that the command still makes sense, and retries with the current version.

```sh
curl -i "$EVENT_URL/phase" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"expectedVersion":2,"phase":"2nd_half"}'
```

The response is 200 with version `3` and phase `2nd_half`.

A missing or invalid bearer key returns 401 with `WWW-Authenticate: Bearer` ([ADR-0042](adr/0042-writer-authentication.md)).

```sh
curl -i "$EVENT_URL/phase" \
  -H 'Content-Type: application/json' \
  --data '{"expectedVersion":3,"phase":"extra_time"}'
```

```http
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer
content-type: application/problem+json; charset=utf-8

{
  "type": "https://example.invalid/problems/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "A valid writer bearer key is required.",
  "code": "UNAUTHORIZED"
}
```

A key for a different source returns 403 with problem code `FORBIDDEN` when used to command this event.

## Clean up

Bring the service back to the foreground with `fg` and stop it with Ctrl-C. Run `unset WRITER_KEY WRITER_KEYS` to clear the local configuration.
