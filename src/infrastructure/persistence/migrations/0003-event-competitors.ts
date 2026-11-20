import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE event_competitors (
      event_id uuid NOT NULL,
      competitor_id uuid NOT NULL,
      sport_code text NOT NULL,
      role text NOT NULL
        CONSTRAINT event_competitors_role_check CHECK (role IN ('home', 'away')),
      PRIMARY KEY (event_id, competitor_id),
      CONSTRAINT event_competitors_event_id_role_key UNIQUE (event_id, role),
      CONSTRAINT event_competitors_event_id_sport_code_fkey
        FOREIGN KEY (event_id, sport_code) REFERENCES events (id, sport_code),
      CONSTRAINT event_competitors_competitor_id_sport_code_fkey
        FOREIGN KEY (competitor_id, sport_code) REFERENCES competitors (id, sport_code)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE event_competitors`.execute(db);
}
