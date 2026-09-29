"use client";

import { CircleAlert, X } from "lucide-react";
import { useEffect } from "react";

// Loading, error and "something went wrong" pieces shared by the Tasks and Calendar pages.

/** Error message at the bottom of the screen. It hides itself after a few seconds. */
export function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-inverse px-4 py-3 text-sm text-white shadow-xl"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-high" />
      <p className="flex-1">{message}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">
        <X className="size-4 text-white/70 hover:text-white" />
      </button>
    </div>
  );
}

export function LoadingSkeleton({ label = "Loading tasks" }: { label?: string }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-line bg-surface p-5">
          <div className="h-4 w-28 rounded bg-line" />
          <div className="mt-5 space-y-3">
            <div className="h-3 w-3/4 rounded bg-page" />
            <div className="h-3 w-1/2 rounded bg-page" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6 text-center sm:p-10">
      <CircleAlert className="mx-auto size-10 text-high" />
      <h2 className="mt-3 text-lg font-semibold">Couldn&apos;t load your tasks</h2>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <p className="mt-4 text-sm text-muted">
        On your computer: run{" "}
        <code className="rounded bg-page px-1.5 py-0.5 text-ink">npm run dev</code> in the project
        folder (it starts the backend at http://localhost:4000). On Vercel: open the project&apos;s{" "}
        <strong className="font-medium text-ink">Logs</strong> tab to see why the backend failed.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Try again
      </button>
    </div>
  );
}
