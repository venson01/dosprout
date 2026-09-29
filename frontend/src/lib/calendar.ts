import type { Task } from "./types";

// Date helpers for the Calendar page. Every "day" here is a day in the viewer's
// own timezone, starting at midnight, because that's how a calendar reads.

/** The day weeks start on: 0 = Sunday, 1 = Monday (the "week starts on" setting). */
export type WeekStart = 0 | 1;

/** "Mon", "Tue", ... in the order the calendar shows them. */
export function weekdayLabels(weekStartsOn: WeekStart): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    // Jan 3, 2021 was a Sunday; count on from there to the right weekday.
    new Date(2021, 0, 3 + weekStartsOn + i).toLocaleDateString("en-US", { weekday: "short" }),
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A day as "2026-09-30", used as a key and for the date inputs. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "2026-09-30" -> that day at local midnight. */
export function fromDayKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A new date `days` later (or earlier, if negative). Keeps the time of day, even across clock changes. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Whole days from `a` to `b` (both at midnight). Rounded, because some days have 23 or 25 hours. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** A month as "2026-09" (for the ?month= part of the address). */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** "2026-09" -> Sep 1, 2026. Anything else -> null. */
export function parseMonthKey(key: string | null): Date | null {
  const match = key?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? new Date(Number(match[1]), month - 1, 1) : null;
}

/** Moves a timestamp by whole days, keeping its time of day. null stays null. */
export function shiftTimestamp(timestamp: string | null, days: number): string | null {
  return timestamp === null ? null : addDays(new Date(timestamp), days).toISOString();
}

/** The weeks to show for a month: 4 to 6 rows of 7 days, padded with days of the months around it. */
export function monthWeeks(month: Date, weekStartsOn: WeekStart): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  let day = addDays(first, -((first.getDay() - weekStartsOn + 7) % 7));
  const weeks: Date[][] = [];
  do {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (day.getMonth() === first.getMonth());
  return weeks;
}

/**
 * The first and last day a task covers: from its start date to its due date.
 * A task with only one of the two covers just that day. No dates -> null.
 */
export function taskDays(task: Task): { start: Date; end: Date } | null {
  const start = task.startAt ?? task.dueAt;
  const end = task.dueAt ?? task.startAt;
  if (!start || !end) return null;
  return { start: startOfDay(new Date(start)), end: startOfDay(new Date(end)) };
}

/** The tasks that cover `day`: unfinished ones first, then by earliest start. */
export function tasksOnDay(tasks: Task[], day: Date): Task[] {
  const done = (task: Task) => (task.status === "done" ? 1 : 0);
  return tasks
    .filter((task) => {
      const days = taskDays(task);
      return days !== null && days.start <= day && day <= days.end;
    })
    .sort(
      (a, b) =>
        done(a) - done(b) ||
        (a.startAt ?? a.dueAt ?? "").localeCompare(b.startAt ?? b.dueAt ?? ""),
    );
}

/** One task's bar inside one week row. */
export interface WeekBar {
  task: Task;
  /** Columns the bar covers in this week, 0 (first day) to 6 (last day). */
  from: number;
  to: number;
  /** Row inside the week, so that bars never overlap (0 = top). */
  lane: number;
  /** The task began before this week / goes on after it (the bar continues). */
  startsBefore: boolean;
  endsAfter: boolean;
}

/** Works out the bars for one week, stacking overlapping tasks into separate rows. */
export function weekBars(week: Date[], tasks: Task[]): WeekBar[] {
  const weekStart = week[0];
  const weekEnd = week[6];
  const bars: WeekBar[] = [];

  for (const task of tasks) {
    const days = taskDays(task);
    if (!days || days.end < weekStart || days.start > weekEnd) continue;
    bars.push({
      task,
      from: Math.max(0, daysBetween(weekStart, days.start)),
      to: Math.min(6, daysBetween(weekStart, days.end)),
      lane: 0,
      startsBefore: days.start < weekStart,
      endsAfter: days.end > weekEnd,
    });
  }

  // Only a few rows fit in a day box (the rest show as "+2 more"), so unfinished
  // tasks get the top rows, then the ones that start first, then the ones due soonest.
  const done = (bar: WeekBar) => (bar.task.status === "done" ? 1 : 0);
  bars.sort((a, b) => done(a) - done(b) || a.from - b.from || a.to - b.to || a.task.id - b.task.id);
  // Put each bar in the first row that's free by its first day.
  const rowEnds: number[] = [];
  for (const bar of bars) {
    let lane = rowEnds.findIndex((end) => end < bar.from);
    if (lane === -1) lane = rowEnds.length;
    rowEnds[lane] = bar.to;
    bar.lane = lane;
  }
  return bars;
}
