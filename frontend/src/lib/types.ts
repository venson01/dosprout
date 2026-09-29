// Shapes of the data the API sends and receives.
// The backend has the source of truth in backend/src/types.ts — keep them in sync.

export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "mid", "high"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

// In this order on purpose: it was checked with a color-blindness validator so that
// neighboring colors stay easy to tell apart. A goal's name is always shown next to its color.
export const GOAL_COLORS = ["blue", "orange", "aqua", "yellow", "magenta", "violet"] as const;
export type GoalColor = (typeof GOAL_COLORS)[number];

export interface Subtask {
  id: number;
  taskId: number;
  title: string;
  done: boolean;
  position: number;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  tag: string;
  /** When work begins: an ISO timestamp in UTC (e.g. "2026-11-17T08:00:00.000Z"), or null. */
  startAt: string | null;
  /** The deadline: an ISO timestamp in UTC, or null. Never earlier than startAt. */
  dueAt: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  /** When the task was last moved to "done" (UTC), or null while it isn't done. Set by the server. */
  completedAt: string | null;
  /** The goal this task belongs to, or null. */
  goalId: number | null;
  subtasks: Subtask[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: Status;
  priority?: Priority;
  tag?: string;
  startAt?: string | null;
  dueAt?: string | null;
  goalId?: number | null;
  subtasks?: string[];
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "subtasks">> & {
  position?: number;
};

/** A bigger aim that tasks belong to (task.goalId). Progress = the share of its tasks that are done. */
export interface Goal {
  id: number;
  title: string;
  description: string;
  color: GoalColor;
  /** The day the goal should be reached, as "2026-12-31" (no time), or null. */
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  color?: GoalColor;
  targetDate?: string | null;
}

export type UpdateGoalInput = Partial<CreateGoalInput>;
