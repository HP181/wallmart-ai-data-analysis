"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnVisibilityFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Download,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FILTER_OPTIONS,
  INITIAL_GRID_STATE,
  PAGE_SIZES,
  exportHref,
  pageQueryString,
  type FilterKey,
  type GridState,
} from "./table-state";

// Paging, sorting and filtering all happen on the server (/api/data), so the
// table only ever holds one page of rows. TanStack Table is used in manual mode.
const features = tableFeatures({
  columnVisibilityFeature,
  rowPaginationFeature,
  rowSortingFeature,
});

type TF = typeof features;

export type WalmartRow = {
  invoice_id: number;
  branch: string;
  city: string;
  category: string;
  unit_price: number;
  quantity: number;
  date: string;
  time: string;
  payment_method: string;
  rating: number;
  profit_margin: number;
  total: number;
  profit_amount: number;
  year: number;
  month: number;
  month_name: string;
  day_of_week: string;
  week_number: number;
  hour: number;
  shift: string;
  revenue_tier: string;
  sale_date: string | null;
  sale_time: string | null;
};

type PageResponse = {
  rows: WalmartRow[];
  total: number;
  totalPages: number;
};

const col = createColumnHelper<TF, WalmartRow>();

const money = (v: unknown) => <span className="tabular-nums">${Number(v).toFixed(2)}</span>;
const num = (v: unknown) => <span className="tabular-nums">{String(v)}</span>;

const COLUMN_LABELS: Record<string, string> = {
  invoice_id: "Invoice ID",
  branch: "Branch",
  city: "City",
  category: "Category",
  unit_price: "Unit Price",
  quantity: "Qty",
  total: "Total",
  payment_method: "Payment",
  rating: "Rating",
  profit_margin: "Margin",
  profit_amount: "Profit",
  sale_date: "Date",
  sale_time: "Time",
  shift: "Shift",
  revenue_tier: "Revenue Tier",
  day_of_week: "Day",
  month_name: "Month",
  week_number: "Week",
  hour: "Hour",
  year: "Year",
  month: "Month #",
};

const columns = col.columns([
  col.accessor("invoice_id", { header: COLUMN_LABELS.invoice_id }),
  col.accessor("branch", { header: COLUMN_LABELS.branch }),
  col.accessor("city", { header: COLUMN_LABELS.city }),
  col.accessor("category", { header: COLUMN_LABELS.category }),
  col.accessor("unit_price", { header: COLUMN_LABELS.unit_price, cell: ({ getValue }) => money(getValue()) }),
  col.accessor("quantity", { header: COLUMN_LABELS.quantity, cell: ({ getValue }) => num(getValue()) }),
  col.accessor("total", { header: COLUMN_LABELS.total, cell: ({ getValue }) => money(getValue()) }),
  col.accessor("payment_method", { header: COLUMN_LABELS.payment_method }),
  col.accessor("rating", { header: COLUMN_LABELS.rating, cell: ({ getValue }) => num(Number(getValue()).toFixed(1)) }),
  col.accessor("profit_margin", {
    header: COLUMN_LABELS.profit_margin,
    cell: ({ getValue }) => num(`${(Number(getValue()) * 100).toFixed(1)}%`),
  }),
  col.accessor("profit_amount", { header: COLUMN_LABELS.profit_amount, cell: ({ getValue }) => money(getValue()) }),
  col.accessor("sale_date", { header: COLUMN_LABELS.sale_date }),
  col.accessor("sale_time", { header: COLUMN_LABELS.sale_time }),
  col.accessor("shift", { header: COLUMN_LABELS.shift }),
  col.accessor("revenue_tier", { header: COLUMN_LABELS.revenue_tier }),
  col.accessor("day_of_week", { header: COLUMN_LABELS.day_of_week }),
  col.accessor("month_name", { header: COLUMN_LABELS.month_name }),
  col.accessor("week_number", { header: COLUMN_LABELS.week_number }),
  col.accessor("hour", { header: COLUMN_LABELS.hour }),
  col.accessor("year", { header: COLUMN_LABELS.year }),
  col.accessor("month", { header: COLUMN_LABELS.month }),
]);

const FILTER_LABELS: Record<FilterKey, string> = {
  category: "Category",
  payment_method: "Payment",
  shift: "Shift",
  year: "Year",
};

const selectClass =
  "h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500";

const pagerButton =
  "h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30";

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function WalmartDataTable() {
  const [gridState, setGrid] = useState<GridState>(INITIAL_GRID_STATE);
  const [searchText, setSearchText] = useState("");
  const [loaded, setLoaded] = useState<{ key: string; data: PageResponse } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({
    sale_time: false,
    year: false,
    month: false,
    week_number: false,
    hour: false,
  });
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Search is debounced so each keystroke does not hit the database. The
  // effective grid state is derived, so no effect has to copy it into state.
  const debouncedSearch = useDebounced(searchText, 300);
  const grid = useMemo<GridState>(() => ({ ...gridState, q: debouncedSearch.trim() }), [gridState, debouncedSearch]);
  const queryString = useMemo(() => pageQueryString(grid), [grid]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/data?${queryString}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error?.message ?? `Request failed (${res.status}).`);
        }
        setLoaded({ key: queryString, data: body as PageResponse });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setFailed({ key: queryString, message: err instanceof Error ? err.message : "Could not load data." });
      });
    return () => controller.abort();
  }, [queryString]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) setColPanelOpen(false);
    }
    if (colPanelOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [colPanelOpen]);

  const result = loaded?.data ?? null;
  const loading = loaded?.key !== queryString && failed?.key !== queryString;
  const error = failed?.key === queryString ? failed.message : null;

  const sorting: SortingState = [{ id: grid.sort, desc: grid.dir === "desc" }];
  const pagination: PaginationState = { pageIndex: grid.page - 1, pageSize: grid.pageSize };
  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;

  const table = useTable({
    features,
    data: result?.rows ?? [],
    columns,
    manualPagination: true,
    manualSorting: true,
    rowCount: total,
    state: { sorting, pagination, columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
  });

  function toggleSort(id: string) {
    setGrid((g) => ({
      ...g,
      sort: id,
      dir: g.sort === id && g.dir === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }

  function setFilter(key: FilterKey, value: string) {
    setGrid((g) => {
      const filters = { ...g.filters };
      if (value) filters[key] = value;
      else delete filters[key];
      return { ...g, filters, page: 1 };
    });
  }

  const hasFilters = grid.q !== "" || Object.keys(grid.filters).length > 0;
  const firstRow = total === 0 ? 0 : (grid.page - 1) * grid.pageSize + 1;
  const lastRow = Math.min(grid.page * grid.pageSize, total);
  const goTo = (page: number) => setGrid((g) => ({ ...g, page: Math.min(Math.max(1, page), totalPages) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex items-center min-w-[220px] max-w-xs flex-1">
          <Search className="absolute left-3 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            aria-label="Search transactions"
            placeholder="Search branch, city, category..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setGrid((g) => ({ ...g, page: 1 }));
            }}
            className="pl-9 h-9 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500 text-sm"
          />
          {searchText && (
            <button
              aria-label="Clear search"
              onClick={() => setSearchText("")}
              className="absolute right-2 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {(Object.keys(FILTER_OPTIONS) as FilterKey[]).map((key) => (
          <select
            key={key}
            aria-label={FILTER_LABELS[key]}
            value={grid.filters[key] ?? ""}
            onChange={(e) => setFilter(key, e.target.value)}
            className={selectClass}
          >
            <option value="">{FILTER_LABELS[key]}: all</option>
            {FILTER_OPTIONS[key].map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ))}

        {hasFilters && (
          <button
            onClick={() => {
              setSearchText("");
              setGrid((g) => ({ ...g, filters: {}, page: 1 }));
            }}
            className="text-xs text-zinc-400 hover:text-zinc-100 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}

        <div className="relative" ref={colPanelRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setColPanelOpen((o) => !o)}
            className="h-9 gap-2 border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800"
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </Button>
          {colPanelOpen && (
            <div className="absolute top-full mt-2 right-0 z-30 w-52 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl p-3">
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2 px-1">
                Toggle columns
              </p>
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {table
                  .getAllColumns()
                  .filter((c) => c.getCanHide())
                  .map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2.5 px-1 py-1 rounded hover:bg-zinc-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={c.getIsVisible()}
                        onChange={(e) => c.toggleVisibility(e.target.checked)}
                        className="h-3.5 w-3.5 accent-indigo-500 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300">{COLUMN_LABELS[c.id] ?? c.id}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            if (exporting) return;
            setExporting(true);
            const url = exportHref(grid);
            let res: Response;
            fetch(url)
              .then((r) => {
                res = r;
                if (r.status === 429) {
                  const retryAfter = r.headers.get("retry-after") ?? "60";
                  toast(`Export limit reached. Please wait ${retryAfter}s before trying again.`);
                  throw new Error("rate_limited");
                }
                if (!r.ok) {
                  toast("Export failed. Please try again.");
                  throw new Error("export_failed");
                }
                return r.blob();
              })
              .then((blob) => {
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = "walmart_cleaned_data.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
              })
              .catch((err: unknown) => {
                if (err instanceof Error && (err.message === "rate_limited" || err.message === "export_failed")) return;
                toast("Export failed. Check your connection and try again.");
              })
              .finally(() => setExporting(false));
          }}
          disabled={exporting}
          className="flex h-9 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={hasFilters ? "Download the filtered rows as CSV" : "Download all rows as CSV"}
        >
          <Download className={`h-3.5 w-3.5 ${exporting ? "animate-pulse" : ""}`} />
          {exporting ? "Exporting…" : hasFilters ? "Export filtered" : "Export all"}
        </button>

        <div className="flex items-center gap-2 text-xs text-zinc-500 ml-auto">
          <span>Rows per page</span>
          <select
            aria-label="Rows per page"
            value={grid.pageSize}
            onChange={(e) => setGrid((g) => ({ ...g, pageSize: Number(e.target.value), page: 1 }))}
            className={selectClass}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-xs text-zinc-500" aria-live="polite">
        {error
          ? null
          : result
            ? `${total.toLocaleString("en-US")} ${hasFilters ? "matching " : ""}rows`
            : "Loading..."}
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div
        className={`rounded-lg border border-zinc-800 overflow-hidden transition-opacity ${
          loading ? "opacity-60" : ""
        }`}
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-zinc-800 bg-zinc-900 hover:bg-zinc-900">
                  {hg.headers.map((header) => {
                    const active = grid.sort === header.column.id;
                    return (
                      <TableHead
                        key={header.id}
                        aria-sort={active ? (grid.dir === "asc" ? "ascending" : "descending") : "none"}
                        className="text-zinc-400 text-xs font-medium px-3 py-2.5 whitespace-nowrap border-b border-zinc-800"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            className="flex items-center gap-1 hover:text-zinc-100 transition-colors"
                            onClick={() => toggleSort(header.column.id)}
                          >
                            <table.FlexRender header={header} />
                            {active ? (
                              grid.dir === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row, ri) => (
                  <TableRow
                    key={row.id}
                    className={`border-zinc-800 hover:bg-zinc-800/60 transition-colors ${
                      ri % 2 === 1 ? "bg-zinc-900/40" : ""
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="text-zinc-200 text-xs px-3 py-2 whitespace-nowrap">
                        {cell.getValue() == null ? (
                          <span className="text-zinc-600">-</span>
                        ) : (
                          <table.FlexRender cell={cell} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-zinc-500 text-sm">
                    {loading ? "Loading..." : "No results found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-zinc-500">
          Page {grid.page.toLocaleString("en-US")} of {totalPages.toLocaleString("en-US")} -{" "}
          {firstRow.toLocaleString("en-US")}-{lastRow.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="First page" className={pagerButton} onClick={() => goTo(1)} disabled={grid.page <= 1}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Previous page" className={pagerButton} onClick={() => goTo(grid.page - 1)} disabled={grid.page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next page" className={pagerButton} onClick={() => goTo(grid.page + 1)} disabled={grid.page >= totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Last page" className={pagerButton} onClick={() => goTo(totalPages)} disabled={grid.page >= totalPages}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
