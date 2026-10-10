"use client";

/**
 * Minimal module-level toast system.
 *
 * Call `toast(message)` from anywhere — no context or prop-drilling needed.
 * Drop `<Toaster />` once in the layout and it renders all active toasts into
 * a fixed portal at the bottom-right of the viewport.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle, X } from "lucide-react";

// ── Module-level store ────────────────────────────────────────────────────────

type ToastType = "error" | "success";

type ToastItem = {
  id: number;
  message: string;
  type: ToastType;
};

type Listener = (items: ToastItem[]) => void;

let nextId = 0;
let items: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  const snapshot = [...items];
  for (const l of listeners) l(snapshot);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * Show a toast notification.
 *
 * @param message Text shown to the user.
 * @param type    `"error"` (default) or `"success"`.
 * @param durationMs Auto-dismiss after this many ms (default 5 000).
 */
export function toast(message: string, type: ToastType = "error", durationMs = 5_000) {
  const id = ++nextId;
  items = [...items, { id, message, type }];
  emit();
  setTimeout(() => dismiss(id), durationMs);
}

// ── Toaster component ─────────────────────────────────────────────────────────

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="alert"
          className={[
            "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg pointer-events-auto",
            "animate-in slide-in-from-bottom-2 fade-in duration-200",
            t.type === "error"
              ? "border-red-500/30 bg-zinc-900 text-red-300"
              : "border-green-500/30 bg-zinc-900 text-green-300",
          ].join(" ")}
        >
          {t.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
          ) : (
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5 text-green-400" />
          )}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
