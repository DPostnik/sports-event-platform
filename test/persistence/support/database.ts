import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql, type Kysely } from "kysely";
import { createDatabase } from "../../../src/infrastructure/persistence/connection.ts";
import type { Database } from "../../../src/infrastructure/persistence/database.ts";
import { migrateToLatest } from "../../../src/infrastructure/persistence/migrate.ts";

export interface TestDatabase {
  readonly db: Kysely<Database>;
  stop(): Promise<void>;
}

// ADR-0026: a real PostgreSQL, started in Docker for one test file, with the
// migrations applied to the empty database.
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const db = createDatabase(container.getConnectionUri());
  await migrateToLatest(db);

  return {
    db,
    async stop() {
      await db.destroy();
      await container.stop();
    },
  };
}

export const SALZBURG = "0198c5a0-0000-7000-8000-000000000001";
export const STURM = "0198c5a0-0000-7000-8000-000000000002";

// Empties every table, then stores one sport and two competitors.
export async function resetData(db: Kysely<Database>): Promise<void> {
  await sql`TRUNCATE event_competitors, events, competitors, sports`.execute(db);
  await sql`INSERT INTO sports (code, name) VALUES ('football', 'Football')`.execute(db);
  await sql`
    INSERT INTO competitors (id, sport_code, name)
    VALUES (${SALZBURG}, 'football', 'Salzburg'), (${STURM}, 'football', 'Sturm')
  `.execute(db);
}
