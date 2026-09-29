"use client";

import { Clock } from "lucide-react";
import { useTaskList } from "@/hooks/tasks-context";
import { useTicker } from "@/hooks/use-ticker";
import { overEstimate, trackedByTask, trackedLabel } from "@/lib/time";
import type { Task } from "@/lib/types";

/**
 * A task's tracked time, e.g. "1h 20m" or "1h 20m / 3h" when it has an estimate
 * (red once it's over). A blinking dot means a timer is running on it right now.
 * Shows nothing if the task has no tracked time and no estimate.
 */
export function TimeBadge({ task }: { task: Task }) {
  const { timeEntries, timer } = useTaskList();
  const isRunning = timer.running?.taskId === task.id;
  // Only the running task's badge needs to tick.
  const now = useTicker(isRunning);
  const tracked = trackedByTask(timeEntries, now).get(task.id) ?? 0;
  if (tracked === 0 && !task.estimateMinutes && !isRunning) return null;
  const over = overEstimate(task, tracked);

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${over ? "font-medium text-high" : "text-muted"}`}>
      {isRunning ? (
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-high motion-reduce:animate-none" />
      ) : (
        <Clock aria-hidden className="size-3" />
      )}
      <span className="sr-only">{isRunning ? "Timer running, time tracked: " : "Time tracked: "}</span>
      {trackedLabel(task, tracked)}
      {over && <span className="sr-only"> (over the estimate)</span>}
    </span>
  );
}
