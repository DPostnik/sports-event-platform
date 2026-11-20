import type { Generated } from "kysely";

// The tables as Kysely sees them, written by hand to match the migrations
// (ADR-0023). `Generated` marks a column the database fills by default.
// These types stay inside the persistence layer.

interface SportsTable {
  code: string;
  name: string;
}

interface CompetitorsTable {
  id: string;
  sport_code: string;
  name: string;
}

interface EventsTable {
  id: string;
  source: string;
  external_id: string;
  sport_code: string;
  start_time: Date;
  status: string;
  phase: string | null;
  version: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

interface EventCompetitorsTable {
  event_id: string;
  competitor_id: string;
  role: string;
}

export interface Database {
  sports: SportsTable;
  competitors: CompetitorsTable;
  events: EventsTable;
  event_competitors: EventCompetitorsTable;
}
