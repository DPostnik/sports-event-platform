# Sports Event API

The service tracks match schedules and live status. It stores events in PostgreSQL and caches reads in Redis.

## Run locally

Install Node.js 24 with npm and start Docker with Compose v2. Run these commands from the repository root.

```sh
npm ci
docker compose up -d --wait
export DATABASE_URL='postgresql://sports:sports@127.0.0.1:5432/sports'
export REDIS_URL='redis://127.0.0.1:6379'
npm run migrate
npm run seed
npm start 2>&1 | tee -a api.log
```

The start command shows API output in the terminal and appends it to `api.log` in the repository root. The file includes startup errors and request logs and survives restarts. Git ignores it.

The seed creates two matches: Salzburg vs. Sturm (football) and KAC vs. Capitals (ice hockey). In a second terminal, check database readiness and read the football match.

```sh
curl --fail http://127.0.0.1:3000/ready
curl --fail http://127.0.0.1:3000/events/0198c5a0-7b1e-7d3a-9c4e-2f6a8b1d5e90
```

Readiness returns `{"status":"ok"}`. On a fresh database, the match has status `scheduled`, version `1` and a start time of `2025-07-18T16:30:00.000Z`. The service publishes its OpenAPI description at `/openapi.json`.

Press Ctrl-C in the service terminal to stop the API. Run `docker compose down` to stop PostgreSQL and Redis. The PostgreSQL volume retains the event data.

## Write events locally

GET requests are public. POST requests require a bearer key. Set `WRITER_KEYS` to a JSON object that maps lowercase SHA-256 key hashes to source names. Leaving it unset enables read-only access. Create takes the source from the key. Commands require a key for the event's source.

Follow the [API examples](docs/api-examples.md) to generate a local key, create both matches and run a command.
