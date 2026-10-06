import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalmartDb, readCsvRows, type CsvRow, type TestDb } from "@/tests/helpers/walmart-db";
import { compileQuery, normalizeRows, renderSqlForDisplay } from "@/lib/query/compile";
import { DIMENSIONS, METRICS } from "@/lib/query/catalog";
import { AppError } from "@/lib/errors";

const MAX = 500;
const compile = (spec: unknown) => compileQuery(spec, { maxRows: MAX });

describe("compileQuery: structure", () => {
  it("compiles a simple ranking into one parameterized SELECT", () => {
    const q = compile({ dimensions: ["category"], metrics: ["revenue"] });
    expect(q.statement.text).toBe(
      [
        "SELECT category AS category,",
        "       ROUND(SUM(total)::numeric, 2)::float8 AS revenue",
        "FROM walmart",
        "GROUP BY 1",
        "ORDER BY 2 DESC, 1 ASC",
        "LIMIT $1::int",
      ].join("\n"),
    );
    // Fetches limit + 1 so truncation can be detected; default ranking cap is 50.
    expect(q.statement.params).toEqual([51]);
    expect(q.limit).toBe(50);
    expect(q.columns.map((c) => [c.id, c.role, c.kind])).toEqual([
      ["category", "dimension", "text"],
      ["revenue", "metric", "float"],
    ]);
  });

  it("returns exactly one row for a no-dimension query", () => {
    const q = compile({ metrics: ["revenue", "transactions"] });
    expect(q.statement.text).not.toMatch(/GROUP BY|ORDER BY/);
    expect(q.limit).toBe(1);
  });

  it("orders ordered dimensions naturally, not alphabetically", () => {
    expect(compile({ dimensions: ["day_of_week"], metrics: ["revenue"] }).statement.text).toContain(
      "ORDER BY MIN(EXTRACT(ISODOW FROM sale_date)) ASC",
    );
    expect(compile({ dimensions: ["year_month"], metrics: ["revenue"] }).statement.text).toContain("ORDER BY 1 ASC");
  });

  it("honours orderBy, and rejects an orderBy that is not selected", () => {
    const q = compile({
      dimensions: ["city"],
      metrics: ["revenue", "avg_rating"],
      orderBy: { field: "avg_rating", direction: "asc" },
    });
    expect(q.statement.text).toContain("ORDER BY 3 ASC, 1 ASC");
    expect(() =>
      compile({ dimensions: ["city"], metrics: ["revenue"], orderBy: { field: "profit", direction: "desc" } }),
    ).toThrow(/must be one of the selected/);
  });

  it("caps limit at maxRows and dedupes repeated ids", () => {
    const q = compileQuery(
      { dimensions: ["hour", "hour"], metrics: ["revenue", "revenue"], limit: 5000 },
      { maxRows: 120 },
    );
    expect(q.limit).toBe(120);
    expect(q.columns.map((c) => c.id)).toEqual(["hour", "revenue"]);
  });
});

describe("compileQuery: injection resistance", () => {
  const evil = `x'; DROP TABLE walmart; --`;

  it("rejects identifiers outside the catalog", () => {
    for (const bad of ["category; DROP TABLE walmart", "pg_sleep(10)", "1", "", "CATEGORY", "walmart.category"]) {
      expect(() => compile({ dimensions: [bad], metrics: ["revenue"] })).toThrow(AppError);
      expect(() => compile({ dimensions: ["category"], metrics: [bad] })).toThrow(AppError);
      expect(() =>
        compile({ metrics: ["revenue"], filters: [{ field: bad, op: "eq", values: ["a"] }] }),
      ).toThrow(AppError);
    }
  });

  it("rejects unknown operators and malformed shapes", () => {
    expect(() =>
      compile({ metrics: ["revenue"], filters: [{ field: "category", op: "LIKE", values: ["a"] }] }),
    ).toThrow(AppError);
    expect(() => compile({ metrics: ["revenue"], filters: [{ field: "category", op: "eq" }] })).toThrow(AppError);
    expect(() => compile("SELECT 1")).toThrow(AppError);
    expect(() => compile(null)).toThrow(AppError);
    expect(() => compile({ metrics: [] })).toThrow(AppError);
    expect(() => compile({ dimensions: ["hour", "city", "branch", "shift"], metrics: ["revenue"] })).toThrow(AppError);
  });

  it("never puts a filter value into the SQL text; values are bind parameters", () => {
    const q = compile({
      dimensions: ["category"],
      metrics: ["revenue"],
      filters: [
        { field: "city", op: "eq", values: [evil] },
        { field: "branch", op: "in", values: [evil + "1", evil + "2"] },
      ],
    });
    expect(q.statement.text).not.toContain("DROP");
    expect(q.statement.text).not.toContain("x'");
    expect(q.statement.params).toEqual(expect.arrayContaining([evil, evil + "1", evil + "2"]));
    expect(q.statement.text).toMatch(/city = \$1::text/);
    expect(q.statement.text).toMatch(/branch IN \(\$2::text, \$3::text\)/);
  });

  it("emits only catalog fragments: every SQL token is one of ours", () => {
    const q = compile({
      dimensions: ["branch", "year_month"],
      metrics: ["revenue", "profit_margin_pct"],
      filters: [{ field: "rating_band", op: "between", values: [4, 8] }],
    });
    // A filter on a bucketed dimension filters the bucket, so band 4 means ratings 4.0-4.99.
    expect(q.statement.text).toContain("FLOOR(rating)::int BETWEEN $1::int AND $2::int");
    for (const id of ["branch", "year_month"] as const) expect(q.statement.text).toContain(DIMENSIONS[id].select);
    for (const id of ["revenue", "profit_margin_pct"] as const) expect(q.statement.text).toContain(METRICS[id].expr);
  });

  it("validates arity and value types with messages the model can act on", () => {
    expect(() => compile({ metrics: ["revenue"], filters: [{ field: "year", op: "eq", values: [2020, 2021] }] })).toThrow(
      /needs exactly 1 value/,
    );
    expect(() => compile({ metrics: ["revenue"], filters: [{ field: "year", op: "between", values: [2020] }] })).toThrow(
      /exactly 2 values/,
    );
    expect(() => compile({ metrics: ["revenue"], filters: [{ field: "year", op: "eq", values: ["abc"] }] })).toThrow(
      /whole number/,
    );
    expect(() => compile({ metrics: ["revenue"], filters: [{ field: "category", op: "eq", values: [5] }] })).toThrow(
      /text value/,
    );
    expect(() =>
      compile({ metrics: ["revenue"], filters: [{ field: "sale_date", op: "gte", values: ["2019-02-30"] }] }),
    ).toThrow(/YYYY-MM-DD/);
    expect(() =>
      compile({ metrics: ["revenue"], filters: [{ field: "sale_date", op: "gte", values: ["05/01/19"] }] }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("coerces numeric strings for numeric columns", () => {
    const q = compile({ metrics: ["revenue"], filters: [{ field: "year", op: "eq", values: ["2021"] }] });
    expect(q.statement.params[0]).toBe(2021);
  });
});

describe("renderSqlForDisplay", () => {
  it("inlines values as escaped literals for display only", () => {
    const q = compile({
      metrics: ["revenue"],
      filters: [
        { field: "city", op: "eq", values: ["O'Fallon"] },
        { field: "sale_date", op: "gte", values: ["2020-01-01"] },
      ],
    });
    expect(q.displaySql).toContain("city = 'O''Fallon'");
    expect(q.displaySql).toContain("sale_date >= DATE '2020-01-01'");
    expect(q.displaySql).toContain("LIMIT 1");
    expect(renderSqlForDisplay({ text: "x = $1::int", params: [7] })).toBe("x = 7");
  });
});

describe("normalizeRows", () => {
  it("coerces numeric strings and nulls non-finite values", () => {
    const columns = [
      { id: "a", role: "dimension", kind: "text" },
      { id: "b", role: "metric", kind: "float" },
      { id: "c", role: "metric", kind: "int" },
    ] as const;
    expect(
      normalizeRows([{ a: 5, b: "12.50", c: "3", extra: "dropped" }, { a: null, b: "abc", c: Infinity }], [...columns]),
    ).toEqual([
      { a: "5", b: 12.5, c: 3 },
      { a: null, b: null, c: null },
    ]);
  });
});

describe("compileQuery against real data (PGlite + full dataset)", () => {
  let db: TestDb;
  let csv: CsvRow[];
  beforeAll(async () => {
    db = await createWalmartDb();
    csv = readCsvRows();
  });
  afterAll(() => db.close());

  async function exec(spec: unknown) {
    const q = compile(spec);
    const raw = await db.run(q.statement);
    return { q, rows: normalizeRows(raw.slice(0, q.limit), q.columns), fetched: raw.length };
  }

  const sumBy = (key: string, value: string, where: (r: CsvRow) => boolean = () => true) => {
    const out = new Map<string, number>();
    for (const r of csv.filter(where)) out.set(r[key], (out.get(r[key]) ?? 0) + Number(r[value]));
    return out;
  };

  it("revenue by category matches an independent computation, ranked descending", async () => {
    const { rows } = await exec({ dimensions: ["category"], metrics: ["revenue", "transactions"] });
    const expected = sumBy("category", "total");
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.revenue as number).toBeCloseTo(expected.get(row.category as string)!, 1);
      expect(row.transactions).toBe(csv.filter((r) => r.category === row.category).length);
    }
    const revenues = rows.map((r) => r.revenue as number);
    expect(revenues).toEqual([...revenues].sort((a, b) => b - a));
  });

  it("returns real numbers (not strings) for every metric kind", async () => {
    for (const metrics of [
      ["revenue", "profit", "transactions", "units_sold", "avg_order_value", "avg_rating"],
      ["profit_margin_pct", "avg_unit_price", "avg_profit_margin", "branches"],
    ]) {
      const { rows } = await exec({ dimensions: ["payment_method"], metrics });
      expect(rows).toHaveLength(3);
      for (const row of rows) for (const [k, v] of Object.entries(row)) {
        if (k !== "payment_method") expect(typeof v, k).toBe("number");
      }
    }
  });

  it("orders weekdays, shifts, tiers and months naturally", async () => {
    const dow = await exec({ dimensions: ["day_of_week"], metrics: ["transactions"] });
    expect(dow.rows.map((r) => r.day_of_week)).toEqual([
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ]);
    const shift = await exec({ dimensions: ["shift"], metrics: ["transactions"] });
    expect(shift.rows.map((r) => r.shift)).toEqual(["Morning", "Afternoon", "Evening"]);
    const tier = await exec({ dimensions: ["revenue_tier"], metrics: ["transactions"] });
    expect(tier.rows.map((r) => r.revenue_tier)).toEqual(["Low", "Medium", "High"]);
    const month = await exec({ dimensions: ["month_name"], metrics: ["transactions"] });
    expect(month.rows.map((r) => r.month_name)).toEqual([
      "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
    ]);
  });

  it("year_month is a true time series across years, unlike month", async () => {
    const ym = await exec({ dimensions: ["year_month"], metrics: ["transactions"] });
    expect(ym.rows).toHaveLength(3 + 12 * 4); // 2019 has Jan-Mar only, then four full years
    expect(ym.rows[0].year_month).toBe("2019-01");
    expect(ym.rows.at(-1)?.year_month).toBe("2023-12");
    const months = ym.rows.map((r) => r.year_month as string);
    expect(months).toEqual([...months].sort());
    const pooled = await exec({ dimensions: ["month"], metrics: ["transactions"] });
    expect(pooled.rows).toHaveLength(12);
    const jan = csv.filter((r) => r.month === "1").length;
    expect(pooled.rows[0].transactions).toBe(jan);
  });

  it("applies eq / in / between / gte filters with correct typing", async () => {
    const eq = await exec({ metrics: ["transactions"], filters: [{ field: "category", op: "eq", values: ["Health and beauty"] }] });
    expect(eq.rows[0].transactions).toBe(csv.filter((r) => r.category === "Health and beauty").length);

    const inList = await exec({
      metrics: ["transactions"],
      filters: [{ field: "payment_method", op: "in", values: ["Cash", "Ewallet"] }],
    });
    expect(inList.rows[0].transactions).toBe(csv.filter((r) => ["Cash", "Ewallet"].includes(r.payment_method)).length);

    const range = await exec({
      metrics: ["transactions"],
      filters: [{ field: "sale_date", op: "between", values: ["2022-03-01", "2022-03-31"] }],
    });
    expect(range.rows[0].transactions).toBe(csv.filter((r) => r.year === "2022" && r.month === "3").length);

    const late = await exec({ metrics: ["transactions"], filters: [{ field: "hour", op: "gte", values: [20] }] });
    expect(late.rows[0].transactions).toBe(csv.filter((r) => Number(r.hour) >= 20).length);

    const neq = await exec({ metrics: ["transactions"], filters: [{ field: "shift", op: "neq", values: ["Morning"] }] });
    expect(neq.rows[0].transactions).toBe(csv.filter((r) => r.shift !== "Morning").length);
  });

  it("filters banded dimensions by bucket, not by the raw value", async () => {
    const gte = await exec({
      dimensions: ["rating_band"],
      metrics: ["transactions"],
      filters: [{ field: "rating_band", op: "gte", values: [9] }],
    });
    expect(gte.rows.map((r) => r.rating_band)).toEqual([9, 10]);
    expect(gte.rows.reduce((a, r) => a + (r.transactions as number), 0)).toBe(
      csv.filter((r) => Number(r.rating) >= 9).length,
    );

    // band 8 means 8.0 <= rating < 9.0, not rating == 8.
    const eq = await exec({ metrics: ["transactions"], filters: [{ field: "rating_band", op: "eq", values: [8] }] });
    expect(eq.rows[0].transactions).toBe(csv.filter((r) => Number(r.rating) >= 8 && Number(r.rating) < 9).length);
    expect(eq.rows[0].transactions).toBeGreaterThan(csv.filter((r) => Number(r.rating) === 8).length);

    // band <= 8 includes 8.5, which a raw "rating <= 8" would wrongly drop.
    const lte = await exec({ metrics: ["transactions"], filters: [{ field: "rating_band", op: "lte", values: [8] }] });
    expect(lte.rows[0].transactions).toBe(csv.filter((r) => Number(r.rating) < 9).length);
  });

  it("detects truncation by fetching one extra row", async () => {
    const { q, fetched, rows } = await exec({ dimensions: ["branch"], metrics: ["revenue"], limit: 3 });
    expect(q.limit).toBe(3);
    expect(fetched).toBe(4);
    expect(rows).toHaveLength(3);
  });

  it("treats hostile values as data: no error, no rows, table intact", async () => {
    const before = (await db.run({ text: "SELECT COUNT(*)::int AS n FROM walmart", params: [] }))[0].n;
    const { rows } = await exec({
      dimensions: ["category"],
      metrics: ["revenue"],
      filters: [{ field: "city", op: "eq", values: [`x'; DROP TABLE walmart; --`] }],
    });
    expect(rows).toEqual([]);
    const after = (await db.run({ text: "SELECT COUNT(*)::int AS n FROM walmart", params: [] }))[0].n;
    expect(after).toBe(before);
  });

  it("every dimension and every metric executes against the real schema", async () => {
    for (const id of Object.keys(DIMENSIONS)) {
      const { rows } = await exec({ dimensions: [id], metrics: ["transactions"], limit: 5 });
      expect(rows.length, `dimension ${id}`).toBeGreaterThan(0);
    }
    for (const id of Object.keys(METRICS)) {
      const { rows } = await exec({ metrics: [id] });
      expect(rows[0][id], `metric ${id}`).not.toBeNull();
    }
  });
});
