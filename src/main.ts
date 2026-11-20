import { createClient } from "@redis/client";
import { createFallbackCache } from "#src/infrastructure/cache/fallback-cache.ts";
import { createInMemoryCache } from "#src/infrastructure/cache/in-memory-cache.ts";
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

  const redis =
    config.redisUrl === undefined
      ? undefined
      : createClient({
          url: config.redisUrl,
          disableOfflineQueue: true,
          commandOptions: { timeout: config.redisCommandTimeoutMs },
        });
  const clock = { now: () => new Date() };
  // The app logger exists only after buildApp, which needs the cache first.
  let reportCacheFailure: (error: unknown) => void = () => {};
  try {
    const app = await buildApp({
      events,
      writerKeys: config.writerKeys,
      cache:
        redis &&
        createFallbackCache(
          createRedisCache(redis),
          createInMemoryCache(clock, config.localCacheMaxEntries),
          config.localCacheTtlSeconds,
          (error) => {
            reportCacheFailure(error);
          },
        ),
      clock,
      checkReadiness: async () => {
        await sql`SELECT 1`.execute(db);
      },
      databaseFailure,
      retryAfterSeconds: config.retryAfterSeconds,
      logger,
    });
    reportCacheFailure = (err) => {
      app.log.warn({ err }, "Shared cache failed, using the local cache");
    };
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
