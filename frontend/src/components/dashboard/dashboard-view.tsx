"use client";

import { AlarmClock, CircleCheck, CircleDashed, Clock } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { useTaskList } from "@/hooks/tasks-context";
import {
  completedPer,
  needsAttention,
  openByPriority,
  openByTag,
  PERIODS,
  summarize,
  type Period,
} from "@/lib/dashboard";
import { PRIORITY_LABELS } from "@/lib/task-helpers";
import type { Priority, Task } from "@/lib/types";

const PRIORITY_FILL: Record<Priority, string> = { high: "bg-high", mid: "bg-mid", low: "bg-low" };

/** "Sep 30" */
const shortDate = (date: Date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
/** "5:00 PM" */
const clock = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/**
 * The Dashboard page: how your tasks are going at a glance. Everything is worked
 * out from the tasks the app already loaded (see lib/dashboard.ts).
 */
export function DashboardView() {
  const { tasks, loadState, loadError, reload, deleteTask, saveTask, now } = useTaskList();
  const [editing, setEditing] = useState<Task | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  function confirmDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setEditing(null);
    deleteTask(task.id).catch((error: Error) => setToast(error.message));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-5 text-2xl font-semibold">Dashboard</h1>

      {loadState === "loading" && <LoadingSkeleton label="Loading dashboard" />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" && tasks.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-10 text-center">
          <h2 className="text-lg font-semibold">No tasks yet</h2>
          <p className="mt-1 text-sm text-muted">Add a few tasks and your progress will show up here.</p>
          <Link
            href="/tasks"
            className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Go to Tasks
          </Link>
        </div>
      )}
      {loadState === "ready" && tasks.length > 0 && (
        <div className="space-y-5">
          <SummaryCards tasks={tasks} now={now} />
          <div className="grid gap-5 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <NeedsAttention tasks={tasks} now={now} onOpen={setEditing} />
            </div>
            <div className="lg:col-span-3">
              <CompletedChart tasks={tasks} now={now} />
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Breakdown
              title="Open tasks by priority"
              rows={openByPriority(tasks).map(({ priority, count }) => ({
                label: PRIORITY_LABELS[priority],
                count,
                fill: PRIORITY_FILL[priority],
              }))}
            />
            <Breakdown
              title="Open tasks by tag"
              rows={openByTag(tasks).map(({ tag, count }) => ({ label: tag, count, fill: "bg-tag" }))}
            />
          </div>
        </div>
      )}

      {editing && (
        <TaskDialog
          key={editing.id}
          task={editing}
          defaultStatus={editing.status}
          onSave={async (draft) => {
            await saveTask(editing, draft);
          }}
          onDelete={() => confirmDelete(editing)}
          onClose={() => setEditing(null)}
        />
      )}
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

/** A white box with a heading, used by every part of the dashboard. */
function Card({
  title,
  aside,
  id,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="h-full scroll-mt-20 rounded-xl border border-line bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {aside && <p className="text-sm text-muted">{aside}</p>}
      </div>
      {children}
    </section>
  );
}

/** The big "% done" number plus one small card per status. Each card links to its tasks. */
function SummaryCards({ tasks, now }: { tasks: Task[]; now: number }) {
  const summary = summarize(tasks, now);
  const tiles = [
    { label: "To do", value: summary.todo, href: "/tasks#status-todo", icon: CircleDashed },
    { label: "In progress", value: summary.inProgress, href: "/tasks#status-in_progress", icon: Clock },
    { label: "Done", value: summary.done, href: "/tasks#status-done", icon: CircleCheck },
    // Overdue tasks are listed further down this page.
    { label: "Overdue", value: summary.overdue, href: "#needs-attention", icon: AlarmClock },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <div className="col-span-2 rounded-xl border border-line bg-white p-5">
        <p className="text-sm text-muted">Tasks done</p>
        <p className="mt-1 text-5xl font-semibold">{summary.percentDone}%</p>
        <div
          role="progressbar"
          aria-label="Tasks done"
          aria-valuenow={summary.percentDone}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-2 overflow-hidden rounded-full bg-page"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${summary.percentDone}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">
          {summary.done} of {summary.total} {summary.total === 1 ? "task" : "tasks"}
        </p>
      </div>
      {tiles.map(({ label, value, href, icon: Icon }) => (
        <Link
          key={label}
          href={href}
          className="rounded-xl border border-line bg-white p-4 outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-brand"
        >
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Icon
              aria-hidden
              className={`size-4 ${label === "Overdue" && value > 0 ? "text-high" : "text-brand"}`}
            />
            {label}
          </p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </Link>
      ))}
    </div>
  );
}

/** Unfinished tasks that are overdue, due today, or due in the next 7 days. */
function NeedsAttention({ tasks, now, onOpen }: { tasks: Task[]; now: number; onOpen: (task: Task) => void }) {
  const { overdue, today, thisWeek } = needsAttention(tasks, now);
  const groups = [
    { title: "Overdue", tasks: overdue, when: (t: Task) => `Was due ${shortDate(new Date(t.dueAt!))}, ${clock(t.dueAt!)}` },
    { title: "Due today", tasks: today, when: (t: Task) => `Due ${clock(t.dueAt!)}` },
    {
      title: "Next 7 days",
      tasks: thisWeek,
      when: (t: Task) =>
        `Due ${new Date(t.dueAt!).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${clock(t.dueAt!)}`,
    },
  ];
  const nothing = groups.every((group) => group.tasks.length === 0);

  return (
    <Card title="Needs attention" id="needs-attention">
      {nothing ? (
        <p className="py-6 text-center text-sm text-muted">
          Nothing is overdue or due in the next 7 days.
        </p>
      ) : (
        <div className="space-y-4">
          {groups
            .filter((group) => group.tasks.length > 0)
            .map((group) => (
              <div key={group.title}>
                <h3
                  className={`mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
                    group.title === "Overdue" ? "text-high" : "text-muted"
                  }`}
                >
                  {group.title === "Overdue" && <AlarmClock aria-hidden className="size-3.5" />}
                  {group.title} ({group.tasks.length})
                </h3>
                <ul>
                  {group.tasks.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(task)}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-page focus-visible:bg-page focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${PRIORITY_FILL[task.priority]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{task.title}</span>
                          <span className="block text-xs text-muted">
                            {group.when(task)} · {PRIORITY_LABELS[task.priority]} priority
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </Card>
  );
}

/** The label under a column: "28" (day), "9/21" (week, its first day) or "Sep" (month). */
function columnLabel(start: Date, period: Period): string {
  if (period === "day") return String(start.getDate());
  if (period === "week") return `${start.getMonth() + 1}/${start.getDate()}`;
  return start.toLocaleDateString("en-US", { month: "short" });
}

/** The full name of a column, for the tooltip and the screen-reader table. */
function columnName(start: Date, period: Period): string {
  if (period === "day") {
    return start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (period === "week") {
    return `Week of ${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const CAPTIONS: Record<Period, string> = {
  day: "Day of the month.",
  week: "Weeks start on Monday; each column shows the week's first day.",
  month: "Month.",
};

/**
 * A column chart of tasks completed per day, week or month (the Day / Week / Month
 * switch above it). One series, so no legend (the title names it). Hover a column for
 * its number; screen readers get the same numbers as a table.
 */
function CompletedChart({ tasks, now }: { tasks: Task[]; now: number }) {
  const searchParams = useSearchParams();
  // The chosen period lives in the address (?per=week), like ?view= on the Tasks page.
  const per = searchParams.get("per");
  const period: Period = per === "week" || per === "month" ? per : "day";

  function choose(next: Period) {
    const params = new URLSearchParams(searchParams);
    if (next === "day") params.delete("per");
    else params.set("per", next);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : "/dashboard");
  }

  const columns = completedPer(tasks, now, period);
  const total = columns.reduce((sum, column) => sum + column.count, 0);
  // The top of the scale: at least 1, so an empty chart still has an axis.
  const max = Math.max(1, ...columns.map((column) => column.count));
  const busiest = columns.reduce((best, column) => (column.count > best.count ? column : best), columns[0]);
  const { span } = PERIODS[period];

  return (
    <Card title="Completed" aside={`${total} in the last ${span}`}>
      {/* The filter sits in one row above the chart. */}
      <div role="group" aria-label="Group by" className="mb-4 inline-flex rounded-lg bg-page p-1 ring-1 ring-line">
        {(Object.keys(PERIODS) as Period[]).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={period === option}
            onClick={() => choose(option)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              period === option ? "bg-brand text-white shadow-sm" : "text-ink hover:bg-white"
            }`}
          >
            {PERIODS[option].label}
          </button>
        ))}
      </div>

      <div aria-hidden className="flex h-48 gap-2">
        {/* Y axis: just the top value and zero, so the columns can be read. */}
        <div className="flex flex-col justify-between text-right text-xs text-muted">
          <span>{max}</span>
          {/* Moved down half a line so it sits level with the baseline. */}
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex flex-1 items-end border-b border-line pb-0">
          {/* A faint line at the top value. */}
          <div className="pointer-events-none absolute inset-x-0 top-2 border-t border-dashed border-line" />
          {columns.map(({ start, count }, index) => {
            const isCurrent = index === columns.length - 1;
            // Keep the tooltip inside the card near the edges.
            const tipPosition =
              index < 2 ? "left-0" : index > columns.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
            // Week labels ("12/28") are too wide for every column on a phone, so show every
            // other one there, always including the current week.
            const hideOnPhone = period === "week" && (columns.length - 1 - index) % 2 === 1;
            return (
              <div key={start.getTime()} className="group relative flex h-full flex-1 flex-col justify-end">
                {/* The column: at most 24px wide, rounded only at the top. */}
                <div className="flex h-[calc(100%-0.5rem)] items-end justify-center">
                  <div
                    className={`w-full max-w-6 rounded-t-[4px] ${count > 0 ? "bg-brand" : ""} group-hover:opacity-80`}
                    style={{ height: `${(count / max) * 100}%` }}
                  />
                </div>
                {/* Only the busiest column gets its number printed; the rest are in the tooltip. */}
                {count > 0 && start === busiest.start && (
                  <span
                    className="absolute inset-x-0 text-center text-xs font-medium text-ink"
                    style={{ bottom: `calc(${(count / max) * 100}% - 0.25rem)` }}
                  >
                    {count}
                  </span>
                )}
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block ${tipPosition}`}
                >
                  {columnName(start, period)}: {count} done
                </span>
                <span
                  className={`absolute -bottom-6 inset-x-0 whitespace-nowrap text-center text-[11px] ${
                    isCurrent ? "font-semibold text-ink" : "text-muted"
                  } ${hideOnPhone ? "hidden sm:block" : ""}`}
                >
                  {columnLabel(start, period)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-8 text-xs text-muted">{CAPTIONS[period]} Hover a column for details.</p>
      {/* The same numbers for screen readers. */}
      <table className="sr-only">
        <caption>Tasks completed per {period}, last {span}</caption>
        <thead>
          <tr>
            <th scope="col">{PERIODS[period].label}</th>
            <th scope="col">Completed</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(({ start, count }) => (
            <tr key={start.getTime()}>
              <td>{columnName(start, period)}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Horizontal bars: one row per group with its label and count. */
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; fill: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card title={title} aside={`${total} open`}>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No open tasks. Everything is done!</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.label} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
              <span className="truncate text-ink" title={row.label}>
                {row.label}
              </span>
              {/* The bar grows from the left and is rounded only at its end. */}
              <span aria-hidden className="h-2.5 rounded-r bg-page">
                <span
                  className={`block h-full rounded-r ${row.fill}`}
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </span>
              <span className="text-right font-medium text-ink">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
