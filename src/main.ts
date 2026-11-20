import { sql } from "kysely";
import { v7 } from "uuid";
import { EventUseCases } from "#src/application/event-use-cases.ts";
import { readConfiguration, type Configuration } from "#src/config/environment.ts";
import { parseEventId } from "#src/domain/ids.ts";
import { buildApp } from "#src/http/app.ts";
import { createDatabase } from "#src/infrastructure/persistence/connection.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";

function isDatabaseUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error instanceof AggregateError) {
    const causes: readonly unknown[] = error.errors;
    return causes.length > 0 && causes.every(isDatabaseUnavailable);
  }
  if (!("code" in error) || typeof error.code !== "string") {
    return false;
  }
  return /^08[A-Z0-9]{3}$/.test(error.code) || [
    "57P01", "57P02", "57P03",
    "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND",
  ].includes(error.code);
}

export async function buildService(config: Configuration, logger = true) {
  const db = createDatabase(config.databaseUrl, {
    max: config.poolSize,
    connectionTimeoutMillis: config.poolWaitMs,
    statement_timeout: config.statementTimeoutMs,
  });
  const repository = createEventRepository(db);
  const events = new EventUseCases(repository, {
    next() {
      const id = parseEventId(v7());
      if (!id.ok) {
        throw new Error("UUID generator returned an invalid event ID");
      }
      return id.value;
    },
  });

  try {
    const app = await buildApp({
      events,
      clock: { now: () => new Date() },
      checkReadiness: async () => {
        await sql`SELECT 1`.execute(db);
      },
      isUnavailable: isDatabaseUnavailable,
      logger,
    });
    app.addHook("onClose", () => db.destroy());
    return app;
  } catch (error) {
    await db.destroy();
    throw error;
  }
}

async function start(): Promise<void> {
  const config = readConfiguration(process.env);
  const app = await buildService(config);

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await app.close();
    throw error;
  }

  const shutdown = (signal: NodeJS.Signals): void => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    app.log.info({ signal }, "Stopping HTTP service");
    void app.close().catch((error: unknown) => {
      app.log.error({ err: error }, "HTTP service shutdown failed");
      process.exitCode = 1;
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  try {
    await start();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "HTTP service startup failed");
    process.exitCode = 1;
  }
}
