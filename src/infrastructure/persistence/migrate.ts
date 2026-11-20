import type { Kysely } from "kysely";
import { Migrator, type Migration } from "kysely/migration";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import * as sportsAndCompetitors from "#src/infrastructure/persistence/migrations/0001-sports-and-competitors.ts";
import * as events from "#src/infrastructure/persistence/migrations/0002-events.ts";
import * as eventCompetitors from "#src/infrastructure/persistence/migrations/0003-event-competitors.ts";
import * as readIndexes from "#src/infrastructure/persistence/migrations/0004-read-indexes.ts";

// A fixed list instead of a directory scan: the compiler checks that every
// migration file exports `up` and `down`. The keys set the order.
const MIGRATIONS: Record<string, Migration> = {
  "0001-sports-and-competitors": sportsAndCompetitors,
  "0002-events": events,
  "0003-event-competitors": eventCompetitors,
  "0004-read-indexes": readIndexes,
};

// PER-8: brings an empty or older database to the current schema. Kysely
// records the applied migrations in its own table and runs only the new ones.
export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: () => Promise.resolve(MIGRATIONS) },
  });
  const { error } = await migrator.migrateToLatest();
  if (error !== undefined) {
    throw new Error("migration failed", { cause: error });
  }
}
