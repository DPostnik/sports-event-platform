import { defineConfig } from "vitest/config";

// One project per test level so each npm script runs exactly one level.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "domain", include: ["test/domain/**/*.test.ts"] } },
      {
        test: {
          name: "persistence",
          include: ["test/persistence/**/*.test.ts"],
          // Containers start slowly on a cold Docker cache.
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: "api",
          include: ["test/api/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
