import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWalmartDb, type TestDb } from "@/tests/helpers/walmart-db";
import { MODEL_ROW_LIMIT, runAnalysis, toModelView } from "@/lib/analysis";
import { createLogger, type LogRecord } from "@/lib/logger";

function harness(maxRows = 500) {
  const records: LogRecord[] = [];
  const log = createLogger({ app: "test" }, (_l, _s, r) => records.push(r));
  return { records, deps: (run: (s: never) => Promise<never>) => ({ run, maxRows, log }) };
}

describe("runAnalysis (real data)", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createWalmartDb();
  });
  afterAll(() => db.close());

  const go = (input: Parameters<typeof runAnalysis>[0], maxRows = 500) => {
    const h = harness(maxRows);
    const run = vi.fn((s: Parameters<TestDb["run"]>[0]) => db.run(s));
    return runAnalysis(input, { run, maxRows, log: createLogger({ app: "t" }, (_l, _s, r) => h.records.push(r)) }).then(
      (result) => ({ result, run, records: h.records }),
    );
  };

  it("returns rows, columns, a display SQL and the validated chart", async () => {
    const { result } = await go({
      query: { dimensions: ["category"], metrics: ["revenue", "transactions"] },
      chartConfig: { type: "bar", xKey: "category", yKey: "revenue", title: "Revenue by category" },
    });
    expect(result.success).toBe(true);
    expect(result.columns).toEqual(["category", "revenue", "transactions"]);
    expect(result.rowCount).toBe(6);
    expect(result.truncated).toBe(false);
    expect(result.chartConfig).toEqual({ type: "bar", xKey: "category", yKey: "revenue", title: "Revenue by category" });
    expect(result.chartWarnings).toEqual([]);
    expect(result.sql).toContain("FROM walmart");
    expect(typeof result.rows[0].revenue).toBe("number");
    expect(result.hint).toBeUndefined();
  });

  it("a simple question stays simple: only the requested columns come back", async () => {
    const { result } = await go({
      query: { dimensions: ["category"], metrics: ["revenue"] },
      chartConfig: { type: "bar", xKey: "category", yKey: "revenue", title: "t" },
    });
    expect(Object.keys(result.rows[0])).toEqual(["category", "revenue"]);
  });

  it("rejects an invalid query without touching the database", async () => {
    const { result, run } = await go({
      query: { dimensions: ["customer_email"], metrics: ["revenue"] },
      chartConfig: { type: "bar", xKey: "x", yKey: "revenue", title: "t" },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid query/);
    expect(result.rows).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects chart keys that are not returned columns and says which are", async () => {
    const { result } = await go({
      query: { dimensions: ["category"], metrics: ["revenue"] },
      chartConfig: { type: "bar", xKey: "category", yKey: "total_revenue", title: "t" },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('yKey "total_revenue" is not a returned column');
    expect(result.error).toContain("category, revenue");
    expect(result.sql).toContain("FROM walmart"); // the model can see what ran
  });

  it("downgrades an undrawable chart to a table with a warning, keeping the data", async () => {
    const { result } = await go({
      query: { dimensions: ["category", "payment_method"], metrics: ["transactions"] },
      chartConfig: { type: "bar", xKey: "transactions", yKey: "payment_method", title: "t" },
    });
    expect(result.success).toBe(true);
    expect(result.chartConfig.type).toBe("table");
    expect(result.chartWarnings[0]).toMatch(/does not contain numeric values/);
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it("flags truncation and returns exactly `limit` rows", async () => {
    const { result } = await go({
      query: { dimensions: ["branch"], metrics: ["revenue"], limit: 10 },
      chartConfig: { type: "bar", xKey: "branch", yKey: "revenue", title: "t" },
    });
    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(10);
    expect(result.hint).toMatch(/limited to 10 rows/);
  });

  it("respects the configured row cap", async () => {
    const { result } = await go(
      {
        query: { dimensions: ["sale_date"], metrics: ["revenue"], limit: 5000 },
        chartConfig: { type: "line", xKey: "sale_date", yKey: "revenue", title: "t" },
      },
      120,
    );
    expect(result.rows).toHaveLength(120);
    expect(result.truncated).toBe(true);
  });

  it("explains empty results (case-sensitive filters)", async () => {
    const { result } = await go({
      query: { metrics: ["revenue"], filters: [{ field: "category", op: "eq", values: ["health and beauty"] }] },
      chartConfig: { type: "table", title: "t" },
    });
    expect(result.success).toBe(true);
    expect(result.rows[0].revenue).toBeNull();
    // A no-dimension aggregate over zero rows still yields one row of NULLs; a grouped query yields none.
    const grouped = await go({
      query: { dimensions: ["city"], metrics: ["revenue"], filters: [{ field: "category", op: "eq", values: ["health and beauty"] }] },
      chartConfig: { type: "bar", xKey: "city", yKey: "revenue", title: "t" },
    });
    expect(grouped.result.rowCount).toBe(0);
    expect(grouped.result.hint).toMatch(/case-sensitive/);
  });

  it("maps database failures to safe messages and logs the cause once", async () => {
    const h = harness();
    const run = vi.fn().mockRejectedValue(
      Object.assign(new Error("canceling statement due to statement timeout on postgres://u:pw@h/db"), { code: "57014" }),
    );
    const result = await runAnalysis(
      {
        query: { dimensions: ["branch"], metrics: ["revenue"] },
        chartConfig: { type: "bar", xKey: "branch", yKey: "revenue", title: "t" },
      },
      { run, maxRows: 500, log: createLogger({ app: "t" }, (_l, _s, r) => h.records.push(r)) },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("took too long");
    expect(result.error).toContain("add a filter");
    expect(JSON.stringify(result)).not.toMatch(/postgres:\/\/|pw@/);
    const failure = h.records.find((r) => r.msg === "analysis query failed")!;
    expect(failure.level).toBe("error");
    expect(failure.code).toBe("db_timeout");
    expect(JSON.stringify(failure)).not.toContain("pw@");
  });

  it("logs structured outcomes without logging filter values", async () => {
    const { records } = await go({
      query: { dimensions: ["category"], metrics: ["revenue"], filters: [{ field: "city", op: "eq", values: ["San Antonio"] }] },
      chartConfig: { type: "bar", xKey: "category", yKey: "revenue", title: "t" },
    });
    const done = records.find((r) => r.msg === "analysis complete")!;
    expect(done).toMatchObject({ dimensions: ["category"], metrics: ["revenue"], filters: 1, chartType: "bar", truncated: false });
    expect(typeof done.durationMs).toBe("number");
    expect(JSON.stringify(records)).not.toContain("San Antonio");
  });
});

describe("toModelView", () => {
  const base = {
    success: true,
    sql: "SELECT secret_display_sql",
    chartConfig: { type: "bar" as const, xKey: "a", yKey: "b", title: "t" },
    chartWarnings: [],
    columns: ["a", "b"],
    rowCount: 250,
    truncated: false,
    rows: Array.from({ length: 250 }, (_, i) => ({ a: `r${i}`, b: i })),
  };

  it("caps rows so a wide result cannot flood the model's context", () => {
    const v = toModelView(base) as { rows: unknown[]; rowsOmittedFromThisView: number; sql?: string };
    expect(v.rows).toHaveLength(MODEL_ROW_LIMIT);
    expect(v.rowsOmittedFromThisView).toBe(250 - MODEL_ROW_LIMIT);
    expect(v).not.toHaveProperty("sql");
  });

  it("surfaces errors, hints and warnings, and omits empty fields", () => {
    const failed = toModelView({ ...base, success: false, error: "bad", rows: [], rowCount: 0, columns: [] });
    expect(failed).toMatchObject({ success: false, error: "bad", rows: [] });
    expect(failed).not.toHaveProperty("rowsOmittedFromThisView");
    expect(failed).not.toHaveProperty("chartWarnings");
    const warned = toModelView({ ...base, rows: base.rows.slice(0, 2), chartWarnings: ["downgraded"], hint: "h" });
    expect(warned).toMatchObject({ chartWarnings: ["downgraded"], hint: "h" });
  });
});
