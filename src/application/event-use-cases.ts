import type { EventIdGenerator } from "#src/application/event-id-generator.ts";
import type {
  CreateResult,
  EventCursor,
  EventFilters,
  EventPage,
  EventRepository,
} from "#src/application/event-repository.ts";
import type { EventView } from "#src/application/event-view.ts";
import { applyCommand, type Command, type CommandError } from "#src/domain/commands.ts";
import { createEvent, type CreateEventError } from "#src/domain/create-event.ts";
import type { CompetitorId, EventId } from "#src/domain/ids.ts";
import { err, ok, type Result } from "#src/domain/result.ts";

export interface CreateEventInput {
  readonly source: string;
  readonly externalId: string;
  readonly sport: string;
  readonly startsAt: Date;
  readonly homeCompetitorId: CompetitorId;
  readonly awayCompetitorId: CompetitorId;
}

export type CreateError =
  | CreateEventError
  | { readonly kind: "CompetitorNotFound"; readonly competitorId: CompetitorId };

export interface EventNotFound {
  readonly kind: "EventNotFound";
  readonly id: EventId;
}

export interface EventForbidden {
  readonly kind: "EventForbidden";
}

export class EventUseCases {
  private readonly repository: EventRepository;
  private readonly idGenerator: EventIdGenerator;

  constructor(repository: EventRepository, idGenerator: EventIdGenerator) {
    this.repository = repository;
    this.idGenerator = idGenerator;
  }

  async create(input: CreateEventInput): Promise<Result<CreateResult, CreateError>> {
    const competitors = await this.repository.findCompetitors([
      input.homeCompetitorId,
      input.awayCompetitorId,
    ]);
    const home = competitors.find((competitor) => competitor.id === input.homeCompetitorId);
    if (home === undefined) {
      return this.resolveRefusedCreate(input, {
        kind: "CompetitorNotFound",
        competitorId: input.homeCompetitorId,
      });
    }
    const away = competitors.find((competitor) => competitor.id === input.awayCompetitorId);
    if (away === undefined) {
      return this.resolveRefusedCreate(input, {
        kind: "CompetitorNotFound",
        competitorId: input.awayCompetitorId,
      });
    }

    const event = createEvent({ ...input, id: this.idGenerator.next(), home, away });
    if (!event.ok) {
      return this.resolveRefusedCreate(input, event.error);
    }
    return ok(await this.repository.create(event.value));
  }

  async get(id: EventId): Promise<Result<EventView, EventNotFound>> {
    const view = await this.repository.findById(id);
    return view === undefined ? err({ kind: "EventNotFound", id }) : ok(view);
  }

  list(filters: EventFilters, cursor: EventCursor | undefined, limit: number): Promise<EventPage> {
    return this.repository.list(filters, cursor, limit);
  }

  async command(
    id: EventId,
    command: Command,
    writerSource: string,
  ): Promise<Result<EventView, CommandError | EventNotFound | EventForbidden>> {
    const current = await this.get(id);
    if (!current.ok) {
      return current;
    }

    if (current.value.event.source !== writerSource) {
      return err({ kind: "EventForbidden" });
    }

    const next = applyCommand(current.value.event, command);
    if (!next.ok) {
      return next;
    }

    if (await this.repository.update(next.value, command.expectedVersion)) {
      return ok({ ...current.value, event: next.value });
    }

    const latest = await this.get(id);
    if (!latest.ok) {
      return latest;
    }
    return err({
      kind: "VersionConflict",
      expectedVersion: command.expectedVersion,
      currentVersion: latest.value.event.version,
    });
  }

  private async resolveRefusedCreate(
    input: CreateEventInput,
    error: CreateError,
  ): Promise<Result<CreateResult, CreateError>> {
    // ADR-0038: changed data must not cause a repeat to fail.
    const view = await this.repository.findBySourceIdentity(input.source, input.externalId);
    return view === undefined ? err(error) : ok({ view, created: false });
  }
}
