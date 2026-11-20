import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE events (
      id uuid PRIMARY KEY,
      source text NOT NULL
        CONSTRAINT events_source_format_check CHECK (source ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
      external_id text NOT NULL
        CONSTRAINT events_external_id_check CHECK (length(external_id) BETWEEN 1 AND 128),
      sport_code text NOT NULL REFERENCES sports (code),
      start_time timestamptz(3) NOT NULL,
      status text NOT NULL
        CONSTRAINT events_status_check
        CHECK (status IN ('scheduled', 'live', 'postponed', 'finished', 'cancelled')),
      phase text,
      version integer NOT NULL
        CONSTRAINT events_version_check CHECK (version > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT events_phase_only_when_live_check CHECK (phase IS NULL OR status = 'live'),
      CONSTRAINT events_source_external_id_key UNIQUE (source, external_id)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE events`.execute(db);
}
