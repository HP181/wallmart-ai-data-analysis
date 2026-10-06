import { describe, expect, it } from "vitest";
import { ChartKeyError, resolveChart, toFiniteNumber } from "@/lib/query/chart";

const rows = [
  { category: "A", revenue: 100, avg_rating: 7.5 },
  { category: "B", revenue: 50, avg_rating: 6.1 },
  { category: "C", revenue: 25, avg_rating: 8.2 },
];
const columns = ["category", "revenue", "avg_rating"];

describe("resolveChart: keys", () => {
  it("accepts valid keys unchanged", () => {
    const r = resolveChart({ type: "bar", xKey: "category", yKey: "revenue", title: " Sales " }, columns, rows);
    expect(r.config).toEqual({ type: "bar", xKey: "category", yKey: "revenue", title: "Sales" });
    expect(r.warnings).toEqual([]);
  });

  it("normalizes key case instead of failing", () => {
    const r = resolveChart({ type: "bar", xKey: "Category", yKey: "REVENUE", title: "t" }, columns, rows);
    expect(r.config.xKey).toBe("category");
    expect(r.config.yKey).toBe("revenue");
  });

  it("rejects an unknown key and lists the real columns so the model can retry", () => {
    expect(() => resolveChart({ type: "bar", xKey: "category", yKey: "sales", title: "t" }, columns, rows)).toThrow(
      /yKey "sales" is not a returned column\. Use one of: category, revenue, avg_rating/,
    );
    expect(() => resolveChart({ type: "bar", xKey: "nope", yKey: "revenue", title: "t" }, columns, rows)).toThrow(
      ChartKeyError,
    );
  });

  it("rejects missing keys for non-table charts, but not for tables", () => {
    expect(() => resolveChart({ type: "line", title: "t" }, columns, rows)).toThrow(/xKey null/);
    const t = resolveChart({ type: "table", title: "t" }, columns, rows);
    expect(t.config.type).toBe("table");
  });

  it("rejects xKey equal to yKey", () => {
    expect(() => resolveChart({ type: "bar", xKey: "revenue", yKey: "revenue", title: "t" }, columns, rows)).toThrow(
      /different columns/,
    );
  });
});

describe("resolveChart: data validation and downgrades", () => {
  it("downgrades to a table when y is not numeric", () => {
    const r = resolveChart(
      { type: "bar", xKey: "revenue", yKey: "category", title: "t" },
      columns,
      rows,
    );
    expect(r.config.type).toBe("table");
    expect(r.warnings[0]).toMatch(/"category" does not contain numeric values/);
  });

  it("treats numeric strings as non-numeric (the server normalizes before calling)", () => {
    const r = resolveChart({ type: "bar", xKey: "category", yKey: "revenue", title: "t" }, columns, [
      { category: "A", revenue: "100" },
    ]);
    expect(r.config.type).toBe("table");
  });

  it("tolerates nulls in y but not when every value is null", () => {
    const some = resolveChart({ type: "line", xKey: "category", yKey: "revenue", title: "t" }, columns, [
      { category: "A", revenue: 1 },
      { category: "B", revenue: null },
    ]);
    expect(some.config.type).toBe("line");
    const none = resolveChart({ type: "line", xKey: "category", yKey: "revenue", title: "t" }, columns, [
      { category: "A", revenue: null },
      { category: "B", revenue: null },
    ]);
    expect(none.config.type).toBe("table");
  });

  it("scatter needs a numeric x as well", () => {
    expect(resolveChart({ type: "scatter", xKey: "avg_rating", yKey: "revenue", title: "t" }, columns, rows).config.type).toBe(
      "scatter",
    );
    const bad = resolveChart({ type: "scatter", xKey: "category", yKey: "revenue", title: "t" }, columns, rows);
    expect(bad.config.type).toBe("table");
    expect(bad.warnings[0]).toMatch(/scatter plot needs numeric "category"/);
  });

  it("pie with negative or all-zero values becomes a bar", () => {
    const neg = resolveChart({ type: "pie", xKey: "category", yKey: "revenue", title: "t" }, columns, [
      { category: "A", revenue: 10 },
      { category: "B", revenue: -5 },
    ]);
    expect(neg.config.type).toBe("bar");
    const zero = resolveChart({ type: "pie", xKey: "category", yKey: "revenue", title: "t" }, columns, [
      { category: "A", revenue: 0 },
    ]);
    expect(zero.config.type).toBe("bar");
  });

  it("pie with too many slices becomes a bar", () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ category: `c${i}`, revenue: i + 1 }));
    const r = resolveChart({ type: "pie", xKey: "category", yKey: "revenue", title: "t" }, columns, many);
    expect(r.config.type).toBe("bar");
    expect(r.warnings[0]).toMatch(/13 slices/);
  });

  it("a single-point line becomes a bar", () => {
    const r = resolveChart({ type: "line", xKey: "category", yKey: "revenue", title: "t" }, columns, [rows[0]]);
    expect(r.config.type).toBe("bar");
  });

  it("empty results keep the requested chart (the UI shows no chart for zero rows)", () => {
    const r = resolveChart({ type: "bar", xKey: "category", yKey: "revenue", title: "t" }, columns, []);
    expect(r.config.type).toBe("bar");
    expect(r.warnings).toEqual([]);
  });

  it("defaults a blank title", () => {
    expect(resolveChart({ type: "table", title: "   " }, columns, rows).config.title).toBe("Results");
  });
});

describe("toFiniteNumber", () => {
  it("parses numbers and numeric strings, rejects the rest", () => {
    expect(toFiniteNumber(3)).toBe(3);
    expect(toFiniteNumber("4.5")).toBe(4.5);
    expect(toFiniteNumber(" 7 ")).toBe(7);
    for (const bad of ["", "abc", NaN, Infinity, null, undefined, {}, []]) expect(toFiniteNumber(bad)).toBeNull();
  });
});
