import { describe, expect, it, vi } from "vitest";
import type { EventRepository } from "#src/application/event-repository.ts";
import { EventUseCases } from "#src/application/event-use-cases.ts";
import type { EventView } from "#src/application/event-view.ts";
import { EVENT_FIELDS } from "#test/domain/fixtures.ts";

const SCHEDULED: EventView = {
  event: { ...EVENT_FIELDS, status: "scheduled" },
  sportName: "Football",
  homeName: "Salzburg",
  awayName: "Sturm",
};

function unexpectedRepositoryCall(): never {
  throw new Error("unexpected repository call");
}

describe("Handle a command that loses a version-checked write (ADR-0030)", () => {
  it("reads the new version once and refuses the command without retrying", async () => {
    const findById = vi
      .fn<EventRepository["findById"]>()
      .mockResolvedValueOnce(SCHEDULED)
      .mockResolvedValueOnce({
        ...SCHEDULED,
        event: { ...SCHEDULED.event, version: 3 },
      });
    const update = vi.fn<EventRepository["update"]>().mockResolvedValue(false);
    const repository: EventRepository = {
      findById,
      update,
      create: unexpectedRepositoryCall,
      findBySourceIdentity: unexpectedRepositoryCall,
      list: unexpectedRepositoryCall,
      findCompetitors: unexpectedRepositoryCall,
    };
    const useCases = new EventUseCases(repository, { next: unexpectedRepositoryCall });

    const result = await useCases.command(
      SCHEDULED.event.id,
      {
        kind: "start",
        expectedVersion: 1,
      },
      SCHEDULED.event.source,
    );

    expect(result).toEqual({
      ok: false,
      error: { kind: "VersionConflict", expectedVersion: 1, currentVersion: 3 },
    });
    expect(findById).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
