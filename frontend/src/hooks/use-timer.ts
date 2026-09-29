"use client";

import { useCallback, useEffect, useState } from "react";
import { MINUTE_MS, runningEntry } from "@/lib/time";
import type { Settings, StartTimerInput, TimeEntry, UpdateTimeEntryInput } from "@/lib/types";
import { showDesktopMessage } from "./use-desktop-notifications";

interface TimerActions {
  startTimer: (input: StartTimerInput) => Promise<TimeEntry>;
  stopTimer: () => Promise<void>;
  saveTimeEntry: (original: TimeEntry | null, input: UpdateTimeEntryInput) => Promise<TimeEntry>;
}

/**
 * The running timer, for the whole app (it lives in TasksProvider, so it keeps going
 * when you change pages). Also runs the focus (Pomodoro) cycle: a focus session ends
 * by itself after settings.focusMinutes and is saved, then a settings.breakMinutes
 * break counts down.
 * The break isn't saved; it's only a reminder.
 */
export function useTimer(
  entries: TimeEntry[],
  { startTimer, stopTimer, saveTimeEntry }: TimerActions,
  settings: Settings,
) {
  const { focusMinutes, breakMinutes } = settings;
  const notify = settings.notifications.focus;
  const running = runningEntry(entries);
  // When the current break ends (milliseconds), or null when there's no break.
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);

  // End a focus session after focusMinutes (also when the page was closed and opened again).
  const focusId = running?.kind === "focus" ? running.id : null;
  const focusStart = running?.kind === "focus" ? running.startedAt : null;
  useEffect(() => {
    if (focusId === null || focusStart === null) return;
    const endsAt = Date.parse(focusStart) + focusMinutes * MINUTE_MS;
    const timer = setTimeout(
      () => {
        const entry = entries.find((e) => e.id === focusId);
        if (!entry) return;
        // Saved as exactly focusMinutes, even if the computer was asleep for longer.
        saveTimeEntry(entry, { endedAt: new Date(endsAt).toISOString() }).catch(() => {});
        const breakEnd = endsAt + breakMinutes * MINUTE_MS;
        if (Date.now() < breakEnd) {
          setBreakEndsAt(breakEnd);
          if (notify) {
            showDesktopMessage({
              title: "Focus session done",
              body: `Nice work! Take a ${breakMinutes}-minute break.`,
              tag: `focus-${focusId}`,
            });
          }
        }
      },
      Math.max(0, endsAt - Date.now()),
    );
    return () => clearTimeout(timer);
    // `entries` is only read when the timer fires, so changes to it shouldn't restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusStart, saveTimeEntry, focusMinutes, breakMinutes, notify]);

  // Tell you when the break is over.
  useEffect(() => {
    if (breakEndsAt === null) return;
    const timer = setTimeout(
      () => {
        setBreakEndsAt(null);
        if (notify) {
          showDesktopMessage({
            title: "Break's over",
            body: "Ready for another focus session?",
            tag: `break-${breakEndsAt}`,
          });
        }
      },
      Math.max(0, breakEndsAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [breakEndsAt, notify]);

  const start = useCallback(
    (taskId: number | null, kind: "timer" | "focus" = "timer") => {
      setBreakEndsAt(null);
      return startTimer({ taskId, kind });
    },
    [startTimer],
  );

  const stop = useCallback(() => stopTimer(), [stopTimer]);
  const skipBreak = useCallback(() => setBreakEndsAt(null), []);

  return { running, breakEndsAt, start, stop, skipBreak };
}
