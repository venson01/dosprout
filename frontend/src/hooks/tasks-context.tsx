"use client";

import { createContext, useContext } from "react";
import { upcomingMoments } from "@/lib/notifications";
import { useClock } from "./use-clock";
import { useTasks } from "./use-tasks";
import { useTimer } from "./use-timer";

type TaskList = ReturnType<typeof useTasks> & {
  /** The current time in milliseconds. Changes exactly when a task starts, is due soon or is overdue. */
  now: number;
  /** The running timer and the focus/break cycle (see useTimer). */
  timer: ReturnType<typeof useTimer>;
};

const TasksContext = createContext<TaskList | null>(null);

/**
 * Loads the tasks (plus goals and tracked time) once for the whole app, so every
 * page, the notification bell and the timer in the top bar share the same data.
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const taskList = useTasks();
  const now = useClock(upcomingMoments(taskList.tasks));
  const timer = useTimer(taskList.timeEntries, taskList, taskList.settings);
  return <TasksContext value={{ ...taskList, now, timer }}>{children}</TasksContext>;
}

/** The shared task list and its actions (create, update, delete...). */
export function useTaskList(): TaskList {
  const value = useContext(TasksContext);
  if (!value) throw new Error("useTaskList() must be used inside <TasksProvider>");
  return value;
}
