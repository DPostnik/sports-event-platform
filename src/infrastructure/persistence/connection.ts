import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "#src/infrastructure/persistence/database.ts";

// The one place that opens a connection pool. `db.destroy()` closes it.
export function createDatabase(
  connectionString: string,
  limits?: Pick<pg.PoolConfig, "max" | "connectionTimeoutMillis" | "statement_timeout">,
): Kysely<Database> {
  const pool = new pg.Pool({ connectionString, ...limits });
  // pg removes broken idle connections. Its unhandled error event would stop the API.
  pool.on("error", (error: Error) => {
    console.warn("Idle PostgreSQL connection failed:", error.message);
  });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
