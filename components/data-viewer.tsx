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
    <div style={{
      position: "fixed", top: 0, left: 0,
      width: "100vw", height: "100vh",
      zIndex: 50,
      display: "grid", gridTemplateRows: "auto 1fr auto",
      backgroundColor: "#09090b", color: "#e4e4e7",
    }}>

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "0.75rem", borderBottom: "1px solid #27272a", backgroundColor: "#18181b",
        padding: "0.75rem 1.5rem",
      }}>
        <div>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f4f4f5", lineHeight: 1 }}>
            Walmart Dataset
          </h2>
          <p style={{ marginTop: "0.125rem", fontSize: "0.6875rem", color: "#71717a" }}>
            {loading
              ? "Loading…"
              : `${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()} rows · ${cols.length} columns`}
          </p>
        </div>

        <div style={{ position: "relative", display: "flex", alignItems: "center", width: "13rem" }}>
          <Search size={12} style={{ position: "absolute", left: "0.625rem", color: "#71717a", pointerEvents: "none" }} />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search all columns…"
            className="h-8 pl-7 text-xs bg-zinc-800 border-zinc-700 text-zinc-200 placeholder:text-zinc-500"
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <a
            href="/api/export"
            download="walmart_cleaned_data.csv"
            style={{
              display: "flex", alignItems: "center", gap: "0.375rem", borderRadius: "0.5rem",
              border: "1px solid #3f3f46", backgroundColor: "#27272a", padding: "0.375rem 0.625rem",
              fontSize: "0.75rem", color: "#a1a1aa", textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#f4f4f5")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
          >
            <Download size={12} />Download CSV
          </a>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-zinc-100" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* Scrollable table area: grid row 1fr handles height, overflow auto scrolls */}
      <div style={{ minHeight: 0, overflow: "auto" }}>
        {loading && (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            gap: "0.75rem", color: "#71717a", fontSize: "0.875rem",
          }}>
            <Loader2 size={18} className="animate-spin text-indigo-400" />
            Fetching data from Neon…
          </div>
        )}
        {error && (
          <div style={{
            height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#f87171", fontSize: "0.875rem", padding: "0 1rem", textAlign: "center",
          }}>
            {error}
          </div>
        )}
        {!loading && !error && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "#18181b" }}>
              <tr>
                {cols.map((c) => (
                  <th key={c} style={{
                    whiteSpace: "nowrap", borderBottom: "1px solid #3f3f46",
                    padding: "0.625rem 0.75rem", textAlign: NUMBER_COLS.has(c) ? "right" : "left",
                    fontWeight: 500, color: "#a1a1aa", fontSize: "0.75rem",
                  }}>
                    {toHeader(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => (
                <tr key={ri} style={{
                  backgroundColor: ri % 2 === 1 ? "#18181b" : "transparent",
                  borderBottom: "1px solid #27272a",
                }}>
                  {cols.map((c) => (
                    <td key={c} style={{
                      whiteSpace: "nowrap", padding: "0.5rem 0.75rem",
                      color: "#e4e4e7", fontSize: "0.75rem",
                      textAlign: NUMBER_COLS.has(c) ? "right" : "left",
                      fontVariantNumeric: NUMBER_COLS.has(c) ? "tabular-nums" : undefined,
                    }}>
                      {row[c] == null ? <span style={{ color: "#52525b" }}>—</span> : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: "0.5rem", borderTop: "1px solid #27272a", backgroundColor: "#18181b",
        padding: "0.625rem 1rem",
      }}>
        <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
          {loading ? "Loading…" : `Page ${page + 1} of ${total} · rows ${firstRow}–${lastRow}`}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          {paginationButtons.map(({ label, onClick, disabled }) => {
            const off = loading || disabled;
            return (
              <button
                key={label}
                onClick={onClick}
                disabled={off}
                style={{
                  borderRadius: "0.25rem", padding: "0.25rem 0.5rem", fontSize: "0.75rem",
                  color: "#71717a", background: "none", border: "none",
                  opacity: off ? 0.3 : 1, cursor: off ? "default" : "pointer",
                }}
                onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.color = "#f4f4f5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "#71717a"; }}
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
