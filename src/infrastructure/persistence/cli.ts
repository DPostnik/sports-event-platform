import { createDatabase } from "#src/infrastructure/persistence/connection.ts";
import { migrateToLatest } from "#src/infrastructure/persistence/migrate.ts";
import { seed } from "#src/infrastructure/persistence/seed.ts";

// Entry point of `npm run migrate` and `npm run seed`.
const command = process.argv[2];
const connectionString = process.env["DATABASE_URL"];

if ((command !== "migrate" && command !== "seed") || connectionString === undefined) {
  console.error("usage: DATABASE_URL=postgres://... node src/infrastructure/persistence/cli.ts migrate|seed");
  process.exit(1);
}

const db = createDatabase(connectionString);
try {
  if (command === "migrate") {
    await migrateToLatest(db);
    console.log("the schema is up to date");
  } else {
    await seed(db);
    console.log("the seed data is in place");
  }
} finally {
  await db.destroy();
}
