/**
 * URL/query-string handling for the data grid. Kept free of React so it is
 * unit-testable and shared by the paged fetch and the CSV export link.
 */

export const PAGE_SIZES = [20, 50, 100, 200] as const;

export const FILTER_OPTIONS = {
  category: [
    "Fashion accessories",
    "Home and lifestyle",
    "Electronic accessories",
    "Food and beverages",
    "Sports and travel",
    "Health and beauty",
  ],
  payment_method: ["Credit card", "Ewallet", "Cash"],
  shift: ["Morning", "Afternoon", "Evening"],
  year: ["2019", "2020", "2021", "2022", "2023"],
} as const;

export type FilterKey = keyof typeof FILTER_OPTIONS;

export type GridState = {
  q: string;
  filters: Partial<Record<FilterKey, string>>;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const INITIAL_GRID_STATE: GridState = {
  q: "",
  filters: {},
  sort: "invoice_id",
  dir: "asc",
  page: 1,
  pageSize: 50,
};

/** Filters only (what the export honours). */
export function filterParams(state: Pick<GridState, "q" | "filters">): URLSearchParams {
  const params = new URLSearchParams();
  const q = state.q.trim();
  if (q) params.set("q", q);
  for (const key of Object.keys(FILTER_OPTIONS) as FilterKey[]) {
    const value = state.filters[key];
    if (value) params.set(key, value);
  }
  return params;
}

export function pageQueryString(state: GridState): string {
  const params = filterParams(state);
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  params.set("sort", state.sort);
  params.set("dir", state.dir);
  return params.toString();
}

export function exportHref(state: Pick<GridState, "q" | "filters">): string {
  const qs = filterParams(state).toString();
  return qs ? `/api/export?${qs}` : "/api/export";
}
