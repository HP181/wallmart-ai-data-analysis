"use client";

import { useState } from "react";
import { Download, Table2 } from "lucide-react";
import dynamic from "next/dynamic";

// Load DataViewer only when opened (it imports AG Grid which is large)
const DataViewer = dynamic(
  () => import("@/components/data-viewer").then((m) => m.DataViewer),
  { ssr: false }
);

export function HeaderActions() {
  const [viewerOpen, setViewerOpen] = useState(false);

  return (
    <>
      {/* Buttons */}
      <div className="flex items-center gap-2">
        {/* View in grid */}
        <button
          onClick={() => setViewerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-zinc-800 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-indigo-500/40 hover:text-foreground transition-all"
          title="Open data in spreadsheet viewer"
        >
          <Table2 size={12} />
          <span className="hidden sm:inline">View Data</span>
        </button>

        {/* Download CSV */}
        <a
          href="/api/export"
          download="walmart_cleaned_data.csv"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-zinc-800 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-indigo-500/40 hover:text-foreground transition-all"
          title="Download cleaned dataset as CSV"
        >
          <Download size={12} />
          <span className="hidden sm:inline">Export CSV</span>
        </a>
      </div>

      {/* Modal — mounted lazily */}
      {viewerOpen && <DataViewer onClose={() => setViewerOpen(false)} />}
    </>
  );
}
