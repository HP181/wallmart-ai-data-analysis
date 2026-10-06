"use client";

import { useEveAgent } from "eve/react";
import { MessageItem } from "@/components/message-item";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { Send, Square, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "Which product category has the highest total revenue?",
  "Show payment method breakdown by branch",
  "What are the peak sales hours across all stores?",
  "Compare profit margins by category",
  "Which city has the best average customer rating?",
  "Show revenue trends by month",
];

export function ChatInterface() {
  const agent = useEveAgent();
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isLoading = agent.status === "submitted" || agent.status === "streaming";
  const messageCount = agent.data.messages.length;

  // Scroll when a new message is added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messageCount]);

  // Slow smooth scroll when streaming finishes
  useEffect(() => {
    if (!isLoading) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
  }, [isLoading]);

  function handleSend(text?: string) {
    const q = (text ?? input).trim();
    if (!q || isLoading) return;
    void agent.send(q);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    /* h-full comes from main, flex-col stacks messages + input */
    <div className="flex h-full flex-col">

      {/* ── Messages scroll area ─────────────────────────────── */}
      <div
        className="flex-1 min-h-0 overflow-y-auto scroll-smooth scrollbar-hide px-3 sm:px-4"
      >
        {agent.data.messages.length === 0 ? (
          <EmptyState onSelect={handleSend} />
        ) : (
          <div className="mx-auto max-w-3xl py-4 space-y-1">
            {agent.data.messages.map((m) => (
              <MessageItem key={m.id} message={m} />
            ))}
            {isLoading &&
              agent.data.messages[agent.data.messages.length - 1]?.role === "user" && (
                <ThinkingIndicator />
              )}
            <div ref={bottomRef} className="h-2" />
          </div>
        )}
      </div>

      {/* ── Input bar — always pinned at bottom ─────────────── */}
      <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur px-3 sm:px-4 py-3 sm:py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-zinc-900 px-3 sm:px-4 py-2.5 sm:py-3 focus-within:border-indigo-500/60 transition-colors">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about Walmart sales data…"
              className="min-h-[22px] max-h-36 flex-1 resize-none border-0 bg-transparent p-2 text-sm sm:text-base placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
            <Button
              size="icon"
              onClick={isLoading ? () => void agent.cancel() : () => handleSend()}
              disabled={!isLoading && !input.trim()}
              className={cn(
                "h-8 w-8 shrink-0 rounded-xl transition-all",
                isLoading
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
              )}
            >
              {isLoading ? <Square size={14} /> : <Send size={14} />}
            </Button>
          </div>
          <p className="mt-1.5 text-center text-[11px] text-muted-foreground/40">
            AI may make mistakes. Verify important business decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-16 px-4">
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 border border-indigo-500/30">
        <Sparkles size={24} className="text-indigo-400" />
      </div>
      <h2 className="mb-2 text-lg sm:text-xl font-semibold tracking-tight text-center">
        Walmart AI Analyst
      </h2>
      <p className="mb-8 text-sm text-muted-foreground text-center max-w-sm sm:max-w-md sm:text-base">
        Ask any question about sales, revenue, branches, customer ratings, or trends.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSelect(q)}
            className="rounded-xl border border-border bg-zinc-900 px-4 py-3 text-left text-sm text-muted-foreground hover:border-indigo-500/40 hover:bg-zinc-800 hover:text-foreground transition-all"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-border">
        <Sparkles size={12} className="text-indigo-400 animate-pulse" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-zinc-900 px-4 py-3">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}
