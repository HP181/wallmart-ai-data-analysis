export const dynamic = "force-dynamic";

import { getWalmartData } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { WalmartDataTable, type WalmartRow } from "./walmart-data-table";

export default async function DataPage() {
  const data = (await getWalmartData()) as WalmartRow[];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">

      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-sm px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Chat
          </Link>
          <div className="w-px h-4 bg-zinc-800" />
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 leading-none">
              Walmart Dataset
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {data.length.toLocaleString()} rows · 21 columns · Neon PostgreSQL
            </p>
          </div>
        </div>

        <a
          href="/api/export"
          download="walmart_cleaned_data.csv"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 no-underline hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </div>

      {/* Table */}
      <div className="px-6 py-6">
        <WalmartDataTable data={data} />
      </div>
    </div>
  );
}
