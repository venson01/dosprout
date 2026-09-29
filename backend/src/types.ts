// Shapes of the data the API sends and receives.
// The frontend has a matching copy in frontend/src/lib/types.ts — keep them in sync.

export const STATUSES = ["todo", "in_progress", "done"] as const;
export const PRIORITIES = ["low", "mid", "high"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

/** The colors a goal can have (the frontend maps each one to a color token). */
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
  /** When work on the task begins, as an ISO timestamp in UTC (e.g. "2026-11-17T08:00:00.000Z"), or null. */
  startAt: string | null;
  /** The deadline, as an ISO timestamp in UTC, or null. Never earlier than startAt. */
  dueAt: string | null;
  /** Sort order inside a status column (lower comes first). */
  position: number;
  createdAt: string;
  updatedAt: string;
  /** When the task was last moved to "done" (UTC), or null while it isn't done. Set by the server. */
  completedAt: string | null;
  /** The goal this task belongs to, or null. */
  goalId: number | null;
  /** How long the task should take, in minutes, or null. Compared with the tracked time. */
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
  /** Titles of subtasks to create together with the task. */
  subtasks?: string[];
}

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "subtasks">> & {
  position?: number;
};

export interface CreateSubtaskInput {
  title: string;
}

export interface UpdateSubtaskInput {
  title?: string;
  done?: boolean;
}

/**
 * A bigger aim that tasks belong to (task.goalId). Its progress isn't stored:
 * it's the share of its tasks that are done.
 */
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

/** How a time entry was made: a timer, a focus (Pomodoro) session, or added by hand. */
export const TIME_ENTRY_KINDS = ["timer", "focus", "manual"] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

/** A stretch of time spent, on a task or on nothing in particular. */
export interface TimeEntry {
  id: number;
  /** The task the time was spent on, or null. */
  taskId: number | null;
  kind: TimeEntryKind;
  /** UTC ISO timestamps. endedAt is null while the timer is still running. */
  startedAt: string;
  endedAt: string | null;
  note: string;
  createdAt: string;
}

export interface StartTimerInput {
  taskId?: number | null;
  /** "focus" for a Pomodoro session. Default "timer". */
  kind?: "timer" | "focus";
}

/** Time added by hand: it already has a start and an end. */
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

/** Everything in one object: what GET /export returns and POST /import accepts. */
export interface Backup {
  app: "DoSprout";
  version: 1;
  exportedAt?: string;
  settings?: Partial<Settings>;
  goals: Goal[];
  tasks: Task[];
  timeEntries: TimeEntry[];
}
