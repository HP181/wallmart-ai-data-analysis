"use client";

import type { EveMessage, EveDynamicToolPart } from "eve/react";
import { ChartPanel } from "@/components/chart-panel";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Bot, User, AlertCircle, Database, ChevronDown, ChevronUp } from "lucide-react";
import { useState, Fragment } from "react";

type ToolResult = {
  success: boolean;
  sql: string;
  chartConfig: { type: "bar" | "line" | "pie" | "scatter" | "histogram" | "table"; xKey: string; yKey: string; title: string };
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  error?: string;
};

export function MessageItem({ message }: { message: EveMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3 py-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        isUser
          ? "bg-indigo-600 text-white"
          : "bg-zinc-800 border border-border text-muted-foreground"
      )}>
        {isUser ? <User size={13} /> : <Bot size={13} />}
      </div>

      {/*
        User:      max-w-[85%] so long text doesn't go full width
        Assistant: w-full so charts always have a stable, pre-determined width
                   (prevents ResponsiveContainer from measuring 0 → full-width)
      */}
      <div className={cn(
        "min-w-0 space-y-2",
        isUser ? "max-w-[85%]" : "flex-1"
      )}>
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  isUser
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-zinc-900 border border-border text-foreground rounded-tl-sm"
                )}
              >
                <MarkdownText text={part.text} />
              </div>
            );
          }

          if (part.type === "dynamic-tool") {
            const toolPart = part as EveDynamicToolPart;
            if (toolPart.toolName !== "analyzeData") return null;
            return <ToolPart key={i} part={toolPart} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}

function ToolPart({ part }: { part: EveDynamicToolPart }) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
        <Database size={12} className="animate-pulse text-indigo-400" />
        <span>Running query…</span>
      </div>
    );
  }

  if (part.state === "output-available") {
    const result = part.output as ToolResult;
    return <AnalysisResult result={result} />;
  }

  if (part.state === "output-error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span>{part.errorText}</span>
      </div>
    );
  }

  return null;
}

function AnalysisResult({ result }: { result: ToolResult }) {
  const [showSQL, setShowSQL] = useState(false);
  const [showTable, setShowTable] = useState(false);

  if (!result.success && result.error) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertCircle size={14} className="mt-0.5 shrink-0" />
        <span>{result.error}</span>
      </div>
    );
  }

  const hasChart = result.chartConfig.type !== "table" && result.rows.length > 0;

  return (
    <div className="w-full space-y-3 rounded-2xl border border-border bg-zinc-900/60 p-3 sm:p-4 rounded-tl-sm">
      {/* Chart — rendered before text so container width is established by CSS, not content */}
      {hasChart && (
        <ChartPanel rows={result.rows} chartConfig={result.chartConfig} />
      )}

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-xs font-normal">
          {result.rowCount} row{result.rowCount !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="outline" className="text-xs font-normal capitalize">
          {result.chartConfig.type}
        </Badge>
      </div>

      <Separator className="opacity-50" />

      {/* Expandable: Data Table */}
      <button
        onClick={() => setShowTable(!showTable)}
        className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Database size={11} />
          View data ({Math.min(result.rowCount, result.rows.length)} rows)
        </span>
        {showTable ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {showTable && <DataTable rows={result.rows} columns={result.columns} />}

      {/* Expandable: SQL */}
      <button
        onClick={() => setShowSQL(!showSQL)}
        className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>View SQL</span>
        {showSQL ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {showSQL && (
        <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-indigo-300 border border-border/50 font-mono leading-relaxed scrollbar-hide">
          {result.sql}
        </pre>
      )}
    </div>
  );
}

// ── Simple inline markdown renderer ─────────────────────────────────────────
// Handles: **bold**, *italic*, numbered lists (1. 2. …), bullet lists (- …),
// and blank-line paragraph breaks. No external dependencies.

function parseInline(text: string): React.ReactNode[] {
  // Split on **bold** and *italic* markers
  const parts = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("*") && p.endsWith("*")) {
      return <em key={i}>{p.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: "ol" | "ul" | null = null;

  function flushList() {
    if (!listItems.length) return;
    if (listType === "ol") {
      nodes.push(<ol key={nodes.length} className="list-decimal list-inside space-y-0.5 my-1">{listItems}</ol>);
    } else {
      nodes.push(<ul key={nodes.length} className="list-disc list-inside space-y-0.5 my-1">{listItems}</ul>);
    }
    listItems = [];
    listType = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Numbered list: "1. text"
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (olMatch) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listItems.push(<li key={i}>{parseInline(olMatch[2])}</li>);
      continue;
    }

    // Bullet list: "- text" or "• text"
    const ulMatch = line.match(/^[-•]\s+(.*)/);
    if (ulMatch) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listItems.push(<li key={i}>{parseInline(ulMatch[1])}</li>);
      continue;
    }

    flushList();

    // Empty line → paragraph break
    if (line.trim() === "") {
      nodes.push(<br key={i} />);
      continue;
    }

    // ### heading
    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      nodes.push(<p key={i} className="font-semibold mt-2 mb-0.5">{parseInline(h3[1])}</p>);
      continue;
    }

    nodes.push(<p key={i} className="leading-relaxed">{parseInline(line)}</p>);
  }

  flushList();
  return <>{nodes}</>;
}
