"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
  type ColumnVisibilityState,
  type PaginationState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Search,
  Download,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Feature setup ────────────────────────────────────────────────────────────

const features = tableFeatures({
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

type TF = typeof features;

// ─── Data type ────────────────────────────────────────────────────────────────

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
};

// ─── Column definitions ───────────────────────────────────────────────────────

const col = createColumnHelper<TF, WalmartRow>();

function SortHeader({ column, label }: { column: any; label: string }) {
  const sorted = column.getIsSorted();
  return (
    <button
      className="flex items-center gap-1 hover:text-zinc-100 transition-colors"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

const columns = col.columns([
  col.accessor("invoice_id", {
    header: ({ column }) => <SortHeader column={column} label="Invoice ID" />,
    sortFn: "alphanumeric",
    enableGlobalFilter: true,
  }),
  col.accessor("branch", {
    header: ({ column }) => <SortHeader column={column} label="Branch" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("city", {
    header: ({ column }) => <SortHeader column={column} label="City" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("category", {
    header: ({ column }) => <SortHeader column={column} label="Category" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("unit_price", {
    header: ({ column }) => <SortHeader column={column} label="Unit Price" />,
    cell: ({ getValue }) => (
      <span className="tabular-nums">${(getValue() as number).toFixed(2)}</span>
    ),
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("quantity", {
    header: ({ column }) => <SortHeader column={column} label="Qty" />,
    cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("total", {
    header: ({ column }) => <SortHeader column={column} label="Total" />,
    cell: ({ getValue }) => (
      <span className="tabular-nums">${(getValue() as number).toFixed(2)}</span>
    ),
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("payment_method", {
    header: ({ column }) => <SortHeader column={column} label="Payment" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("rating", {
    header: ({ column }) => <SortHeader column={column} label="Rating" />,
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number).toFixed(1)}</span>
    ),
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("profit_margin", {
    header: ({ column }) => <SortHeader column={column} label="Margin" />,
    cell: ({ getValue }) => (
      <span className="tabular-nums">{((getValue() as number) * 100).toFixed(1)}%</span>
    ),
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("profit_amount", {
    header: ({ column }) => <SortHeader column={column} label="Profit" />,
    cell: ({ getValue }) => (
      <span className="tabular-nums">${(getValue() as number).toFixed(2)}</span>
    ),
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("date", {
    header: ({ column }) => <SortHeader column={column} label="Date" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("time", {
    header: "Time",
    enableGlobalFilter: false,
  }),
  col.accessor("shift", {
    header: ({ column }) => <SortHeader column={column} label="Shift" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("revenue_tier", {
    header: ({ column }) => <SortHeader column={column} label="Revenue Tier" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("day_of_week", {
    header: ({ column }) => <SortHeader column={column} label="Day" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("month_name", {
    header: ({ column }) => <SortHeader column={column} label="Month" />,
    sortFn: "text",
    enableGlobalFilter: true,
  }),
  col.accessor("week_number", {
    header: ({ column }) => <SortHeader column={column} label="Week" />,
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("hour", {
    header: ({ column }) => <SortHeader column={column} label="Hour" />,
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
  col.accessor("year", {
    header: "Year",
    enableGlobalFilter: false,
  }),
  col.accessor("month", {
    header: ({ column }) => <SortHeader column={column} label="Month #" />,
    sortFn: "alphanumeric",
    enableGlobalFilter: false,
  }),
]);

// ─── Column display names for visibility panel ────────────────────────────────

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
  date: "Date",
  time: "Time",
  shift: "Shift",
  revenue_tier: "Revenue Tier",
  day_of_week: "Day",
  month_name: "Month",
  week_number: "Week",
  hour: "Hour",
  year: "Year",
  month: "Month #",
};

// ─── Page size options ────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 50, 100, 200];

// ─── Main component ───────────────────────────────────────────────────────────

export function WalmartDataTable({ data }: { data: WalmartRow[] }) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({
    time: false,
    year: false,
    month: false,
    week_number: false,
    hour: false,
  });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const [colPanelOpen, setColPanelOpen] = useState(false);
  const colPanelRef = useRef<HTMLDivElement>(null);

  // Close column panel on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (colPanelRef.current && !colPanelRef.current.contains(e.target as Node)) {
        setColPanelOpen(false);
      }
    }
    if (colPanelOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [colPanelOpen]);

  const table = useTable({
    features,
    data,
    columns,
    state: {
      globalFilter,
      sorting,
      columnVisibility,
      pagination,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    globalFilterFn: "includesString" as any,
  });

  const totalFiltered = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize } = pagination;
  const totalPages = table.getPageCount();

  return (
    <div className="flex flex-col gap-4">

      {/* ── Controls ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Global search */}
        <div className="relative flex items-center min-w-[220px] max-w-xs flex-1">
          <Search className="absolute left-3 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            placeholder="Search all columns…"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
            className="pl-9 h-9 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-500 text-sm"
          />
          {globalFilter && (
            <button
              onClick={() => setGlobalFilter("")}
              className="absolute right-2 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Column visibility toggle */}
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
                      <span className="text-xs text-zinc-300">
                        {COLUMN_LABELS[c.id] ?? c.id}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Page size */}
        <div className="flex items-center gap-2 text-xs text-zinc-500 ml-auto">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) =>
              setPagination({ pageIndex: 0, pageSize: Number(e.target.value) })
            }
            className="h-9 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="text-xs text-zinc-500">
        {globalFilter
          ? `${totalFiltered.toLocaleString()} of ${data.length.toLocaleString()} rows match`
          : `${data.length.toLocaleString()} rows · ${table.getVisibleLeafColumns().length} columns visible`}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-zinc-800 bg-zinc-900 hover:bg-zinc-900">
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-zinc-400 text-xs font-medium px-3 py-2.5 whitespace-nowrap border-b border-zinc-800"
                    >
                      {header.isPlaceholder ? null : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  ))}
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
                      <TableCell
                        key={cell.id}
                        className="text-zinc-200 text-xs px-3 py-2 whitespace-nowrap"
                      >
                        {cell.getValue() == null ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <table.FlexRender cell={cell} />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-zinc-500 text-sm"
                  >
                    No results found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Pagination ── */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-zinc-500">
          Page {pageIndex + 1} of {totalPages} ·{" "}
          {Math.min((pageIndex + 1) * pageSize, totalFiltered).toLocaleString()} /{" "}
          {totalFiltered.toLocaleString()} rows
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Page number pills */}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let page: number;
            if (totalPages <= 5) {
              page = i;
            } else if (pageIndex < 3) {
              page = i;
            } else if (pageIndex > totalPages - 4) {
              page = totalPages - 5 + i;
            } else {
              page = pageIndex - 2 + i;
            }
            return (
              <Button
                key={page}
                variant={pageIndex === page ? "default" : "outline"}
                size="sm"
                className={`h-8 w-8 text-xs border-zinc-700 ${
                  pageIndex === page
                    ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500"
                    : "bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                }`}
                onClick={() => table.setPageIndex(page)}
              >
                {page + 1}
              </Button>
            );
          })}

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30"
            onClick={() => table.setPageIndex(totalPages - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
