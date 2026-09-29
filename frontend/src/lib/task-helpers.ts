import type { Priority, Status, Task } from "./types";

export const STATUS_LABELS: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  mid: "Mid",
  high: "High",
};

export const TAG_SUGGESTIONS = ["Work", "Health", "Personal", "Study", "Home"];

export type SortMode = "manual" | "startAt" | "dueAt" | "priority";

export const SORT_LABELS: Record<SortMode, string> = {
  manual: "Default order",
  startAt: "Start date",
  dueAt: "Due date",
  priority: "Priority",
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

export function sortTasks(tasks: Task[], mode: SortMode): Task[] {
  const sorted = [...tasks];
  if (mode === "startAt" || mode === "dueAt") {
    // Timestamps are all in the same UTC format, so they sort correctly as text.
    // Tasks without the date go last.
    sorted.sort((a, b) => (a[mode] ?? "9999").localeCompare(b[mode] ?? "9999"));
  } else if (mode === "priority") {
    sorted.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  } else {
    sorted.sort((a, b) => a.position - b.position || a.id - b.id);
  }
  return sorted;
}

export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [task.title, task.description, task.tag, ...task.subtasks.map((s) => s.title)].some(
    (text) => text.toLowerCase().includes(q),
  );
}

/** "2026-11-17T16:00:00.000Z" -> "Nov 17, 5:00 PM" in the viewer's timezone (adds the year if it isn't this year). */
export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Splits a UTC timestamp into local values for <input type="date"> and <input type="time">. */
export function toDateAndTime(timestamp: string | null): { date: string; time: string } {
  if (!timestamp) return { date: "", time: "" };
  const d = new Date(timestamp);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** Joins local date ("2026-11-17") and time ("17:00") inputs into a UTC timestamp, or null if no date. */
export function fromDateAndTime(date: string, time: string): string | null {
  if (!date) return null;
  // Without a "Z" or offset, JavaScript reads this as local time.
  return new Date(`${date}T${time || "00:00"}`).toISOString();
}

/**
 * Works out a task's status from its subtasks. Same rule as the backend
 * (statusFromSubtasks in backend/src/task-store.ts), keep them the same:
 * all done -> "done", some done -> "in_progress",
 * none done -> "todo" if it was "done", otherwise unchanged.
 */
export function statusFromSubtasks(status: Status, subtasks: { done: boolean }[]): Status {
  if (subtasks.length === 0) return status;
  const finished = subtasks.filter((s) => s.done).length;
  if (finished === subtasks.length) return "done";
  if (finished > 0) return "in_progress";
  return status === "done" ? "todo" : status;
}

/**
 * A task can't be "done" while some of its subtasks aren't. The backend has the
 * same rule (hasUnfinishedSubtasks in backend/src/task-store.ts) and refuses it too.
 */
export function hasUnfinishedSubtasks(task: { subtasks: { done: boolean }[] }): boolean {
  return task.subtasks.some((subtask) => !subtask.done);
}

/** The message shown when someone tries to mark such a task as done. */
export function finishSubtasksFirst(task: Pick<Task, "title" | "subtasks">): string {
  const finished = task.subtasks.filter((subtask) => subtask.done).length;
  return `Tick off all subtasks of "${task.title}" first (${finished} of ${task.subtasks.length} done).`;
}

export function isOverdue(task: Task): boolean {
  return task.status !== "done" && task.dueAt !== null && new Date(task.dueAt) < new Date();
}
