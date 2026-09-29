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
  /** How long the task should take, in minutes, or null. */
  estimateMinutes: number | null;
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
  estimateMinutes?: number | null;
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

export const TIME_ENTRY_KINDS = ["timer", "focus", "manual"] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

/** A stretch of time spent, on a task or on nothing in particular. endedAt is null while running. */
export interface TimeEntry {
  id: number;
  taskId: number | null;
  kind: TimeEntryKind;
  startedAt: string;
  endedAt: string | null;
  note: string;
  createdAt: string;
}

export interface StartTimerInput {
  taskId?: number | null;
  kind?: "timer" | "focus";
}

export interface CreateTimeEntryInput {
  taskId?: number | null;
  startedAt: string;
  endedAt: string;
  note?: string;
}

export interface UpdateTimeEntryInput {
  taskId?: number | null;
  startedAt?: string;
  endedAt?: string;
  note?: string;
}

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** The app's settings (one set for everyone, since there are no accounts yet). */
export interface Settings {
  /** "system" follows the device's light / dark setting. */
  theme: Theme;
  /** Length of a focus (Pomodoro) session and of the break after it, in minutes. */
  focusMinutes: number;
  breakMinutes: number;
  /** 0 = weeks start on Sunday, 1 = Monday (calendar and charts). */
  weekStartsOn: 0 | 1;
  /** Which kinds of notification to show (in the app and on the desktop). */
  notifications: { started: boolean; dueSoon: boolean; done: boolean; focus: boolean };
  /** Times filled in when you pick a start / due date for a new task, e.g. "09:00". */
  defaultStartTime: string;
  defaultDueTime: string;
  defaultPriority: Priority;
  /** Tags suggested in the task editor. */
  tagSuggestions: string[];
}

export type UpdateSettingsInput = Partial<Omit<Settings, "notifications">> & {
  notifications?: Partial<Settings["notifications"]>;
};

/** Used until the real settings have loaded (the backend has the same defaults). */
export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  focusMinutes: 25,
  breakMinutes: 5,
  weekStartsOn: 1,
  notifications: { started: true, dueSoon: true, done: true, focus: true },
  defaultStartTime: "09:00",
  defaultDueTime: "17:00",
  defaultPriority: "mid",
  tagSuggestions: ["Work", "Health", "Personal", "Study", "Home"],
};

/** Everything in one object: the backup file (GET /export, POST /import). */
export interface Backup {
  app: "DoSprout";
  version: 1;
  exportedAt?: string;
  settings?: Partial<Settings>;
  goals: Goal[];
  tasks: Task[];
  timeEntries: TimeEntry[];
}
