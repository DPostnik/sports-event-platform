import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE event_competitors (
      event_id uuid NOT NULL REFERENCES events (id),
      competitor_id uuid NOT NULL REFERENCES competitors (id),
      role text NOT NULL
        CONSTRAINT event_competitors_role_check CHECK (role IN ('home', 'away')),
      PRIMARY KEY (event_id, competitor_id),
      CONSTRAINT event_competitors_event_id_role_key UNIQUE (event_id, role)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE event_competitors`.execute(db);
}
