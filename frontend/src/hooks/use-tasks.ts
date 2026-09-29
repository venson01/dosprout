"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fromDateAndTime } from "@/lib/task-helpers";
import type { Priority, Status, Task, UpdateTaskInput } from "@/lib/types";

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

/**
 * Loads the task list from the API and exposes functions to change it.
 * Quick actions (moving, completing, deleting) update the screen immediately
 * and quietly re-sync with the server if the request fails.
 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.listTasks().then(
      (list) => {
        if (cancelled) return;
        setTasks(list);
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
      };

      if (!original) {
        let task = await api.createTask({
          ...fields,
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

  return { tasks, loadState, loadError, reload, updateTask, deleteTask, saveTask };
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
