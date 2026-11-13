import { addDays, dayKey, startOfDay } from "./calendar";
import type { Goal, MyWorkGroup, Priority, Task, TeamSummary } from "./types";

// Helpers for the "My work" page. They take `now` as an argument (like lib/dashboard.ts),
// so the page stays pure and they're easy to reason about.

/** One task on the page, with the team it lives in and its goal (if any). */
export interface MyWorkItem {
  task: Task;
  team: TeamSummary;
  goal: Goal | undefined;
}

/** When an unfinished task is due, in the groups the page shows. */
export type DueGroup = "overdue" | "today" | "week" | "later" | "none";

/** The groups in the order they're shown, with their headings. */
export const DUE_GROUPS: { key: DueGroup; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "week", label: "Due in the next 7 days" },
  { key: "later", label: "Due later" },
  { key: "none", label: "No due date" },
];

/** Which group a task belongs in. Days are in the viewer's timezone. */
export function dueGroup(task: Task, now: number): DueGroup {
  if (!task.dueAt) return "none";
  const due = new Date(task.dueAt);
  if (due.getTime() < now) return "overdue";
  const today = startOfDay(new Date(now));
  if (dayKey(due) === dayKey(today)) return "today";
  // Before midnight at the end of the 7th day after today.
  if (due < addDays(today, 8)) return "week";
  return "later";
}

/** Every task from every team in one list, each with its team and goal. */
export function myWorkItems(groups: MyWorkGroup[]): MyWorkItem[] {
  return groups.flatMap(({ team, tasks, goals }) =>
    tasks.map((task) => ({ task, team, goal: goals.find((goal) => goal.id === task.goalId) })),
  );
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/** Soonest due first; then high priority first; then by title. */
function byDueThenPriority(a: MyWorkItem, b: MyWorkItem): number {
  return (
    (a.task.dueAt ?? "9999").localeCompare(b.task.dueAt ?? "9999") ||
    PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority] ||
    a.task.title.localeCompare(b.task.title)
  );
}

/** The unfinished tasks, sorted into the due groups (each sorted soonest first). */
export function groupByDue(items: MyWorkItem[], now: number): Record<DueGroup, MyWorkItem[]> {
  const result: Record<DueGroup, MyWorkItem[]> = { overdue: [], today: [], week: [], later: [], none: [] };
  for (const item of items) {
    if (item.task.status !== "done") result[dueGroup(item.task, now)].push(item);
  }
  for (const list of Object.values(result)) list.sort(byDueThenPriority);
  return result;
}

/** Tasks finished in the last 7 days, most recent first. */
export function recentlyDone(items: MyWorkItem[], now: number): MyWorkItem[] {
  const since = addDays(new Date(now), -7).toISOString();
  return items
    .filter((item) => item.task.status === "done" && (item.task.completedAt ?? "") >= since)
    .sort((a, b) => (b.task.completedAt ?? "").localeCompare(a.task.completedAt ?? ""));
}
