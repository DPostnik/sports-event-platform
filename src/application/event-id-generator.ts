import type { EventId } from "#src/domain/ids.ts";

export interface EventIdGenerator {
  next(): EventId;
}
