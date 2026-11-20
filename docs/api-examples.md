# API examples

Run the database setup and seed commands in the [README](../README.md). Stop any running API before starting it with writer credentials.

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

The examples use external IDs distinct from the seed. The first request for each ID returns 201. A repeat with the same key and ID returns 200 and the stored event.

```sh
curl --fail-with-body "$API_URL/events" \
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

Both responses include `generatedAt` and an `event` with its service ID. On creation, the event has source `manual`, status `scheduled` and version `1`.

## Start a seeded match and read it

On a freshly seeded database, the start command returns 200 with status `live` and version `2`. GET works without the writer key.

```sh
EVENT_URL="$API_URL/events/0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90"
curl --fail-with-body "$EVENT_URL/start" \
  -H "Authorization: Bearer $WRITER_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"expectedVersion":1,"phase":"1st_half"}'
curl --fail-with-body "$EVENT_URL"
```

A missing or invalid bearer key returns 401 with `WWW-Authenticate: Bearer` and problem code `UNAUTHORIZED`. A key for a different source returns 403 with problem code `FORBIDDEN` when used to command this event.

Bring the service back to the foreground with `fg` and stop it with Ctrl-C. Run `unset WRITER_KEY WRITER_KEYS` to clear the local configuration.
