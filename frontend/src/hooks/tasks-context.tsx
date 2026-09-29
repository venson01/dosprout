"use client";

import { createContext, useContext } from "react";
import { upcomingMoments } from "@/lib/notifications";
import { useClock } from "./use-clock";
import { useTasks } from "./use-tasks";

type TaskList = ReturnType<typeof useTasks> & {
  /** The current time in milliseconds. Changes exactly when a task starts, is due soon or is overdue. */
  now: number;
};

const TasksContext = createContext<TaskList | null>(null);

/**
 * Loads the tasks once for the whole app, so the Tasks page and the
 * notification bell in the top bar share the same list.
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const taskList = useTasks();
  const now = useClock(upcomingMoments(taskList.tasks));
  return <TasksContext value={{ ...taskList, now }}>{children}</TasksContext>;
}

/** The shared task list and its actions (create, update, delete...). */
export function useTaskList(): TaskList {
  const value = useContext(TasksContext);
  if (!value) throw new Error("useTaskList() must be used inside <TasksProvider>");
  return value;
}
