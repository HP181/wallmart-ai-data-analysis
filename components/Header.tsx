import { BarChart2, Database, Download, Sparkles, Table2 } from 'lucide-react'
import React from 'react'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'
import Link from 'next/link'

const Header = () => {
  return (
     <header className="shrink-0 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 py-3 gap-3">
        <Link className="flex items-center gap-3 min-w-0" href="/">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30">
            <BarChart2 size={16} className="text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-none truncate">Walmart AI Analyst</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground hidden sm:block">
              Powered by GPT-4o + Neon PostgreSQL
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="gap-1.5 text-xs font-normal text-green-400 border-green-500/30 bg-green-500/10">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span>9,969 rows</span>
          </Badge>

          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Database size={12} /><span>neondb</span>
          </div>

          <Separator orientation="vertical" className="h-4 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles size={12} /><span>GPT-4o</span>
          </div>

          <Separator orientation="vertical" className="h-4" />
          {/* <HeaderActions /> */}

          



          <div className="flex items-center gap-2">
        {/* View in grid */}
        <Link
          // onClick={() => setViewerOpen(true)}
          href="/data"
          className="flex items-center gap-1.5 rounded-lg border border-border bg-zinc-800 px-2.5 py-1.5 text-xs text-muted-foreground hover:border-indigo-500/40 hover:text-foreground transition-all"
          title="Open data in spreadsheet viewer"
        >
          <Table2 size={12} />
          <span className="hidden sm:inline">View Data</span>
        </Link>
       
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
        </div>
      </header>
  )
}

export default Header