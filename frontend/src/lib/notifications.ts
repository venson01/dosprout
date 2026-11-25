import { formatDateTime, formatTime } from "./task-helpers";
import type { Task } from "./types";

/** The "due soon" reminder comes this long before the due time: one day. */
export const DUE_REMINDER_MS = 24 * 60 * 60 * 1000;

// Only the most recent ones are shown in the bell's list.
const MAX_NOTIFICATIONS = 30;

export type NotificationKind = "starting-soon" | "start" | "due-soon" | "done";

export interface AppNotification {
  /** Unique per event. A new id means something new happened (used for pop-ups). */
  id: string;
  kind: NotificationKind;
  task: Task;
  /** When it happened, in milliseconds since 1970 (like Date.now()). */
  at: number;
  message: string;
}

/**
 * Works out the notifications from the tasks themselves, so nothing has to be
 * stored or scheduled on the server:
 * - "starting-soon": a reminder some minutes before the start (one per number in
 *                    reminderMinutes, e.g. [15, 10, 2]). Only listed until the task starts,
 *                    then the "start" notification takes over (so the list stays short).
 * - "start":    the task's start time has arrived
 * - "due-soon": it's one day before the due time
 * - "done":     the task was completed (completedAt)
 * Newest first.
 */
export function notificationsFromTasks(
  tasks: Task[],
  now: number,
  reminderMinutes: number[] = [],
): AppNotification[] {
  const list: AppNotification[] = [];

  for (const task of tasks) {
    const createdAt = Date.parse(task.createdAt);
    const completedAt = task.completedAt ? Date.parse(task.completedAt) : null;
    // A start or reminder only counts if it happened while the task existed
    // and wasn't finished yet (no reminders for a task created 5 minutes before it's due).
    const counts = (at: number) =>
      at >= createdAt && at <= now && (completedAt === null || at < completedAt);
    const add = (kind: NotificationKind, at: number, message: string) =>
      list.push({ id: `${kind}-${task.id}-${at}`, kind, task, at, message });

    if (task.startAt) {
      const startAt = Date.parse(task.startAt);
      if (now < startAt) {
        for (const minutes of reminderMinutes) {
          const at = startAt - minutes * 60_000;
          if (counts(at)) {
            add("starting-soon", at, `“${task.title}” starts in ${minutes} min (${formatTime(task.startAt)}).`);
          }
        }
      }
      if (counts(startAt)) add("start", startAt, `“${task.title}” has started.`);
    }
    if (task.dueAt) {
      const at = Date.parse(task.dueAt) - DUE_REMINDER_MS;
      if (counts(at)) {
        add("due-soon", at, `“${task.title}” is due tomorrow (${formatDateTime(task.dueAt)}).`);
      }
    }
    if (completedAt !== null) {
      add("done", completedAt, `“${task.title}” is done. Nice work!`);
    }
  }

  return list.sort((a, b) => b.at - a.at).slice(0, MAX_NOTIFICATIONS);
}

/** The moments when a new notification (or an overdue date) will appear, for useClock. */
export function upcomingMoments(tasks: Task[], reminderMinutes: number[] = []): number[] {
  return tasks.flatMap((task) => {
    const moments: number[] = [];
    if (task.startAt) {
      const startAt = Date.parse(task.startAt);
      moments.push(startAt, ...reminderMinutes.map((minutes) => startAt - minutes * 60_000));
    }
    if (task.dueAt) moments.push(Date.parse(task.dueAt), Date.parse(task.dueAt) - DUE_REMINDER_MS);
    return moments;
  });
}

/** Whether a notification is about a task that's about to start or has just started. */
export function isAboutStarting(notification: AppNotification): boolean {
  return notification.kind === "start" || notification.kind === "starting-soon";
}

/** 90 seconds ago -> "1 min ago", 3 hours ago -> "3 h ago". */
export function timeAgo(at: number, now: number): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
