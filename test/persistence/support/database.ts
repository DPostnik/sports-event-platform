import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { migrateToLatest } from "../../../src/infrastructure/persistence/migrate.ts";

export interface TestDatabase {
  readonly db: Kysely<unknown>;
  stop(): Promise<void>;
}

// ADR-0026: a real PostgreSQL, started in Docker for one test file, with the
// migrations applied to the empty database.
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  const db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  await migrateToLatest(db);

  return {
    db,
    async stop() {
      await db.destroy();
      await container.stop();
    },
  };
}
