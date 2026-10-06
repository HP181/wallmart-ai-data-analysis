import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WalmartDataTable } from "./walmart-data-table";

export const metadata = { title: "Walmart Dataset" };

// The page itself is static: the table pages through /api/data on the client,
// so the server never loads the dataset into memory.
export default function DataPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <div className="border-b border-zinc-800 bg-zinc-950 px-6 py-3 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Chat
        </Link>
        <div className="w-px h-4 bg-zinc-800" />
        <div>
          <h1 className="text-sm font-semibold text-zinc-100 leading-none">Walmart Dataset</h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Search, sort, filter and export transactions</p>
        </div>
      </div>
      <div className="px-6 py-6">
        <WalmartDataTable />
      </div>
    </div>
  );
}
