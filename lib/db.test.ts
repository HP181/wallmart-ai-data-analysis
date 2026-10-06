import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";

type FakeQuery = { text: string; params?: unknown[] };

const fake = vi.hoisted(() => ({
  neonUrls: [] as string[],
  transactions: [] as { queries: FakeQuery[]; opts: Record<string, unknown> | undefined }[],
  nextResult: undefined as unknown[][] | undefined,
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => {
    fake.neonUrls.push(url);
    return {
      query: (text: string, params?: unknown[]): FakeQuery => ({ text, params }),
      transaction: async (queries: FakeQuery[], opts?: Record<string, unknown>) => {
        fake.transactions.push({ queries, opts });
        return fake.nextResult ?? queries.map((_q, i) => (i === 0 ? [] : [{ i }]));
      },
    };
  },
}));

const RW = "postgresql://owner:pw@ep-x.neon.tech/neondb";
const RO = "postgresql://reader:pw@ep-x.neon.tech/neondb";

async function loadDb() {
  vi.resetModules();
  resetConfigForTests();
  return import("@/lib/db");
}

describe("runReadQueries", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    fake.neonUrls.length = 0;
    fake.transactions.length = 0;
    fake.nextResult = undefined;
    process.env.DATABASE_URL = RW;
    delete process.env.DATABASE_URL_READONLY;
    delete process.env.DB_QUERY_TIMEOUT_MS;
  });
  afterEach(() => {
    process.env = { ...saved };
    resetConfigForTests();
  });

  it("runs every statement in one READ ONLY transaction behind a statement timeout", async () => {
    const { runReadQueries } = await loadDb();
    const rows = await runReadQueries([
      { text: "SELECT 1 WHERE $1::int = 1", params: [1] },
      { text: "SELECT 2", params: [] },
    ]);

    expect(fake.transactions).toHaveLength(1);
    const { queries, opts } = fake.transactions[0];
    expect(opts).toMatchObject({ readOnly: true });
    expect(queries.map((q) => q.text)).toEqual([
      "SET LOCAL statement_timeout = 8000",
      "SELECT 1 WHERE $1::int = 1",
      "SELECT 2",
    ]);
    expect(queries[1].params).toEqual([1]);
    // The SET LOCAL result is dropped; callers get one result set per statement.
    expect(rows).toEqual([[{ i: 1 }], [{ i: 2 }]]);
  });

  it("uses the configured timeout", async () => {
    process.env.DB_QUERY_TIMEOUT_MS = "2500";
    const { runReadQueries } = await loadDb();
    await runReadQueries([{ text: "SELECT 1", params: [] }]);
    expect(fake.transactions[0].queries[0].text).toBe("SET LOCAL statement_timeout = 2500");
  });

  it("prefers the read-only role's connection string when configured", async () => {
    process.env.DATABASE_URL_READONLY = RO;
    const { runReadQueries } = await loadDb();
    await runReadQueries([{ text: "SELECT 1", params: [] }]);
    expect(fake.neonUrls).toEqual([RO]);
  });

  it("forwards an abort signal to the HTTP request", async () => {
    const { runReadQueries } = await loadDb();
    const controller = new AbortController();
    await runReadQueries([{ text: "SELECT 1", params: [] }], { signal: controller.signal });
    expect(fake.transactions[0].opts).toMatchObject({ readOnly: true, fetchOptions: { signal: controller.signal } });
  });

  it("does nothing for an empty batch", async () => {
    const { runReadQueries } = await loadDb();
    expect(await runReadQueries([])).toEqual([]);
    expect(fake.transactions).toHaveLength(0);
  });

  it("fails with a ConfigError, not a driver error, when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const { runReadQueries } = await loadDb();
    await expect(runReadQueries([{ text: "SELECT 1", params: [] }])).rejects.toMatchObject({
      name: "ConfigError",
      missing: ["DATABASE_URL"],
    });
    expect(fake.neonUrls).toHaveLength(0);
  });

  it("runReadQuery returns the first result set", async () => {
    fake.nextResult = [[], [{ a: 1 }, { a: 2 }]];
    const { runReadQuery } = await loadDb();
    expect(await runReadQuery({ text: "SELECT a", params: [] })).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("probeDataset", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = RW;
  });
  afterEach(() => resetConfigForTests());

  it("reports the row count, typed-column presence and database name only", async () => {
    fake.nextResult = [[], [{ row_count: 9969, typed: true }]];
    const { probeDataset } = await loadDb();
    expect(await probeDataset()).toEqual({ rowCount: 9969, hasTypedDateColumns: true, databaseName: "neondb" });
  });
});
