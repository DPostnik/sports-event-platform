import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE TABLE sports (
      code text PRIMARY KEY
        CONSTRAINT sports_code_format_check CHECK (code ~ '^[a-z][a-z0-9_]{0,63}$'),
      name text NOT NULL
        CONSTRAINT sports_name_check CHECK (length(name) > 0)
    )
  `.execute(db);

  await sql`
    CREATE TABLE competitors (
      id uuid PRIMARY KEY,
      sport_code text NOT NULL REFERENCES sports (code),
      name text NOT NULL
        CONSTRAINT competitors_name_check CHECK (length(name) > 0)
    )
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`DROP TABLE competitors`.execute(db);
  await sql`DROP TABLE sports`.execute(db);
}
