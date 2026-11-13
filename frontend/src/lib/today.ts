import { addDays, dayKey, fromDayKey, startOfDay } from "./calendar";
import { realisticMinutes, type EstimateAccuracy } from "./estimates";
import type { MyWorkItem } from "./my-work";
import type { PlanEntry, Priority, Task } from "./types";

// Helpers for the Today page ("Plan my day"). Like lib/my-work.ts they take `now`, so the
// page stays pure. Days are "2026-11-13" keys in the viewer's own timezone (dayKey).

export function todayKey(now: number): string {
  return dayKey(new Date(now));
}

export function tomorrowKey(now: number): string {
  return dayKey(addDays(startOfDay(new Date(now)), 1));
}

/** "2026-11-16" -> "Mon 16 Nov" (in the viewer's language). */
export function formatDay(key: string): string {
  return fromDayKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/** taskId -> the day it's planned for. */
export function plannedDays(entries: PlanEntry[]): Map<number, string> {
  return new Map(entries.map((entry) => [entry.taskId, entry.day]));
}

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

/** Unfinished first; then high priority first; then soonest due; then by title. */
function byImportance(a: MyWorkItem, b: MyWorkItem): number {
  return (
    Number(a.task.status === "done") - Number(b.task.status === "done") ||
    PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority] ||
    (a.task.dueAt ?? "9999").localeCompare(b.task.dueAt ?? "9999") ||
    a.task.title.localeCompare(b.task.title)
  );
}

/** The tasks planned for today (done ones too: they used part of the day). */
export function todaysPlan(items: MyWorkItem[], entries: PlanEntry[], now: number): MyWorkItem[] {
  const days = plannedDays(entries);
  const today = todayKey(now);
  return items.filter((item) => days.get(item.task.id) === today).sort(byImportance);
}

/** Why a task is suggested for today, most pressing first. */
export type SuggestionReason = "leftover" | "overdue" | "due-today" | "started";

export interface Suggestion {
  item: MyWorkItem;
  reason: SuggestionReason;
  /** For "leftover": the day it was planned for. */
  plannedFor?: string;
}

const REASON_ORDER: SuggestionReason[] = ["leftover", "overdue", "due-today", "started"];

/** Why an unfinished task that isn't planned for today belongs on today's list, if it does. */
function reasonFor(task: Task, plannedFor: string | undefined, now: number): SuggestionReason | null {
  const today = todayKey(now);
  if (plannedFor && plannedFor < today) return "leftover";
  if (plannedFor && plannedFor > today) return null; // You already planned it for later.
  if (task.dueAt && new Date(task.dueAt).getTime() < now) return "overdue";
  if (task.dueAt && dayKey(new Date(task.dueAt)) === today) return "due-today";
  if (task.startAt && dayKey(new Date(task.startAt)) <= today) return "started";
  return null;
}

/**
 * Unfinished tasks that probably belong on today's plan: left over from an earlier day's
 * plan, overdue, due today, or already started.
 */
export function suggestions(items: MyWorkItem[], entries: PlanEntry[], now: number): Suggestion[] {
  const days = plannedDays(entries);
  const today = todayKey(now);
  const result: Suggestion[] = [];
  for (const item of items) {
    const plannedFor = days.get(item.task.id);
    if (item.task.status === "done" || plannedFor === today) continue;
    const reason = reasonFor(item.task, plannedFor, now);
    if (reason) result.push({ item, reason, plannedFor });
  }
  return result.sort(
    (a, b) => REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason) || byImportance(a.item, b.item),
  );
}

/** Every other unfinished task (not planned for today, not suggested), most important first. */
export function otherOpenTasks(items: MyWorkItem[], entries: PlanEntry[], now: number): MyWorkItem[] {
  const days = plannedDays(entries);
  const today = todayKey(now);
  const suggested = new Set(suggestions(items, entries, now).map((s) => s.item.task.id));
  return items
    .filter((item) => item.task.status !== "done" && days.get(item.task.id) !== today && !suggested.has(item.task.id))
    .sort(byImportance);
}

export interface DayLoad {
  /** Your own estimates added up, in minutes. */
  estimated: number;
  /** The same tasks, corrected by your history: what the day will really take. */
  realistic: number;
  /** Planned tasks without an estimate (not counted above). */
  withoutEstimate: number;
}

export function dayLoad(planned: MyWorkItem[], accuracy: EstimateAccuracy): DayLoad {
  let estimated = 0;
  let realistic = 0;
  let withoutEstimate = 0;
  for (const { task } of planned) {
    const minutes = realisticMinutes(task, accuracy);
    if (task.estimateMinutes === null || minutes === null) {
      withoutEstimate++;
      continue;
    }
    estimated += task.estimateMinutes;
    realistic += minutes;
  }
  return { estimated, realistic, withoutEstimate };
}

/**
 * When the day is too full by `overBy` minutes: which tasks to move to tomorrow. Only
 * unfinished tasks with an estimate that aren't due today or overdue (those can't wait),
 * low priority first, then the ones due last. Can be fewer than needed (or none).
 */
export function tasksToMove(planned: MyWorkItem[], overBy: number, accuracy: EstimateAccuracy, now: number): MyWorkItem[] {
  const today = todayKey(now);
  const candidates = planned
    .filter(({ task }) => {
      if (task.status === "done" || task.estimateMinutes === null) return false;
      return !task.dueAt || dayKey(new Date(task.dueAt)) > today;
    })
    .sort(
      (a, b) =>
        PRIORITY_ORDER[b.task.priority] - PRIORITY_ORDER[a.task.priority] ||
        (b.task.dueAt ?? "9999").localeCompare(a.task.dueAt ?? "9999"),
    );
  const chosen: MyWorkItem[] = [];
  let freed = 0;
  for (const item of candidates) {
    if (freed >= overBy) break;
    chosen.push(item);
    freed += realisticMinutes(item.task, accuracy) ?? 0;
  }
  return chosen;
}
