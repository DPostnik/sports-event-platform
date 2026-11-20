import { describe, expect, it } from "vitest";
import { createInMemoryCache } from "#src/infrastructure/cache/in-memory-cache.ts";

function createTestClock() {
  let ms = 1_000_000;
  return {
    clock: { now: () => new Date(ms) },
    advance(seconds: number) {
      ms += seconds * 1000;
    },
  };
}

describe("In-memory cache (ADR-0043)", () => {
  it("keeps a value until its lifetime ends and not after", async () => {
    const time = createTestClock();
    const cache = createInMemoryCache(time.clock, 10);
    await cache.set("a", "one", 5);
    time.advance(4.999);
    expect(await cache.get("a")).toBe("one");
    time.advance(0.001);
    expect(await cache.get("a")).toBeUndefined();
  });

  it("forgets a deleted value", async () => {
    const cache = createInMemoryCache(createTestClock().clock, 10);
    await cache.set("a", "one", 5);
    await cache.delete("a");
    expect(await cache.get("a")).toBeUndefined();
  });

  it("evicts the oldest entry when the limit is reached and counts a rewritten key as newest", async () => {
    const cache = createInMemoryCache(createTestClock().clock, 2);
    await cache.set("a", "one", 5);
    await cache.set("b", "two", 5);
    await cache.set("a", "again", 5);
    await cache.set("c", "three", 5);
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("a")).toBe("again");
    expect(await cache.get("c")).toBe("three");
  });
});
