"use client";

import { Coffee, PencilLine, PictureInPicture2, Play, Plus, Square, Timer } from "lucide-react";
import { useCallback, useState } from "react";
import { PeriodChart, usePeriodParam } from "@/components/charts/period-chart";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { useTaskList } from "@/hooks/tasks-context";
import { useTicker } from "@/hooks/use-ticker";
import { closeTimerWindow, openTimerWindow, useTimerWindow } from "@/hooks/use-timer-window";
import { addDays, dayKey, fromDayKey, startOfDay } from "@/lib/calendar";
import { PERIODS, periodStart } from "@/lib/periods";
import {
  entriesByDay,
  entryDuration,
  formatClock,
  formatDuration,
  MINUTE_MS,
  overEstimate,
  trackedByTask,
  trackedPer,
} from "@/lib/time";
import type { Task, TimeEntry, TimeEntryKind } from "@/lib/types";
import { BigClock } from "./big-clock";
import { EntryDialog } from "./entry-dialog";

/** "9:05 AM" */
const clockTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** How many entries the log shows. */
const LOG_LIMIT = 40;

/**
 * The Time page: start a timer or a focus session, see tracked time per day / week /
 * month, time per task against its estimate, and a log of entries to fix or add by hand.
 */
export function TimeView() {
  const { tasks, timeEntries, loadState, loadError, reload, saveTask, deleteTask, saveTimeEntry, deleteTimeEntry, timer } =
    useTaskList();
  // Tick every second while a timer or a break is running, so the numbers stay live.
  const now = useTicker(Boolean(timer.running) || timer.breakEndsAt !== null);
  // undefined = closed, null = adding time by hand.
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null | undefined>(undefined);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const showErrors = (promise: Promise<unknown>) => promise.catch((error: Error) => setToast(error.message));

  function confirmDeleteEntry(entry: TimeEntry) {
    if (!window.confirm(`Delete this ${formatDuration(entryDuration(entry, now))} of tracked time?`)) return;
    setEditingEntry(undefined);
    showErrors(deleteTimeEntry(entry.id));
  }

  function confirmDeleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? Its tracked time is deleted too. This can't be undone.`)) return;
    setEditingTask(null);
    showErrors(deleteTask(task.id));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Time</h1>
        {loadState === "ready" && (
          <button
            type="button"
            onClick={() => setEditingEntry(null)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand ring-1 ring-line hover:bg-surface"
          >
            <Plus className="size-4" />
            Add time
          </button>
        )}
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading your time" />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" && (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <NowCard tasks={tasks} now={now} onError={setToast} />
            </div>
            <div className="lg:col-span-3">
              <TrackedChart entries={timeEntries} now={now} />
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <TimePerTask tasks={tasks} entries={timeEntries} now={now} onOpenTask={setEditingTask} onError={setToast} />
            </div>
            <div className="lg:col-span-3">
              <EntryLog tasks={tasks} entries={timeEntries} now={now} onEdit={setEditingEntry} />
            </div>
          </div>
        </div>
      )}

      {editingEntry !== undefined && (
        <EntryDialog
          key={editingEntry?.id ?? "new"}
          entry={editingEntry}
          onSave={async (input) => {
            await saveTimeEntry(editingEntry, input);
          }}
          onDelete={editingEntry ? () => confirmDeleteEntry(editingEntry) : undefined}
          onClose={() => setEditingEntry(undefined)}
        />
      )}
      {editingTask && (
        <TaskDialog
          key={editingTask.id}
          task={editingTask}
          defaultStatus={editingTask.status}
          onSave={async (draft) => {
            await saveTask(editingTask, draft);
          }}
          onDelete={() => confirmDeleteTask(editingTask)}
          onClose={() => setEditingTask(null)}
        />
      )}
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

/**
 * Opens the timer in a small window that stays on top, even when the browser is minimized.
 * Only Chrome and Edge can do this; other browsers get a short note instead.
 */
function PopOutButton({ onError }: { onError: (message: string) => void }) {
  const { popout, supported } = useTimerWindow();
  if (!supported) {
    return <p className="self-center text-xs text-muted">Pop-out timer: open DoSprout in Chrome or Edge.</p>;
  }
  return (
    <button
      type="button"
      onClick={() =>
        popout
          ? closeTimerWindow()
          : openTimerWindow().catch(() => onError("Couldn't open the pop-out timer. Try again, or open DoSprout in Chrome or Edge."))
      }
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-brand ring-1 ring-line hover:bg-page"
    >
      <PictureInPicture2 aria-hidden className="size-4" />
      {popout ? "Close pop-out" : "Pop out"}
    </button>
  );
}

/** A white box with a heading. A column, so content with `flex-1` can fill the rest of it. */
function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {aside && <p className="text-sm text-muted">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Fills the card's free space and centers the clock in it. `@container` lets the
 * clock measure this area's width (see big-clock.tsx).
 */
function ClockArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container flex min-h-56 flex-1 flex-col items-center justify-center gap-3 py-4 text-center">
      {children}
    </div>
  );
}

/** What's happening now: the running timer, the focus break, or buttons to start one. */
function NowCard({ tasks, now, onError }: { tasks: Task[]; now: number; onError: (message: string) => void }) {
  const { timer, settings } = useTaskList();
  const { focusMinutes, breakMinutes } = settings;
  const { running, breakEndsAt } = timer;
  // The task to track; remembered while you stay on the page.
  const [taskId, setTaskId] = useState<number | null>(null);
  const openTasks = tasks.filter((task) => task.status !== "done");
  const report = (promise: Promise<unknown>) => promise.catch((error: Error) => onError(error.message));

  if (running) {
    const task = tasks.find((t) => t.id === running.taskId);
    const started = Date.parse(running.startedAt);
    const focus = running.kind === "focus";
    const left = started + focusMinutes * MINUTE_MS - now;
    const focusDone = Math.min(100, Math.max(0, ((now - started) / (focusMinutes * MINUTE_MS)) * 100));
    return (
      <Card title={focus ? "Focus session" : "Timer running"}>
        <ClockArea>
          <p className="max-w-full truncate text-sm text-muted">{task ? task.title : "No task"}</p>
          <BigClock time={focus ? formatClock(left) : formatClock(now - started)} />
          {focus ? (
            <>
              <div
                role="progressbar"
                aria-label="Focus session"
                aria-valuenow={Math.round(focusDone)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-2 w-full overflow-hidden rounded-full bg-page"
              >
                <div className="h-full rounded-full bg-brand" style={{ width: `${focusDone}%` }} />
              </div>
              <p className="text-sm text-muted">
                Left of {focusMinutes} minutes. Then a {breakMinutes}-minute break starts.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Started at {clockTime(running.startedAt)}</p>
          )}
        </ClockArea>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => report(timer.stop())}
            className="inline-flex items-center gap-2 rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-white hover:bg-inverse/85"
          >
            <Square className="size-3.5 fill-current" />
            Stop
          </button>
          <PopOutButton onError={onError} />
        </div>
      </Card>
    );
  }

  if (breakEndsAt !== null) {
    return (
      <Card title="Break">
        <ClockArea>
          <p className="flex items-center gap-2 text-sm text-muted">
            <Coffee aria-hidden className="size-4 shrink-0 text-low" />
            Stand up, stretch, drink some water.
          </p>
          <BigClock time={formatClock(breakEndsAt - now)} />
        </ClockArea>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={timer.skipBreak}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted ring-1 ring-line hover:bg-page hover:text-ink"
          >
            Skip break
          </button>
          <PopOutButton onError={onError} />
        </div>
      </Card>
    );
  }

  return (
    <Card title="Track time">
      <label htmlFor="now-task" className="mb-1 block text-sm font-medium">
        Task
      </label>
      <select
        id="now-task"
        value={taskId ?? ""}
        onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        <option value="">No task</option>
        {openTasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </select>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => report(timer.start(taskId, "timer"))}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
        >
          <Play className="size-4 fill-current" />
          Start timer
        </button>
        <button
          type="button"
          onClick={() => report(timer.start(taskId, "focus"))}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-brand ring-1 ring-line hover:bg-brand-soft"
        >
          <Timer className="size-4" />
          Focus {focusMinutes} min
        </button>
      </div>
      <p className="mt-3 text-sm text-muted">
        A focus session is {focusMinutes} minutes of work, then a {breakMinutes}-minute break
        (the Pomodoro technique). The focus time is saved as tracked time. You can change both
        lengths in Settings.
      </p>
    </Card>
  );
}

/** Tracked time per day / week / month (the same chart as the Dashboard's). */
function TrackedChart({ entries, now }: { entries: TimeEntry[]; now: number }) {
  const [period, choose] = usePeriodParam("/time");
  const { settings } = useTaskList();
  const columns = trackedPer(entries, now, period, settings.weekStartsOn);
  const total = columns.reduce((sum, column) => sum + column.value, 0);

  return (
    <Card title="Tracked time" aside={`${formatDuration(total)} in the last ${PERIODS[period].span}`}>
      <PeriodChart
        columns={columns}
        period={period}
        onPeriodChange={choose}
        formatValue={formatDuration}
        valueLabel="tracked"
        description="Time tracked"
        weekStartsOn={settings.weekStartsOn}
        // At least 1 hour, so a quiet day doesn't fill the whole chart.
        minScale={60 * MINUTE_MS}
      />
    </Card>
  );
}

/**
 * Each task's tracked time (all time) against its estimate. Shows tasks with tracked
 * time, plus unfinished tasks that have an estimate. Most time first.
 */
function TimePerTask({
  tasks,
  entries,
  now,
  onOpenTask,
  onError,
}: {
  tasks: Task[];
  entries: TimeEntry[];
  now: number;
  onOpenTask: (task: Task) => void;
  onError: (message: string) => void;
}) {
  const { timer, settings } = useTaskList();
  const totals = trackedByTask(entries, now);
  const weekStart = periodStart(new Date(now), "week", settings.weekStartsOn).getTime();
  const thisWeek = entries
    .filter((entry) => Date.parse(entry.startedAt) >= weekStart)
    .reduce((sum, entry) => sum + entryDuration(entry, now), 0);
  const rows = tasks
    .filter((task) => (totals.get(task.id) ?? 0) > 0 || (task.estimateMinutes && task.status !== "done"))
    .sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0));

  return (
    <Card title="Time per task" aside={`${formatDuration(thisWeek)} this week`}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          Track time on a task, or give tasks an estimate in their editor, to see them here.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.map((task) => {
            const tracked = totals.get(task.id) ?? 0;
            const estimate = task.estimateMinutes ? task.estimateMinutes * MINUTE_MS : 0;
            const over = overEstimate(task, tracked);
            const isRunning = timer.running?.taskId === task.id;
            return (
              <li key={task.id}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-brand"
                  >
                    {task.title}
                  </button>
                  <span className={`shrink-0 text-sm tabular-nums ${over ? "font-medium text-high" : "text-muted"}`}>
                    {formatDuration(tracked)}
                    {estimate > 0 && ` / ${formatDuration(estimate)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      (isRunning ? timer.stop() : timer.start(task.id)).catch((error: Error) => onError(error.message))
                    }
                    aria-label={isRunning ? `Stop the timer on "${task.title}"` : `Start a timer on "${task.title}"`}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-brand hover:bg-brand-soft"
                  >
                    {isRunning ? <Square className="size-3 fill-current" /> : <Play className="size-3.5 fill-current" />}
                  </button>
                </div>
                {estimate > 0 ? (
                  <>
                    <div
                      aria-hidden
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page"
                    >
                      <div
                        className={`h-full rounded-full ${over ? "bg-high" : "bg-brand"}`}
                        style={{ width: `${Math.min(100, (tracked / estimate) * 100)}%` }}
                      />
                    </div>
                    {over && (
                      <p className="mt-1 text-xs text-high">
                        {formatDuration(tracked - estimate)} over the estimate
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">No estimate</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const KIND_ICONS: Record<TimeEntryKind, { icon: typeof Play; label: string }> = {
  timer: { icon: Play, label: "Timer" },
  focus: { icon: Timer, label: "Focus session" },
  manual: { icon: PencilLine, label: "Added by hand" },
};

/** "Today", "Yesterday" or "Mon, Sep 28". */
function dayHeading(key: string, now: number) {
  const today = dayKey(startOfDay(new Date(now)));
  if (key === today) return "Today";
  if (key === dayKey(addDays(fromDayKey(today), -1))) return "Yesterday";
  return fromDayKey(key).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** The most recent entries, grouped by day. Click one to fix it. */
function EntryLog({
  tasks,
  entries,
  now,
  onEdit,
}: {
  tasks: Task[];
  entries: TimeEntry[];
  now: number;
  onEdit: (entry: TimeEntry) => void;
}) {
  const days = entriesByDay(entries.slice(0, LOG_LIMIT));

  return (
    <Card title="Recent entries" aside={entries.length > LOG_LIMIT ? `Latest ${LOG_LIMIT}` : undefined}>
      {days.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No time tracked yet. Start a timer to begin.</p>
      ) : (
        <div className="space-y-4">
          {days.map(({ day, entries: dayEntries }) => (
            <div key={day}>
              <h3 className="mb-1 flex justify-between text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{dayHeading(day, now)}</span>
                <span className="tabular-nums">
                  {formatDuration(dayEntries.reduce((sum, entry) => sum + entryDuration(entry, now), 0))}
                </span>
              </h3>
              <ul className="-mx-2">
                {dayEntries.map((entry) => {
                  const task = tasks.find((t) => t.id === entry.taskId);
                  const { icon: Icon, label } = KIND_ICONS[entry.kind];
                  const isRunning = entry.endedAt === null;
                  const content = (
                    <>
                      <Icon aria-label={label} className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${task ? "font-medium" : "text-muted"}`}>
                          {task ? task.title : "No task"}
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {clockTime(entry.startedAt)} – {entry.endedAt ? clockTime(entry.endedAt) : "now"}
                          {entry.note && ` · ${entry.note}`}
                        </span>
                      </span>
                      <span className={`shrink-0 text-sm tabular-nums ${isRunning ? "font-medium text-brand" : ""}`}>
                        {isRunning ? "Running" : formatDuration(entryDuration(entry, now))}
                      </span>
                    </>
                  );
                  return (
                    <li key={entry.id}>
                      {isRunning ? (
                        // A running timer is stopped with its Stop button, then it can be edited.
                        <div className="flex items-center gap-3 px-2 py-2">{content}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onEdit(entry)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-page focus-visible:bg-page focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
