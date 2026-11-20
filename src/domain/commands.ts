import type { Event, EventStatus } from "#src/domain/event.ts";
import { isPhaseOfSport } from "#src/domain/phases.ts";
import { err, ok, type Result } from "#src/domain/result.ts";

// ADR-0010: an event changes only through these six commands. Each carries
// its own input and the version the writer read (ADR-0009).
export type Command =
  | { readonly kind: "start"; readonly expectedVersion: number; readonly phase?: string }
  | { readonly kind: "finish"; readonly expectedVersion: number }
  | { readonly kind: "postpone"; readonly expectedVersion: number }
  | { readonly kind: "reschedule"; readonly expectedVersion: number; readonly startsAt: Date }
  | { readonly kind: "cancel"; readonly expectedVersion: number }
  | { readonly kind: "changePhase"; readonly expectedVersion: number; readonly phase: string };

export type CommandKind = Command["kind"];

// ADR-0002: the statuses each command is allowed from. A status that no
// command is allowed from is terminal: finished and cancelled.
export const ALLOWED_FROM: Record<CommandKind, readonly EventStatus[]> = {
  start: ["scheduled"],
  finish: ["live"],
  postpone: ["scheduled"],
  reschedule: ["scheduled", "postponed"],
  cancel: ["scheduled", "postponed"],
  changePhase: ["live"],
};

export type CommandError =
  | {
      readonly kind: "VersionConflict";
      readonly expectedVersion: number;
      readonly currentVersion: number;
    }
  | {
      readonly kind: "TransitionNotAllowed";
      readonly command: CommandKind;
      readonly status: EventStatus;
    }
  | { readonly kind: "InvalidPhase"; readonly sport: string; readonly phase: string };

// The only definition of the lifecycle rules (ADR-0030). It changes nothing:
// it returns a new event, or an error and the caller keeps the old event.
export function applyCommand(event: Event, command: Command): Result<Event, CommandError> {
  if (command.expectedVersion !== event.version) {
    return err({
      kind: "VersionConflict",
      expectedVersion: command.expectedVersion,
      currentVersion: event.version,
    });
  }

  if (!ALLOWED_FROM[command.kind].includes(event.status)) {
    return err({ kind: "TransitionNotAllowed", command: command.kind, status: event.status });
  }

  // Every field except the status and the phase. Each command sets those two.
  const next = {
    id: event.id,
    source: event.source,
    externalId: event.externalId,
    sport: event.sport,
    startsAt: event.startsAt,
    homeCompetitorId: event.homeCompetitorId,
    awayCompetitorId: event.awayCompetitorId,
    version: event.version + 1,
  };

  switch (command.kind) {
    case "start":
    case "changePhase":
      if (command.phase === undefined) {
        return ok({ ...next, status: "live" });
      }
      if (!isPhaseOfSport(event.sport, command.phase)) {
        return err({ kind: "InvalidPhase", sport: event.sport, phase: command.phase });
      }
      return ok({ ...next, status: "live", phase: command.phase });
    case "finish":
      return ok({ ...next, status: "finished" });
    case "postpone":
      return ok({ ...next, status: "postponed" });
    case "reschedule":
      return ok({ ...next, status: "scheduled", startsAt: command.startsAt });
    case "cancel":
      return ok({ ...next, status: "cancelled" });
    default:
      return assertNever(command);
  }
}

// The compiler reports an error at the call when a command has no case above.
function assertNever(value: never): never {
  throw new Error(`unhandled command: ${JSON.stringify(value)}`);
}
