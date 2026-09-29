import { addDays, dayKey, startOfDay, WEEK_STARTS_ON } from "./calendar";
import type { Priority, Task } from "./types";

// Numbers for the Dashboard page. They take `now` (milliseconds) as an argument
// instead of reading the clock, so the page can pass the shared clock from useTaskList().

const isOpen = (task: Task) => task.status !== "done";
const byDue = (a: Task, b: Task) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "");

export interface Summary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  /** Share of tasks that are done, 0 to 100 (0 when there are no tasks). */
  percentDone: number;
}

export function summarize(tasks: Task[], now: number): Summary {
  const done = tasks.filter((task) => task.status === "done").length;
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.status === "todo").length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    done,
    overdue: tasks.filter((task) => isOpen(task) && task.dueAt && Date.parse(task.dueAt) < now).length,
    percentDone: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

/** Unfinished tasks that need attention soon, each list ordered by due time. */
export function needsAttention(tasks: Task[], now: number) {
  const endOfToday = addDays(startOfDay(new Date(now)), 1).getTime();
  const endOfWeek = addDays(new Date(endOfToday), 7).getTime();
  const open = tasks.filter((task) => isOpen(task) && task.dueAt).sort(byDue);
  const due = (task: Task) => Date.parse(task.dueAt!);
  return {
    overdue: open.filter((task) => due(task) < now),
    today: open.filter((task) => due(task) >= now && due(task) < endOfToday),
    /** Due after today, within the next 7 days. */
    thisWeek: open.filter((task) => due(task) >= endOfToday && due(task) < endOfWeek),
  };
}

/** How the "Completed" chart groups tasks: per day, per week or per month. */
export type Period = "day" | "week" | "month";

/** How many columns each period shows, and how that span is described. */
export const PERIODS: Record<Period, { label: string; columns: number; span: string }> = {
  day: { label: "Day", columns: 14, span: "14 days" },
  week: { label: "Week", columns: 12, span: "12 weeks" },
  month: { label: "Month", columns: 12, span: "12 months" },
};

/** The first day of the day / week / month that `date` falls in (weeks start on WEEK_STARTS_ON). */
export function periodStart(date: Date, period: Period): Date {
  const day = startOfDay(date);
  if (period === "day") return day;
  if (period === "week") return addDays(day, -((day.getDay() - WEEK_STARTS_ON + 7) % 7));
  return new Date(day.getFullYear(), day.getMonth(), 1);
}

/** The start of the period `count` periods before `start`. */
function periodsBefore(start: Date, period: Period, count: number): Date {
  if (period === "day") return addDays(start, -count);
  if (period === "week") return addDays(start, -7 * count);
  return new Date(start.getFullYear(), start.getMonth() - count, 1);
}

/**
 * How many tasks were completed in each of the last few days, weeks or months
 * (see PERIODS), oldest first. The last column is the current day / week / month.
 */
export function completedPer(tasks: Task[], now: number, period: Period) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "done" || !task.completedAt) continue;
    const key = dayKey(periodStart(new Date(task.completedAt), period));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const current = periodStart(new Date(now), period);
  const columns = PERIODS[period].columns;
  return Array.from({ length: columns }, (_, i) => {
    const start = periodsBefore(current, period, columns - 1 - i);
    return { start, count: counts.get(dayKey(start)) ?? 0 };
  });
}

/** Unfinished tasks per priority, highest priority first. */
export function openByPriority(tasks: Task[]): { priority: Priority; count: number }[] {
  const open = tasks.filter(isOpen);
  return (["high", "mid", "low"] as const).map((priority) => ({
    priority,
    count: open.filter((task) => task.priority === priority).length,
  }));
}

/**
 * Unfinished tasks per tag, biggest first. Shows the top 5 tags and adds the rest
 * together as "Other", so the list stays short. Tasks without a tag count as "No tag".
 */
export function openByTag(tasks: Task[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const task of tasks.filter(isOpen)) {
    const tag = task.tag || "No tag";
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const sorted = [...counts].map(([tag, count]) => ({ tag, count }));
  sorted.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  if (sorted.length <= 6) return sorted;
  const other = sorted.slice(5).reduce((sum, row) => sum + row.count, 0);
  return [...sorted.slice(0, 5), { tag: "Other", count: other }];
}
