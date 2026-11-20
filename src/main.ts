import { createClient } from "@redis/client";
import { createRedisCache } from "#src/infrastructure/cache/redis-cache.ts";
import { sql } from "kysely";
import { v7 } from "uuid";
import { EventUseCases } from "#src/application/event-use-cases.ts";
import { readConfiguration, type Configuration } from "#src/config/environment.ts";
import { parseEventId } from "#src/domain/ids.ts";
import { buildApp } from "#src/http/app.ts";
import { databaseFailure } from "#src/infrastructure/persistence/database-failure.ts";
import { createDatabase } from "#src/infrastructure/persistence/connection.ts";
import { createEventRepository } from "#src/infrastructure/persistence/event-repository.ts";

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

  const redis = config.redisUrl === undefined ? undefined : createClient({
    url: config.redisUrl,
    disableOfflineQueue: true,
    commandOptions: { timeout: 200 },
  });
  try {
    const app = await buildApp({
      events,
      cache: redis && createRedisCache(redis),
      clock: { now: () => new Date() },
      checkReadiness: async () => {
        await sql`SELECT 1`.execute(db);
      },
      databaseFailure,
      retryAfterSeconds: config.retryAfterSeconds,
      logger,
    });
    if (redis) {
      redis.on("error", (err: Error) => {
        app.log.warn({ err }, "Redis connection failed");
      });
      void redis.connect().catch((err: unknown) => {
        app.log.warn({ err }, "Redis connection stopped");
      });
    }
    app.addHook("onClose", async () => {
      if (redis?.isOpen) redis.destroy();
      await db.destroy();
    });
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
