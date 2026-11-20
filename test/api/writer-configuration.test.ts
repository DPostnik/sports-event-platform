import { describe, expect, test } from "vitest";
import { readConfiguration } from "#src/config/environment.ts";
import { apiWriter, manualWriter, writerKeyEnvironment } from "#test/api/writer-keys.ts";

const databaseUrl = "postgresql://localhost/sports";

describe("Writer configuration (ADR-0042)", () => {
  test("loads valid hashes and their sources", () => {
    const config = readConfiguration({ DATABASE_URL: databaseUrl, WRITER_KEYS: writerKeyEnvironment });
    expect(config.writerKeys).toEqual(new Map([
      [apiWriter.hash, apiWriter.source],
      [manualWriter.hash, manualWriter.source],
    ]));
  });

  test("disables all writer keys when the setting is absent", () => {
    expect(readConfiguration({ DATABASE_URL: databaseUrl }).writerKeys.size).toBe(0);
  });

  test.each([
    "{",
    "[]",
    JSON.stringify({ "not-a-key-hash": "manual" }),
    JSON.stringify({ [apiWriter.hash]: "Invalid Source" }),
  ])("rejects an invalid mapping without revealing its contents (case %#)", (mapping) => {
    expect(() => readConfiguration({ DATABASE_URL: databaseUrl, WRITER_KEYS: mapping }))
      .toThrow(/^Invalid environment configuration: WRITER_KEYS: Expected a JSON object mapping lowercase SHA-256 key hashes to valid sources$/);
  });
});
