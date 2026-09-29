import { daysBetween, fromDayKey, startOfDay } from "./calendar";
import type { Goal, GoalColor, Task } from "./types";

/** Tailwind classes for each goal color: a solid fill (bars, dots) and a soft background. */
export const GOAL_COLOR_CLASSES: Record<GoalColor, { fill: string; soft: string; label: string }> = {
  blue: { fill: "bg-brand", soft: "bg-brand-soft", label: "Blue" },
  orange: { fill: "bg-goal-orange", soft: "bg-goal-orange-bg", label: "Orange" },
  aqua: { fill: "bg-goal-aqua", soft: "bg-goal-aqua-bg", label: "Aqua" },
  yellow: { fill: "bg-goal-yellow", soft: "bg-goal-yellow-bg", label: "Yellow" },
  magenta: { fill: "bg-goal-magenta", soft: "bg-goal-magenta-bg", label: "Magenta" },
  violet: { fill: "bg-goal-violet", soft: "bg-goal-violet-bg", label: "Violet" },
};

export interface GoalProgress {
  tasks: Task[];
  done: number;
  total: number;
  /** 0 to 100. 0 when the goal has no tasks yet. */
  percent: number;
  /** Has tasks, and all of them are done. */
  complete: boolean;
}

/** A goal's progress: the share of its tasks that are done. */
export function goalProgress(goal: Goal, tasks: Task[]): GoalProgress {
  const goalTasks = tasks.filter((task) => task.goalId === goal.id);
  const done = goalTasks.filter((task) => task.status === "done").length;
  const total = goalTasks.length;
  return {
    tasks: goalTasks,
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    complete: total > 0 && done === total,
  };
}

/**
 * How the target date reads right now: "12 days left", "Due today", "3 days late"...
 * `late` is true when the day has passed and the goal isn't complete.
 */
export function targetStatus(goal: Goal, complete: boolean, now: number) {
  if (!goal.targetDate) return null;
  const target = fromDayKey(goal.targetDate);
  const date = target.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: target.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
  const daysLeft = daysBetween(startOfDay(new Date(now)), target);
  const plural = (n: number) => (n === 1 ? "day" : "days");
  let text: string;
  if (complete) text = "Reached";
  else if (daysLeft > 0) text = `${daysLeft} ${plural(daysLeft)} left`;
  else if (daysLeft === 0) text = "Due today";
  else text = `${-daysLeft} ${plural(-daysLeft)} late`;
  return { date, text, late: !complete && daysLeft < 0 };
}

/** Unfinished goals first, those with the nearest target date on top; reached goals last. */
export function sortGoals(goals: Goal[], tasks: Task[]): Goal[] {
  const reached = (goal: Goal) => (goalProgress(goal, tasks).complete ? 1 : 0);
  return [...goals].sort(
    (a, b) =>
      reached(a) - reached(b) ||
      (a.targetDate ?? "9999").localeCompare(b.targetDate ?? "9999") ||
      a.id - b.id,
  );
}
