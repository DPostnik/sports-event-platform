import type { Kysely } from "kysely";
import type { EventRepository } from "../../application/event-repository.ts";
import { parseCompetitorId } from "../../domain/ids.ts";
import type { Database } from "./database.ts";
import { CorruptRowError, toEventView } from "./mapper.ts";

// One event with its sport and both competitors in one statement, so a list
// never runs one query per event (ADR-0011). An event has exactly one home
// and one away link, so the joins give one row per event.
function selectEventRows(db: Kysely<Database>) {
  return db
    .selectFrom("events as e")
    .innerJoin("sports as s", "s.code", "e.sport_code")
    .innerJoin("event_competitors as home_link", (join) =>
      join.onRef("home_link.event_id", "=", "e.id").on("home_link.role", "=", "home"),
    )
    .innerJoin("competitors as home", "home.id", "home_link.competitor_id")
    .innerJoin("event_competitors as away_link", (join) =>
      join.onRef("away_link.event_id", "=", "e.id").on("away_link.role", "=", "away"),
    )
    .innerJoin("competitors as away", "away.id", "away_link.competitor_id")
    .select([
      "e.id",
      "e.source",
      "e.external_id",
      "e.sport_code",
      "s.name as sport_name",
      "e.start_time",
      "e.status",
      "e.phase",
      "e.version",
      "home.id as home_competitor_id",
      "home.name as home_competitor_name",
      "away.id as away_competitor_id",
      "away.name as away_competitor_name",
    ]);
}

export function createEventRepository(db: Kysely<Database>): EventRepository {
  return {
    async create(event) {
      return db.transaction().execute(async (trx) => {
        // DO NOTHING on the (source, external_id) key. A concurrent create of
        // the same key waits here for the other transaction, then gets no row.
        const inserted = await trx
          .insertInto("events")
          .values({
            id: event.id,
            source: event.source,
            external_id: event.externalId,
            sport_code: event.sport,
            start_time: event.startsAt,
            status: event.status,
            phase: event.phase ?? null,
            version: event.version,
          })
          .onConflict((conflict) => conflict.columns(["source", "external_id"]).doNothing())
          .returning("id")
          .executeTakeFirst();

        if (inserted !== undefined) {
          await trx
            .insertInto("event_competitors")
            .values([
              { event_id: event.id, competitor_id: event.homeCompetitorId, role: "home" },
              { event_id: event.id, competitor_id: event.awayCompetitorId, role: "away" },
            ])
            .execute();
        }

        // Read the stored event: the new one, or the one that already existed.
        const row = await selectEventRows(trx)
          .where("e.source", "=", event.source)
          .where("e.external_id", "=", event.externalId)
          .executeTakeFirstOrThrow();
        return { view: toEventView(row), created: inserted !== undefined };
      });
    },

    async findById(id) {
      const row = await selectEventRows(db).where("e.id", "=", id).executeTakeFirst();
      return row === undefined ? undefined : toEventView(row);
    },

    async findCompetitors(ids) {
      if (ids.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("competitors")
        .select(["id", "sport_code"])
        .where("id", "in", ids)
        .execute();
      return rows.map((row) => {
        const id = parseCompetitorId(row.id);
        if (!id.ok) {
          throw new CorruptRowError(row.id, "the competitor ID is not a UUID");
        }
        return { id: id.value, sport: row.sport_code };
      });
    },
  };
}
