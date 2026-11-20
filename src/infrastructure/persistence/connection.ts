import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "#src/infrastructure/persistence/database.ts";

// The one place that opens a connection pool. `db.destroy()` closes it.
export function createDatabase(
  connectionString: string,
  limits?: Pick<pg.PoolConfig, "max" | "connectionTimeoutMillis" | "statement_timeout">,
): Kysely<Database> {
  const pool = new pg.Pool({ connectionString, ...limits });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
