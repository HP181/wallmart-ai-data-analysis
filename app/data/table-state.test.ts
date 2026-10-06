import { describe, expect, it } from "vitest";
import { INITIAL_GRID_STATE, exportHref, filterParams, pageQueryString } from "./table-state";
import { parseRowsQuery } from "@/lib/data/rows";

describe("data grid query strings", () => {
  it("builds a query the API accepts", () => {
    const qs = pageQueryString({
      ...INITIAL_GRID_STATE,
      q: "  san antonio ",
      filters: { category: "Home and lifestyle", year: "2022" },
      sort: "total",
      dir: "desc",
      page: 3,
      pageSize: 100,
    });
    const parsed = parseRowsQuery(new URLSearchParams(qs));
    expect(parsed.filters.q).toBe("san antonio");
    expect(parsed.filters.text.category).toBe("Home and lifestyle");
    expect(parsed.filters.year).toBe(2022);
    expect(parsed).toMatchObject({ sort: "total", dir: "desc", page: 3, pageSize: 100 });
  });

  it("omits empty filters", () => {
    expect(filterParams({ q: "   ", filters: { shift: "" } }).toString()).toBe("");
    expect(exportHref({ q: "", filters: {} })).toBe("/api/export");
  });

  it("carries the current filters into the export link, without paging or sort", () => {
    const href = exportHref({ q: "a&b", filters: { payment_method: "Credit card" } });
    expect(href).toBe("/api/export?q=a%26b&payment_method=Credit+card");
  });
});
