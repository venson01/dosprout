"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fromDateAndTime } from "@/lib/task-helpers";
import type {
  CreateGoalInput,
  CreateTimeEntryInput,
  Goal,
  Priority,
  Settings,
  StartTimerInput,
  Status,
  Task,
  TimeEntry,
  UpdateSettingsInput,
  UpdateTaskInput,
  UpdateTimeEntryInput,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";

/** What the task editor dialog works with before anything is saved. */
export interface TaskDraft {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  tag: string;
  // Local values from the date ("2026-11-17") and time ("17:00") inputs.
  // An empty date means the task has no start / due date.
  startDate: string;
  startTime: string;
  dueDate: string;
  dueTime: string;
  /** The goal the task belongs to, or null. */
  goalId: number | null;
  /** How long the task should take, in minutes, or null. */
  estimateMinutes: number | null;
  subtasks: DraftSubtask[];
}

export interface DraftSubtask {
  /** Stable React key, also for subtasks that don't exist on the server yet. */
  key: string;
  /** Set for subtasks that already exist on the server. */
  id?: number;
  title: string;
  done: boolean;
}

type LoadState = "loading" | "ready" | "error";

/** Newest first, like the API sends them. */
const newestFirst = (a: TimeEntry, b: TimeEntry) => b.startedAt.localeCompare(a.startedAt) || b.id - a.id;

/**
 * Loads the task list, the goals (which tasks belong to) and the tracked time
 * from the API, and exposes functions to change them.
 * Quick actions (moving, completing, deleting) update the screen immediately
 * and quietly re-sync with the server if the request fails.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  // The defaults until the real settings have loaded.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // All at once: pages show a task's goal and its tracked time next to it.
    Promise.all([api.listTasks(), api.listGoals(), api.listTimeEntries(), api.getSettings()]).then(
      ([taskList, goalList, entryList, savedSettings]) => {
        if (cancelled) return;
        setTasks(taskList);
        setGoals(goalList);
        setTimeEntries(entryList);
        setSettings(savedSettings);
        setLoadState("ready");
      },
      (error: Error) => {
        if (cancelled) return;
        setLoadError(error.message);
        setLoadState("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = useCallback(() => {
    setLoadState("loading");
    setReloadKey((key) => key + 1);
  }, []);

  // After a failed optimistic change, fetch the real data again.
  const resync = useCallback(() => {
    api.listTasks().then(setTasks, () => {});
  }, []);

  const replaceTask = useCallback((task: Task) => {
    setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
  }, []);

  const updateTask = useCallback(
    async (id: number, input: UpdateTaskInput) => {
      setTasks((list) => {
        const bottom = Math.max(-1, ...list.map((t) => t.position)) + 1;
        return list.map((t) => {
          if (t.id !== id) return t;
          const moved = input.status && input.status !== t.status && input.position === undefined;
          return { ...t, ...input, ...(moved ? { position: bottom } : {}) };
        });
      });
      try {
        replaceTask(await api.updateTask(id, input));
      } catch (error) {
        resync();
        throw error;
      }
    },
    [replaceTask, resync],
  );

  const deleteTask = useCallback(
    async (id: number) => {
      setTasks((list) => list.filter((t) => t.id !== id));
      // The server deletes the task's tracked time too.
      setTimeEntries((list) => list.filter((e) => e.taskId !== id));
      try {
        await api.deleteTask(id);
      } catch (error) {
        resync();
        throw error;
      }
    },
    [resync],
  );

  /** Creates a new task (original = null) or saves all edits made to an existing one. */
  const saveTask = useCallback(
    async (original: Task | null, draft: TaskDraft): Promise<Task> => {
      const fields = {
        title: draft.title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        tag: draft.tag,
        startAt: fromDateAndTime(draft.startDate, draft.startTime),
        dueAt: fromDateAndTime(draft.dueDate, draft.dueTime),
        goalId: draft.goalId,
        estimateMinutes: draft.estimateMinutes,
      };

      if (!original) {
        let task = await api.createTask({
          ...fields,
          // New subtasks start unticked, and the API won't create a task as "done"
          // with unfinished subtasks. Ticking them all below makes it done anyway.
          status: draft.subtasks.length > 0 && fields.status === "done" ? "todo" : fields.status,
          subtasks: draft.subtasks.map((s) => s.title),
        });
        // New subtasks start unchecked, so tick the ones marked done in the dialog.
        for (const [index, subtask] of draft.subtasks.entries()) {
          if (subtask.done) {
            task = await api.updateSubtask(task.id, task.subtasks[index].id, { done: true });
          }
        }
        // Ticking subtasks can change the status on the server, so make sure
        // the task ends up with the status shown in the dialog.
        if (task.status !== draft.status) {
          task = await api.updateTask(task.id, { status: draft.status });
        }
        setTasks((list) => [...list, task]);
        return task;
      }

      try {
        const saved = await saveEdits(original, fields, draft.subtasks);
        replaceTask(saved);
        return saved;
      } catch (error) {
        // Some changes may have been saved before the error, so re-sync.
        resync();
        throw error;
      }
    },
    [replaceTask, resync],
  );

  /** Creates a new goal (original = null) or saves changes to an existing one. */
  const saveGoal = useCallback(async (original: Goal | null, input: CreateGoalInput) => {
    const goal = original ? await api.updateGoal(original.id, input) : await api.createGoal(input);
    setGoals((list) => (original ? list.map((g) => (g.id === goal.id ? goal : g)) : [...list, goal]));
    return goal;
  }, []);

  /** Deletes a goal. Its tasks stay, they just no longer belong to a goal. */
  const deleteGoal = useCallback(async (id: number) => {
    await api.deleteGoal(id);
    setGoals((list) => list.filter((g) => g.id !== id));
    // The server unlinked the goal's tasks; do the same here.
    setTasks((list) => list.map((t) => (t.goalId === id ? { ...t, goalId: null } : t)));
  }, []);

  // There's one timer for everyone (no accounts yet), so another browser may have started
  // or stopped it. After each start / stop, fetch the real list so this page shows what's
  // actually running.
  const syncTimeEntries = useCallback(() => {
    api.listTimeEntries().then(setTimeEntries, () => {});
  }, []);

  /** Starts a timer (or a focus session). The server stops a running one first. */
  const startTimer = useCallback(
    async (input: StartTimerInput) => {
      const entry = await api.startTimer(input);
      // Show it right away, then check with the server.
      setTimeEntries((list) => [
        entry,
        ...list.map((e) => (e.endedAt === null ? { ...e, endedAt: entry.startedAt } : e)),
      ]);
      syncTimeEntries();
      return entry;
    },
    [syncTimeEntries],
  );

  /** Stops the running timer. */
  const stopTimer = useCallback(async () => {
    try {
      const entry = await api.stopTimer();
      setTimeEntries((list) => list.map((e) => (e.id === entry.id ? entry : e)));
    } finally {
      // Also when it failed (e.g. it was already stopped in another browser).
      syncTimeEntries();
    }
  }, [syncTimeEntries]);

  /** Adds time by hand (original = null) or saves changes to an existing entry. */
  const saveTimeEntry = useCallback(
    async (original: TimeEntry | null, input: UpdateTimeEntryInput) => {
      const entry = original
        ? await api.updateTimeEntry(original.id, input)
        : await api.createTimeEntry(input as CreateTimeEntryInput);
      setTimeEntries((list) =>
        (original ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry]).sort(newestFirst),
      );
      return entry;
    },
    [],
  );

  const deleteTimeEntry = useCallback(async (id: number) => {
    await api.deleteTimeEntry(id);
    setTimeEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  /**
   * Changes some settings. The screen updates right away (e.g. the theme switches);
   * if saving fails, the saved settings are loaded again and the error is passed on.
   */
  const saveSettings = useCallback(async (input: UpdateSettingsInput) => {
    setSettings((current) => ({
      ...current,
      ...input,
      notifications: { ...current.notifications, ...input.notifications },
    }));
    try {
      setSettings(await api.updateSettings(input));
    } catch (error) {
      api.getSettings().then(setSettings, () => {});
      throw error;
    }
  }, []);

  return {
    tasks,
    goals,
    timeEntries,
    settings,
    saveSettings,
    loadState,
    loadError,
    reload,
    updateTask,
    deleteTask,
    saveTask,
    saveGoal,
    deleteGoal,
    startTimer,
    stopTimer,
    saveTimeEntry,
    deleteTimeEntry,
  };
}

/** Sends only what changed in the editor to the API, then returns the fresh task. */
async function saveEdits(original: Task, fields: UpdateTaskInput, subtasks: DraftSubtask[]) {
  const keptIds = new Set(subtasks.map((s) => s.id));
  for (const subtask of original.subtasks) {
    if (!keptIds.has(subtask.id)) await api.deleteSubtask(original.id, subtask.id);
  }
  for (const subtask of subtasks) {
    if (subtask.id === undefined) {
      const task = await api.addSubtask(original.id, subtask.title);
      if (subtask.done) {
        await api.updateSubtask(original.id, task.subtasks.at(-1)!.id, { done: true });
      }
      continue;
    }
    const before = original.subtasks.find((s) => s.id === subtask.id);
    if (before && (before.title !== subtask.title || before.done !== subtask.done)) {
      await api.updateSubtask(original.id, subtask.id, {
        title: subtask.title,
        done: subtask.done,
      });
    }
  }

  // Save the other fields last. Subtask changes can move the task to another
  // status on the server, and the status picked in the dialog should win.
  const current = await api.getTask(original.id);
  const changed = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => current[key as keyof UpdateTaskInput] !== value,
    ),
  );
  if (Object.keys(changed).length === 0) return current;
  return api.updateTask(original.id, changed);
}
