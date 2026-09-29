import { addDays, startOfDay } from "./calendar";
import { sumPer, type Period } from "./periods";
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

/**
 * How many tasks were completed in each of the last few days, weeks or months
 * (see PERIODS in lib/periods.ts), oldest first.
 */
export function completedPer(tasks: Task[], now: number, period: Period) {
  const completed = tasks.filter((task) => task.status === "done" && task.completedAt);
  return sumPer(
    completed.map((task) => ({ at: Date.parse(task.completedAt!), value: 1 })),
    now,
    period,
  );
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
