import { ChatInterface } from "@/components/chat-interface";
import { HeaderActions } from "@/components/header-actions";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart2, Database, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col overflow-hidden">
      <header className="shrink-0 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur px-4 sm:px-6 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600/20 border border-indigo-500/30">
            <BarChart2 size={16} className="text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-none truncate">Walmart AI Analyst</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground hidden sm:block">
              Powered by GPT-4o + Neon PostgreSQL
            </p>
          </div>
        </div>

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
          <HeaderActions />
        </div>
      </header>

      <main className="flex-1 min-h-0">
        <ChatInterface />
      </main>
    </div>
  );
}
