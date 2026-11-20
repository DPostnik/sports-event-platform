import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./database.ts";

// The one place that opens a connection pool. `db.destroy()` closes it.
export function createDatabase(connectionString: string): Kysely<Database> {
  const pool = new pg.Pool({ connectionString });
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}
