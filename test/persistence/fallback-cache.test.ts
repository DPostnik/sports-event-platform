import { describe, expect, it } from "vitest";
import type { Cache } from "#src/application/cache.ts";
import { createFallbackCache } from "#src/infrastructure/cache/fallback-cache.ts";
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

function createPrimary() {
  const stored = new Map<string, string>();
  const state = { failing: false };
  const outage = new Error("primary down");
  const cache: Cache = {
    get(key) {
      if (state.failing) return Promise.reject(outage);
      return Promise.resolve(stored.get(key));
    },
    set(key, value) {
      if (state.failing) return Promise.reject(outage);
      stored.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      if (state.failing) return Promise.reject(outage);
      stored.delete(key);
      return Promise.resolve();
    },
  };
  return { cache, state, outage, stored };
}

function setup() {
  const time = createTestClock();
  const primary = createPrimary();
  const local = createInMemoryCache(time.clock, 10);
  const failures: unknown[] = [];
  const cache = createFallbackCache(primary.cache, local, 5, (error) => failures.push(error));
  return { time, primary, local, failures, cache };
}

describe("Fallback cache (ADR-0043)", () => {
  it("uses only the primary while it works", async () => {
    const { primary, local, failures, cache } = setup();
    await cache.set("a", "one", 3600);
    expect(await cache.get("a")).toBe("one");
    expect(primary.stored.get("a")).toBe("one");
    expect(await local.get("a")).toBeUndefined();
    expect(failures).toEqual([]);
  });

  it("keeps a write locally for at most the local lifetime when the primary fails", async () => {
    const { time, primary, cache } = setup();
    primary.state.failing = true;
    await cache.set("a", "one", 3600);
    time.advance(4.999);
    expect(await cache.get("a")).toBe("one");
    time.advance(0.001);
    expect(await cache.get("a")).toBeUndefined();
  });

  it("reports every primary failure through the callback", async () => {
    const { primary, failures, cache } = setup();
    primary.state.failing = true;
    await cache.get("a");
    await cache.set("a", "one", 3600);
    expect(failures).toEqual([primary.outage, primary.outage]);
  });

  it("removes the local entry on delete even when the primary delete fails", async () => {
    const { primary, local, cache } = setup();
    primary.state.failing = true;
    await cache.set("a", "one", 3600);
    await expect(cache.delete("a")).rejects.toBe(primary.outage);
    expect(await local.get("a")).toBeUndefined();
  });
});
