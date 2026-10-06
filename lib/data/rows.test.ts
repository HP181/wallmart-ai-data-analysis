import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWalmartDb, readCsvRows, type CsvRow, type TestDb } from "@/tests/helpers/walmart-db";
import {
  EXPORT_COLUMNS,
  LIST_COLUMNS,
  MAX_PAGE_SIZE,
  buildExportBatch,
  buildRowsPage,
  buildRowsStatements,
  escapeLike,
  parseRowFilters,
  parseRowsQuery,
} from "@/lib/data/rows";
import { AppError } from "@/lib/errors";

const params = (init: Record<string, string>) => new URLSearchParams(init);

describe("parseRowsQuery", () => {
  it("applies defaults", () => {
    const q = parseRowsQuery(params({}));
    expect(q).toMatchObject({ page: 1, pageSize: 50, sort: "invoice_id", dir: "asc", filters: { text: {} } });
  });

  it("parses paging, sort and filters", () => {
    const q = parseRowsQuery(
      params({ page: "3", pageSize: "25", sort: "sale_date", dir: "DESC", q: " cash ", category: "Health and beauty", year: "2021", month: "7", date_from: "2021-07-01", date_to: "2021-07-31" }),
    );
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(25);
    expect(q.sort).toBe("sale_date");
    expect(q.dir).toBe("desc");
    expect(q.filters).toEqual({
      q: "cash",
      text: { category: "Health and beauty" },
      year: 2021,
      month: 7,
      dateFrom: "2021-07-01",
      dateTo: "2021-07-31",
    });
  });

  it("bounds page size and depth", () => {
    expect(() => parseRowsQuery(params({ pageSize: String(MAX_PAGE_SIZE + 1) }))).toThrow(AppError);
    expect(() => parseRowsQuery(params({ pageSize: "0" }))).toThrow(AppError);
    expect(() => parseRowsQuery(params({ page: "0" }))).toThrow(AppError);
    expect(() => parseRowsQuery(params({ page: "100000", pageSize: "200" }))).toThrow(/out of range/);
  });

  it("only allows sorting by known columns", () => {
    for (const col of LIST_COLUMNS) expect(parseRowsQuery(params({ sort: col })).sort).toBe(col);
    for (const bad of ["total; DROP TABLE walmart", "1", "password", "walmart.total", ""]) {
      if (bad === "") continue; // empty string falls back to the default via ?? only when absent
      expect(() => parseRowsQuery(params({ sort: bad }))).toThrow(/"sort" must be one of/);
    }
    expect(() => parseRowsQuery(params({ dir: "sideways" }))).toThrow(AppError);
  });

  it("rejects malformed numbers, dates and over-long text", () => {
    expect(() => parseRowFilters(params({ year: "20x1" }))).toThrow(AppError);
    expect(() => parseRowFilters(params({ month: "13" }))).toThrow(AppError);
    expect(() => parseRowFilters(params({ date_from: "2021-02-30" }))).toThrow(/YYYY-MM-DD/);
    expect(() => parseRowFilters(params({ date_from: "2021-02-01", date_to: "2021-01-01" }))).toThrow(/must not be after/);
    expect(() => parseRowFilters(params({ q: "x".repeat(101) }))).toThrow(/at most 100/);
  });

  it("ignores blank filters", () => {
    expect(parseRowFilters(params({ q: "  ", city: "" })).text).toEqual({});
  });
});

describe("buildRowsStatements", () => {
  it("binds every value and never inlines it", () => {
    const evil = `'; DROP TABLE walmart; --`;
    const { page, count } = buildRowsStatements(
      parseRowsQuery(params({ q: evil, city: evil, category: "A" })),
    );
    for (const s of [page, count]) {
      expect(s.text).not.toContain("DROP");
      expect(s.text).not.toContain(evil);
    }
    expect(page.params).toContain(evil);
    expect(page.params).toContain(`%${escapeLike(evil)}%`);
  });

  it("numbers parameters independently for the page and count statements", () => {
    const { page, count } = buildRowsStatements(parseRowsQuery(params({ category: "A", year: "2020", pageSize: "10", page: "2" })));
    expect(count.params).toEqual(["A", 2020]);
    expect(page.params).toEqual(["A", 2020, 10, 10]);
    expect(page.text).toMatch(/LIMIT \$3::int OFFSET \$4::int$/);
  });

  it("always breaks ties on invoice_id so pages never overlap", () => {
    const { page } = buildRowsStatements(parseRowsQuery(params({ sort: "rating", dir: "desc" })));
    expect(page.text).toContain('ORDER BY walmart."rating" DESC, walmart.invoice_id ASC');
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("rows API against real data (PGlite + full dataset)", () => {
  let db: TestDb;
  let csv: CsvRow[];
  beforeAll(async () => {
    db = await createWalmartDb();
    csv = readCsvRows();
  });
  afterAll(() => db.close());

  async function page(init: Record<string, string>) {
    const query = parseRowsQuery(params(init));
    const { page, count } = buildRowsStatements(query);
    const [rows, [{ total }]] = await Promise.all([db.run(page), db.run(count)]);
    return buildRowsPage(rows, Number(total), query);
  }

  it("returns one page plus the true total, never more than pageSize rows", async () => {
    const p = await page({ pageSize: "25" });
    expect(p.rows).toHaveLength(25);
    expect(p.total).toBe(csv.length);
    expect(p.totalPages).toBe(Math.ceil(csv.length / 25));
    expect(Object.keys(p.rows[0])).toEqual([...LIST_COLUMNS]);
  });

  it("exposes typed date/time strings alongside the original text columns", async () => {
    const p = await page({ pageSize: "1" });
    const row = p.rows[0];
    const src = csv.find((r) => r.invoice_id === String(row.invoice_id))!;
    expect(row.date).toBe(src.date);
    expect(row.sale_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(row.sale_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("sorts dates chronologically by sale_date (text dates sort wrongly)", async () => {
    const asc = await page({ sort: "sale_date", dir: "asc", pageSize: "200" });
    const dates = asc.rows.map((r) => r.sale_date as string);
    expect(dates).toEqual([...dates].sort());
    expect(dates[0]).toBe("2019-01-01");

    const desc = await page({ sort: "sale_date", dir: "desc", pageSize: "1" });
    expect(desc.rows[0].sale_date).toBe("2023-12-31");

    // Why the typed column matters: sorting the raw 'DD/MM/YY' text orders by day-of-month first,
    // so the same page is NOT chronological.
    const byText = await page({ sort: "date", dir: "asc", pageSize: "200" });
    const textOrder = byText.rows.map((r) => r.sale_date as string);
    expect(textOrder).not.toEqual([...textOrder].sort());
  });

  it("pages are disjoint and cover the table exactly", async () => {
    const seen = new Set<number>();
    let pageNo = 1;
    for (;;) {
      const p = await page({ page: String(pageNo), pageSize: "200", sort: "total", dir: "desc" });
      for (const r of p.rows) {
        expect(seen.has(r.invoice_id as number)).toBe(false);
        seen.add(r.invoice_id as number);
      }
      if (pageNo >= p.totalPages) break;
      pageNo++;
    }
    expect(seen.size).toBe(csv.length);
  });

  it("filters server-side and reports the filtered total", async () => {
    const p = await page({ category: "Health and beauty", payment_method: "Cash", pageSize: "200" });
    const expected = csv.filter((r) => r.category === "Health and beauty" && r.payment_method === "Cash");
    expect(p.total).toBe(expected.length);
    expect(p.rows.length).toBe(Math.min(200, expected.length));
    expect(p.rows.every((r) => r.category === "Health and beauty" && r.payment_method === "Cash")).toBe(true);
  });

  it("filters by year, month and date range", async () => {
    expect((await page({ year: "2019" })).total).toBe(csv.filter((r) => r.year === "2019").length);
    expect((await page({ month: "11" })).total).toBe(csv.filter((r) => r.month === "11").length);
    const range = await page({ date_from: "2021-06-01", date_to: "2021-06-30" });
    expect(range.total).toBe(csv.filter((r) => r.year === "2021" && r.month === "6").length);
  });

  it("free-text search is case-insensitive across text columns and the invoice id", async () => {
    const byCity = await page({ q: "san antonio" });
    expect(byCity.total).toBe(csv.filter((r) => r.city.toLowerCase().includes("san antonio") || [r.branch, r.category, r.payment_method, r.day_of_week, r.month_name, r.shift, r.revenue_tier, r.invoice_id].some((v) => v.toLowerCase().includes("san antonio"))).length);
    expect(byCity.total).toBeGreaterThan(0);

    const id = csv[100].invoice_id;
    const byId = await page({ q: id });
    expect(byId.rows.map((r) => String(r.invoice_id))).toContain(id);
  });

  it("treats % and _ in search text literally, not as wildcards", async () => {
    expect((await page({ q: "%" })).total).toBe(0);
    expect((await page({ q: "_" })).total).toBe(0);
    expect((await page({ q: "\\" })).total).toBe(0);
  });

  it("hostile filter values are just data", async () => {
    const p = await page({ city: `x'; DROP TABLE walmart; --`, q: `' OR 1=1 --` });
    expect(p.total).toBe(0);
    expect((await page({})).total).toBe(csv.length);
  });

  it("an out-of-range page returns no rows but the correct total", async () => {
    const p = await page({ page: "100", pageSize: "200" }); // offset 19,800: past the data, under the paging cap
    expect(p.rows).toEqual([]);
    expect(p.total).toBe(csv.length);
  });
});

describe("keyset export batches against real data", () => {
  let db: TestDb;
  let csv: CsvRow[];
  beforeAll(async () => {
    db = await createWalmartDb();
    csv = readCsvRows();
  });
  afterAll(() => db.close());

  async function exportAll(filters: URLSearchParams, batchSize: number) {
    const f = parseRowFilters(filters);
    const out: Record<string, unknown>[] = [];
    let after = 0;
    let batches = 0;
    for (;;) {
      const rows = await db.run(buildExportBatch(f, after, batchSize));
      batches++;
      out.push(...rows);
      if (rows.length < batchSize) break;
      after = Number(rows[rows.length - 1].invoice_id);
    }
    return { rows: out, batches };
  }

  it("reconstructs the full dataset exactly once, in order, in bounded batches", async () => {
    const { rows, batches } = await exportAll(params({}), 1000);
    expect(rows).toHaveLength(csv.length);
    expect(batches).toBe(Math.floor(csv.length / 1000) + 1);
    const ids = rows.map((r) => Number(r.invoice_id));
    expect(new Set(ids).size).toBe(csv.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(Object.keys(rows[0])).toEqual([...EXPORT_COLUMNS]);
    // Spot check values round-trip (text date stays DD/MM/YY, as before).
    const src = csv.find((r) => r.invoice_id === String(rows[7].invoice_id))!;
    expect(rows[7].date).toBe(src.date);
    expect(rows[7].time).toBe(src.time);
    expect(rows[7].total).toBeCloseTo(Number(src.total), 6);
  });

  it("handles a batch size that divides the table exactly", async () => {
    const { rows } = await exportAll(params({ year: "2019" }), 500); // 1000 rows -> two full batches + empty
    expect(rows).toHaveLength(1000);
  });

  it("honours filters", async () => {
    const { rows } = await exportAll(params({ category: "Sports and travel", shift: "Evening" }), 50);
    const expected = csv.filter((r) => r.category === "Sports and travel" && r.shift === "Evening");
    expect(rows).toHaveLength(expected.length);
  });

  it("is keyset, not offset: the statement filters on invoice_id and never uses OFFSET", () => {
    const s = buildExportBatch(parseRowFilters(params({})), 4242, 1000);
    expect(s.text).toContain("invoice_id > $1::int");
    expect(s.text).not.toMatch(/OFFSET/i);
    expect(s.params).toEqual([4242, 1000]);
  });
});
