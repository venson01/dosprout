"use client";

import { Coffee, Square, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useTaskList } from "@/hooks/tasks-context";
import { useTicker } from "@/hooks/use-ticker";
import { useTimerWindow } from "@/hooks/use-timer-window";
import { BigClock } from "@/components/time/big-clock";
import { formatClock, MINUTE_MS } from "@/lib/time";

/**
 * The pop-out timer window's content. It lives in AppShell (not on the Time page), so the
 * window keeps working when you change pages. createPortal draws React content into the
 * other window, while it still reads the same tasks and timer as the rest of the app.
 */
export function TimerPopout() {
  const { popout } = useTimerWindow();
  if (!popout) return null;
  return createPortal(<PopoutContent popout={popout} />, popout.document.body);
}

const buttonClass =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand";

function PopoutContent({ popout }: { popout: Window }) {
  const { tasks, timer, settings } = useTaskList();
  const { running, breakEndsAt, stop, skipBreak } = timer;
  // Tick with the pop-out's own clock, so it stays live while the browser is minimized.
  const now = useTicker(Boolean(running) || breakEndsAt !== null, popout);

  if (running) {
    const task = tasks.find((t) => t.id === running.taskId);
    const started = Date.parse(running.startedAt);
    const focus = running.kind === "focus";
    const focusLength = settings.focusMinutes * MINUTE_MS;
    const done = Math.min(100, Math.max(0, ((now - started) / focusLength) * 100));
    return (
      <Frame>
        <p className="flex items-center gap-2 text-xs font-medium text-muted">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-high motion-reduce:animate-none" />
          {focus ? "Focus session" : "Timer"}
        </p>
        <ClockSpace>
          <BigClock fit="window" time={focus ? formatClock(started + focusLength - now) : formatClock(now - started)} />
        </ClockSpace>
        <p className="max-w-full truncate text-sm text-muted">{task ? task.title : "No task"}</p>
        {focus && (
          <div className="h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-page">
            <div className="h-full rounded-full bg-brand" style={{ width: `${done}%` }} />
          </div>
        )}
        <button
          type="button"
          onClick={() => stop().catch(() => {})}
          className={`${buttonClass} bg-inverse text-white hover:bg-inverse/85`}
        >
          <Square aria-hidden className="size-3 fill-current" /> Stop
        </button>
      </Frame>
    );
  }

  if (breakEndsAt !== null) {
    return (
      <Frame>
        <p className="flex items-center gap-2 text-xs font-medium text-low">
          <Coffee aria-hidden className="size-4" /> Break
        </p>
        <ClockSpace>
          <BigClock fit="window" time={formatClock(breakEndsAt - now)} />
        </ClockSpace>
        <p className="max-w-full truncate text-sm text-muted">Stand up, stretch, drink some water.</p>
        <button type="button" onClick={skipBreak} className={`${buttonClass} text-muted ring-1 ring-line hover:text-ink`}>
          <X aria-hidden className="size-3.5" /> Skip break
        </button>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex flex-1 flex-col justify-center gap-1">
        <p className="text-sm font-medium">Nothing is running</p>
        <p className="text-sm text-muted">Start a timer or a focus session on the Time page.</p>
      </div>
    </Frame>
  );
}

/** Fills the small window: everything centered in a column, on the card color. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col items-center gap-2 bg-surface px-4 py-3 text-center text-ink">{children}</div>
  );
}

/**
 * Takes all the window's free space and centers the clock in it. `@container-size` lets
 * the clock measure this space's width AND height, so it grows when you resize the
 * window but never gets taller than the space.
 */
function ClockSpace({ children }: { children: React.ReactNode }) {
  return <div className="@container-size flex min-h-0 w-full flex-1 items-center justify-center">{children}</div>;
}
