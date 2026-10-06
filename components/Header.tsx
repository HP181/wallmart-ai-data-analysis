"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart2, Database, Download, Sparkles, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Health = {
  status: "ok" | "degraded" | "error";
  dataset?: { rows: number; database: string | null };
  model?: string;
};

type HealthState = { kind: "loading" } | { kind: "unreachable" } | ({ kind: "ready" } & Health);

/** Status indicator shown in the header. Pure, so it can be rendered in tests. */
export function statusBadge(state: HealthState): { label: string; tone: "ok" | "warn" | "bad" | "idle" } {
  if (state.kind === "loading") return { label: "Checking...", tone: "idle" };
  if (state.kind === "unreachable") return { label: "Offline", tone: "bad" };
  if (state.status === "error") return { label: "Database unavailable", tone: "bad" };
  const rows = state.dataset?.rows;
  const label = typeof rows === "number" ? `${rows.toLocaleString("en-US")} rows` : "Connected";
  return { label, tone: state.status === "degraded" ? "warn" : "ok" };
}

const TONES = {
  ok: { badge: "text-green-400 border-green-500/30 bg-green-500/10", dot: "bg-green-400 animate-pulse" },
  warn: { badge: "text-amber-400 border-amber-500/30 bg-amber-500/10", dot: "bg-amber-400" },
  bad: { badge: "text-red-400 border-red-500/30 bg-red-500/10", dot: "bg-red-400" },
  idle: { badge: "text-muted-foreground border-border bg-transparent", dot: "bg-zinc-500" },
} as const;

export function useHealth(): HealthState {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        // 503 still carries a useful JSON body (status "error").
        const body = (await res.json()) as Health;
        setState({ kind: "ready", ...body });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ kind: "unreachable" });
      });
    return () => controller.abort();
  }, []);

  return state;
}

const linkButton =
  "flex items-center gap-1.5 rounded-lg border border-border bg-zinc-800 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-indigo-500/40 hover:text-foreground transition-all";

export default function Header() {
  const health = useHealth();
  const badge = statusBadge(health);
  const tone = TONES[badge.tone];
  const model = health.kind === "ready" ? health.model : undefined;
  const database = health.kind === "ready" ? health.dataset?.database : undefined;

  return (
    <header className="shrink-0 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 py-3 gap-3">
      <Link className="flex items-center gap-3 min-w-0" href="/">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30">
          <BarChart2 size={16} className="text-indigo-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-none truncate">Walmart AI Analyst</h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground hidden sm:block">
            Natural-language analysis of Walmart sales
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant="outline" className={`gap-1.5 text-xs font-normal ${tone.badge}`} role="status">
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          <span>{badge.label}</span>
        </Badge>

        {database ? (
          <>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database size={12} />
              <span>{database}</span>
            </div>
          </>
        ) : null}

        {model ? (
          <>
            <Separator orientation="vertical" className="h-4 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles size={12} />
              <span>{model}</span>
            </div>
          </>
        ) : null}

        <Separator orientation="vertical" className="h-4" />

        <div className="flex items-center gap-2">
          <Link href="/data" className={linkButton} title="Browse the data table">
            <Table2 size={12} />
            <span className="hidden sm:inline">View Data</span>
          </Link>
          <a
            href="/api/export"
            download="walmart_cleaned_data.csv"
            className={linkButton}
            title="Download the dataset as CSV"
          >
            <Download size={12} />
            <span className="hidden sm:inline">Export CSV</span>
          </a>
        </div>
      </div>
    </header>
  );
}
