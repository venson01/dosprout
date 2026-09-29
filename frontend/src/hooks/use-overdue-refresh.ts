"use client";

import { useEffect, useState } from "react";
import type { Task } from "@/lib/types";

// Browsers can't wait longer than about 24 days in one setTimeout,
// so for far-away due dates, wake up once a day and check again.
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

/**
 * Re-renders the calling component at the moment the next task becomes overdue,
 * so its due date turns red without reloading the page. (isOverdue compares the
 * due date with the clock while rendering, so a fresh render is all it takes.)
 */
export function useOverdueRefresh(tasks: Task[]) {
  const [tick, setTick] = useState(0);

  // Sleep until the soonest due date that hasn't passed yet.
  useEffect(() => {
    const now = Date.now();
    const upcoming = tasks
      .filter((task) => task.status !== "done" && task.dueAt !== null)
      .map((task) => new Date(task.dueAt!).getTime())
      .filter((time) => time > now);
    if (upcoming.length === 0) return;

    // A few extra milliseconds so the due time has definitely passed when we re-render.
    const wait = Math.min(Math.min(...upcoming) - now + 50, MAX_WAIT_MS);
    const timer = setTimeout(() => setTick((t) => t + 1), wait);
    return () => clearTimeout(timer);
  }, [tasks, tick]);

  // Timers can be paused while the computer sleeps, so also check again
  // whenever you come back to this tab.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
