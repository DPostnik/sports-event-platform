import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`CREATE INDEX events_start_time_id_idx ON events (start_time, id)`.execute(db);
  await sql`
    CREATE INDEX events_sport_code_start_time_id_idx ON events (sport_code, start_time, id)
  `.execute(db);
  await sql`
    CREATE INDEX events_status_start_time_id_idx ON events (status, start_time, id)
  `.execute(db);
  await sql`
    CREATE INDEX event_competitors_competitor_id_idx ON event_competitors (competitor_id)
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP INDEX event_competitors_competitor_id_idx`.execute(db);
  await sql`DROP INDEX events_status_start_time_id_idx`.execute(db);
  await sql`DROP INDEX events_sport_code_start_time_id_idx`.execute(db);
  await sql`DROP INDEX events_start_time_id_idx`.execute(db);
}
