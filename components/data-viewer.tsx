"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = Record<string, unknown>;
interface Props { onClose: () => void; }

const NUMBER_COLS = new Set([
  "invoice_id","unit_price","quantity","rating","profit_margin",
  "total","profit_amount","year","month","week_number","hour",
]);

function toHeader(f: string) {
  return f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DataViewer({ onClose }: Props) {
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState("");
  const [page,    setPage]    = useState(0);
  const PAGE = 100;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    fetch("/api/data")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { rows?: Row[]; error?: string }) => {
        if (!active) return;
        if (json.error) setError(json.error);
        else setRows(json.rows ?? []);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Failed");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q))
    );
  }, [rows, filter]);

  const cols     = useMemo(() => (rows.length > 0 ? Object.keys(rows[0]) : []), [rows]);
  const total    = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);

  useEffect(() => setPage(0), [filter]);

  const atStart = page === 0;
  const atEnd   = page >= total - 1;

  const paginationButtons: { label: string; onClick: () => void; disabled: boolean }[] = [
    { label: "«",      onClick: () => setPage(0),                                    disabled: atStart },
    { label: "‹ Prev", onClick: () => setPage((p) => Math.max(0, p - 1)),            disabled: atStart },
    { label: "Next ›", onClick: () => setPage((p) => Math.min(total - 1, p + 1)),   disabled: atEnd   },
    { label: "»",      onClick: () => setPage(total - 1),                            disabled: atEnd   },
  ];

  const firstRow = filtered.length === 0 ? 0 : page * PAGE + 1;
  const lastRow  = Math.min((page + 1) * PAGE, filtered.length);

  return (
    <div className="fixed top-0 left-0 w-screen h-screen z-50 grid grid-rows-[auto_1fr_auto] bg-zinc-950 text-zinc-200">

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900 px-6 py-3 w-screen overflow-scroll">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100 leading-none">
            Walmart Dataset
          </h2>
          <p className="mt-0.5 text-[0.6875rem] text-zinc-500">
            {loading
              ? "Loading…"
              : `${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()} rows · ${cols.length} columns`}
          </p>
        </div>

        <div className="relative flex items-center w-52">
          <Search size={12} className="absolute left-2.5 text-zinc-500 pointer-events-none" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search all columns…"
            className="h-8 pl-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/export"
            download="walmart_cleaned_data.csv"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 no-underline hover:text-zinc-100 transition-colors"
          >
            <Download size={12} />Download CSV
          </a>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="min-h-0 overflow-auto">
        {loading && (
          <div className="h-full flex items-center justify-center gap-3 text-zinc-500 text-sm">
            <Loader2 size={18} className="animate-spin text-indigo-400" />
            Fetching data from Neon…
          </div>
        )}
        {error && (
          <div className="h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">
            {error}
          </div>
        )}
        {!loading && !error && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900">
              <tr>
                {cols.map((c) => (
                  <th
                    key={c}
                    className={`whitespace-nowrap border-b border-zinc-700 px-3 py-2.5 font-medium text-zinc-400 text-xs ${NUMBER_COLS.has(c) ? "text-right" : "text-left"}`}
                  >
                    {toHeader(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr
                  key={ri}
                  className={`border-b border-zinc-800 ${ri % 2 === 1 ? "bg-zinc-900" : ""}`}
                >
                  {cols.map((c) => (
                    <td
                      key={c}
                      className={`whitespace-nowrap px-3 py-2 text-zinc-200 text-xs ${NUMBER_COLS.has(c) ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {row[c] == null ? <span className="text-zinc-600">—</span> : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900 px-4 py-2.5">
        <span className="text-xs text-zinc-500">
          {loading ? "Loading…" : `Page ${page + 1} of ${total} · rows ${firstRow}–${lastRow}`}
        </span>
        <div className="flex items-center gap-1.5">
          {paginationButtons.map(({ label, onClick, disabled }) => {
            const off = loading || disabled;
            return (
              <button
                key={label}
                onClick={onClick}
                disabled={off}
                className="rounded px-2 py-1 text-xs text-zinc-500 bg-transparent border-0 hover:text-zinc-100 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
