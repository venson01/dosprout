"use client";

import { Coffee, Square, X } from "lucide-react";
import Link from "next/link";
import { useTaskList } from "@/hooks/tasks-context";
import { useTicker } from "@/hooks/use-ticker";
import { formatClock, MINUTE_MS } from "@/lib/time";

/**
 * The running timer in the top bar, on every page: the time (counting up, or down for
 * a focus session), the task, and a Stop button. During a focus break it shows the
 * break's countdown. Hidden when nothing is running.
 */
export function TimerPill() {
  const { tasks, timer, settings } = useTaskList();
  const { running, breakEndsAt, stop, skipBreak } = timer;
  // Tick every second only while there's something to count.
  const now = useTicker(Boolean(running) || breakEndsAt !== null);

  if (running) {
    const task = tasks.find((t) => t.id === running.taskId);
    const started = Date.parse(running.startedAt);
    const focus = running.kind === "focus";
    const clock = focus ? formatClock(started + settings.focusMinutes * MINUTE_MS - now) : formatClock(now - started);
    return (
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft py-1 pl-3 pr-1 text-sm text-brand">
        <Link
          href="/time"
          className="flex min-w-0 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-label={`${focus ? "Focus session" : "Timer"} running${task ? ` on "${task.title}"` : ""}: ${clock}${focus ? " left" : ""}. Open the Time page`}
        >
          {/* A slowly blinking dot shows that time is being tracked. */}
          <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-high motion-reduce:animate-none" />
          <span className="font-semibold tabular-nums">{clock}</span>
          {focus && <span className="hidden sm:inline">left</span>}
          {task && <span className="hidden max-w-40 truncate text-ink md:inline">{task.title}</span>}
        </Link>
        <button
          type="button"
          onClick={() => stop().catch(() => {})}
          aria-label="Stop timer"
          className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-surface"
        >
          <Square className="size-3.5 fill-current" />
        </button>
      </div>
    );
  }

  if (breakEndsAt !== null) {
    return (
      <div className="flex items-center gap-1 rounded-full bg-low-bg py-1 pl-3 pr-1 text-sm text-low">
        <Link href="/time" className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <Coffee aria-hidden className="size-4" />
          <span className="hidden sm:inline">Break</span>
          <span className="font-semibold tabular-nums">{formatClock(breakEndsAt - now)}</span>
        </Link>
        <button
          type="button"
          onClick={skipBreak}
          aria-label="Skip the break"
          className="grid size-7 place-items-center rounded-full hover:bg-surface"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return null;
}
