import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", ".agents/**", ".eve/**"],
    // Integration tests boot an in-process Postgres and load ~10k rows.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
