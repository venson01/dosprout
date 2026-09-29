import { AlarmClock, CalendarClock, CalendarDays, Flag } from "lucide-react";
import { formatDateTime, isOverdue, PRIORITY_LABELS } from "@/lib/task-helpers";
import { GOAL_COLOR_CLASSES } from "@/lib/goals";
import type { Goal, Priority, Task } from "@/lib/types";

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "bg-high-bg text-high",
  mid: "bg-mid-bg text-mid",
  low: "bg-low-bg text-low",
};

export function TagBadge({ tag }: { tag: string }) {
  if (!tag) return <span className="text-sm text-muted">—</span>;
  return (
    <span className="inline-flex rounded-md bg-tag-bg px-2.5 py-1 text-xs font-medium text-tag">
      {tag}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${PRIORITY_STYLES[priority]}`}
    >
      <Flag className="size-3" aria-hidden />
      <span className="sr-only">Priority: </span>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** The goal a task belongs to: a colored dot and the goal's name. */
export function GoalBadge({ goal }: { goal: Goal }) {
  return (
    <span className="inline-flex max-w-40 items-center gap-1.5 text-xs text-muted" title={`Goal: ${goal.title}`}>
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${GOAL_COLOR_CLASSES[goal.color].fill}`} />
      <span className="sr-only">Goal: </span>
      <span className="truncate">{goal.title}</span>
    </span>
  );
}

/** Red "Overdue" label for tasks whose due date has passed (see isOverdue). */
export function OverdueBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-high-bg px-2 py-0.5 text-xs font-medium text-high">
      <AlarmClock className="size-3" aria-hidden />
      Overdue
    </span>
  );
}

interface TaskDateProps {
  task: Task;
  kind: "start" | "due";
  /** Show the word "Start"/"Due" (for places without column headers). */
  showLabel?: boolean;
  iconClassName?: string;
}

/** A task's start or due date with its time, e.g. "Nov 17, 5:00 PM". Overdue due dates are red. */
export function TaskDate({ task, kind, showLabel = false, iconClassName = "text-brand" }: TaskDateProps) {
  const timestamp = kind === "start" ? task.startAt : task.dueAt;
  const label = kind === "start" ? "Start" : "Due";
  if (!timestamp) {
    return (
      <span className="text-sm text-muted">
        <span aria-hidden>—</span>
        <span className="sr-only">No {kind} date</span>
      </span>
    );
  }

  const overdue = kind === "due" && isOverdue(task);
  const Icon = kind === "start" ? CalendarClock : CalendarDays;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${overdue ? "font-medium text-high" : ""}`}
      title={overdue ? "Overdue" : undefined}
    >
      <Icon className={`size-4 shrink-0 ${overdue ? "text-high" : iconClassName}`} aria-hidden />
      <span className={showLabel ? "text-muted" : "sr-only"}>{label}</span>
      <time dateTime={timestamp}>{formatDateTime(timestamp)}</time>
      {overdue && <span className="sr-only">(overdue)</span>}
    </span>
  );
}
