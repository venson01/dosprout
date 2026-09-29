import { dayKey, type WeekStart } from "./calendar";
import { sumPer, type Period } from "./periods";
import type { Task, TimeEntry } from "./types";

// Helpers for tracked time (time entries). Durations are in milliseconds.

// Focus (Pomodoro) and break lengths are settings: settings.focusMinutes / breakMinutes.
export const MINUTE_MS = 60_000;

/** The timer that's running right now (there's at most one), or undefined. */
export function runningEntry(entries: TimeEntry[]): TimeEntry | undefined {
  return entries.find((entry) => entry.endedAt === null);
}

/** How long an entry lasted. A running one counts up to `now`. */
export function entryDuration(entry: TimeEntry, now: number): number {
  const end = entry.endedAt ? Date.parse(entry.endedAt) : now;
  return Math.max(0, end - Date.parse(entry.startedAt));
}

/** 5,400,000 -> "1h 30m", 900,000 -> "15m", 20,000 -> "0m". */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `${minutes}m`;
  return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
}

/** A running clock: 3,725,000 -> "1:02:05", 125,000 -> "2:05". */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** Total tracked time per task id (all time). */
export function trackedByTask(entries: TimeEntry[], now: number): Map<number, number> {
  const totals = new Map<number, number>();
  for (const entry of entries) {
    if (entry.taskId === null) continue;
    totals.set(entry.taskId, (totals.get(entry.taskId) ?? 0) + entryDuration(entry, now));
  }
  return totals;
}

/**
 * Tracked time per day / week / month, in milliseconds (for the Time page's chart).
 * An entry counts on the day it started, even if it ran past midnight.
 */
export function trackedPer(entries: TimeEntry[], now: number, period: Period, weekStartsOn: WeekStart) {
  return sumPer(
    entries.map((entry) => ({ at: Date.parse(entry.startedAt), value: entryDuration(entry, now) })),
    now,
    period,
    weekStartsOn,
  );
}

/** Entries grouped by the local day they started, newest day first (entries stay newest first). */
export function entriesByDay(entries: TimeEntry[]): { day: string; entries: TimeEntry[] }[] {
  const groups = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const key = dayKey(new Date(entry.startedAt));
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([day, list]) => ({ day, entries: list }));
}

/** "1h 20m", or "1h 20m / 3h" when the task has an estimate. */
export function trackedLabel(task: Task, tracked: number): string {
  const spent = formatDuration(tracked);
  return task.estimateMinutes ? `${spent} / ${formatDuration(task.estimateMinutes * MINUTE_MS)}` : spent;
}

/** True when more time was tracked than the task's estimate. */
export function overEstimate(task: Task, tracked: number): boolean {
  return task.estimateMinutes !== null && tracked > task.estimateMinutes * MINUTE_MS;
}
