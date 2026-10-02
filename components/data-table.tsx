"use client";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

type Props = {
  rows: Record<string, unknown>[];
  columns: string[];
  maxRows?: number;
};

export function DataTable({ rows, columns, maxRows = 10 }: Props) {
  const visible = rows.slice(0, maxRows);

  if (!visible.length) return null;

  return (
    <ScrollArea className="w-full rounded-lg border border-border">
      <div className="min-w-max">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap capitalize">
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                {columns.map((col) => {
                  const val = row[col];
                  const formatted =
                    typeof val === "number"
                      ? Number.isInteger(val) ? val.toLocaleString() : val.toFixed(2)
                      : val == null ? "—" : String(val);
                  return (
                    <td key={col} className="px-3 py-2 text-foreground/80 whitespace-nowrap">
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
