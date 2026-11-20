import { sql, type Kysely } from "kysely";
import type { EventCursor, EventFilters, EventRepository } from "#src/application/event-repository.ts";
import { parseCompetitorId, type EventId } from "#src/domain/ids.ts";
import type { Database } from "#src/infrastructure/persistence/database.ts";
import { CorruptRowError, toEventView } from "#src/infrastructure/persistence/mapper.ts";

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

// The two read statements are exported so the query plan tests run EXPLAIN on
// the statements the repository runs (ADR-0013).
export function buildFindByIdQuery(db: Kysely<Database>, id: EventId) {
  return selectEventRows(db).where("e.id", "=", id);
}

export function buildListQuery(
  db: Kysely<Database>,
  filters: EventFilters,
  cursor: EventCursor | undefined,
  limit: number,
) {
  let query = selectEventRows(db);

  if (filters.from !== undefined) {
    query = query.where("e.start_time", ">=", filters.from);
  }
  if (filters.to !== undefined) {
    query = query.where("e.start_time", "<", filters.to);
  }
  if (filters.sport !== undefined) {
    query = query.where("e.sport_code", "=", filters.sport);
  }
  if (filters.status !== undefined) {
    query = query.where("e.status", "=", filters.status);
  }
  if (filters.competitorId !== undefined) {
    // The events of the competitor come from the link table through its
    // competitor index. A link is home or away, so both sides match.
    query = query.where(
      "e.id",
      "in",
      db
        .selectFrom("event_competitors")
        .select("event_id")
        .where("competitor_id", "=", filters.competitorId),
    );
  }
  if (cursor !== undefined) {
    // SQL compares the two pairs like words in a dictionary:
    // (start_time, id) > (cursor time, cursor ID). The first value decides,
    // the second breaks a tie. The index stores the same pair in the same
    // order, so the scan starts at the cursor and reads no earlier row.
    query = query.where((eb) =>
      eb(eb.refTuple("e.start_time", "e.id"), ">", eb.tuple(cursor.startsAt, cursor.id)),
    );
  }

  // One row more than the page tells whether a next page exists.
  return query
    .orderBy("e.start_time")
    .orderBy("e.id")
    .limit(limit + 1);
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
      const row = await buildFindByIdQuery(db, id).executeTakeFirst();
      return row === undefined ? undefined : toEventView(row);
    },

    async update(event, expectedVersion) {
      // One statement checks the version and writes. Two writers with the same
      // expected version cannot both match: the second waits for the first,
      // then sees the new version and changes no row.
      const updated = await db
        .updateTable("events")
        .set({
          start_time: event.startsAt,
          status: event.status,
          phase: event.phase ?? null,
          version: event.version,
          updated_at: sql<Date>`now()`,
        })
        .where("id", "=", event.id)
        .where("version", "=", expectedVersion)
        .returning("id")
        .executeTakeFirst();
      return updated !== undefined;
    },

    async list(filters, cursor, limit) {
      const rows = await buildListQuery(db, filters, cursor, limit).execute();
      const views = rows.slice(0, limit).map(toEventView);
      const last = views.at(-1);
      if (rows.length <= limit || last === undefined) {
        return { views };
      }
      return { views, nextCursor: { startsAt: last.event.startsAt, id: last.event.id } };
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
