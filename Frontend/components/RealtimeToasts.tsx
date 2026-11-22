"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

/**
 * Batch 13 — minimal toast stack (no toast system existed before).
 * Rendered once by RealtimeProvider, bottom-right, above page content.
 * Each toast auto-dismisses after ~3 seconds, can be dismissed by hand,
 * and clicking it opens the event's link page. One event = one toast max
 * (dedupe lives in the provider).
 */
export interface ToastItem {
  id: string;
  title: string;
  message: string;
  link: string;
}

export function RealtimeToasts({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const router = useRouter();
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3"
        >
          <button
            type="button"
            onClick={() => {
              onDismiss(t.id);
              if (t.link) router.push(t.link);
            }}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{t.title}</p>
            {t.message && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                {t.message}
              </p>
            )}
          </button>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
