"use client";

import { AlarmClock, CircleCheck, CircleDashed, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { PeriodChart, usePeriodParam } from "@/components/charts/period-chart";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { useTaskList } from "@/hooks/tasks-context";
import { useCountUp } from "@/hooks/use-count-up";
import { completedPer, needsAttention, openByPriority, openByTag, summarize } from "@/lib/dashboard";
import { PERIODS } from "@/lib/periods";
import { PRIORITY_LABELS } from "@/lib/task-helpers";
import { GOAL_COLOR_CLASSES, goalProgress, sortGoals, targetStatus } from "@/lib/goals";
import type { Goal, Priority, Task } from "@/lib/types";

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
  const { tasks, goals, loadState, loadError, reload, deleteTask, saveTask, now } = useTaskList();
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
        <div className="rounded-xl border border-line bg-surface p-10 text-center">
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
              delay={5 * STAGGER_MS}
              rows={openByPriority(tasks).map(({ priority, count }) => ({
                label: PRIORITY_LABELS[priority],
                count,
                fill: PRIORITY_FILL[priority],
              }))}
            />
            <Breakdown
              title="Open tasks by tag"
              delay={6 * STAGGER_MS}
              rows={openByTag(tasks).map(({ tag, count }) => ({ label: tag, count, fill: "bg-tag" }))}
            />
          </div>
          <GoalsSummary goals={goals} tasks={tasks} now={now} delay={7 * STAGGER_MS} />
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

// Card effects. "motion-reduce:" turns the movement off for people who asked their
// device for less motion.
// Fade in while sliding up (see globals.css). Used by the 5 top cards and the two
// "Open tasks by ..." cards.
const CARD_ENTRANCE = "animate-card-in motion-reduce:animate-none";

/**
 * The 5 top cards are links: on hover they also lift a little and get a shadow and a
 * blue border, and they need a focus ring. (Only clickable cards lift, so the two
 * "Open tasks by ..." cards don't.)
 */
const CARD_EFFECTS =
  "group block rounded-xl border border-line bg-surface outline-none transition duration-200 " +
  "hover:-translate-y-1 hover:border-brand hover:shadow-lg hover:shadow-brand/10 " +
  "focus-visible:ring-2 focus-visible:ring-brand " +
  "motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
  CARD_ENTRANCE;

/** Cards come in one after another, this far apart. */
const STAGGER_MS = 80;

/** A white box with a heading, used by every part of the dashboard. */
function Card({
  title,
  aside,
  id,
  className = "",
  delay,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  id?: string;
  /** Extra classes, e.g. CARD_ENTRANCE. */
  className?: string;
  /** How long to wait before the fade-in animation starts, in milliseconds. */
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`h-full scroll-mt-20 rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}
      style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}
    >
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
  const percent = useCountUp(summary.percentDone);
  const tiles = [
    { label: "To do", value: summary.todo, href: "/tasks#status-todo", icon: CircleDashed },
    { label: "In progress", value: summary.inProgress, href: "/tasks#status-in_progress", icon: Clock },
    { label: "Done", value: summary.done, href: "/tasks#status-done", icon: CircleCheck },
    // Overdue tasks are listed further down this page.
    { label: "Overdue", value: summary.overdue, href: "#needs-attention", icon: AlarmClock },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
      <Link
        href="/tasks"
        // Screen readers get the final numbers, not the counting ones.
        aria-label={`Tasks done: ${summary.percentDone}%, ${summary.done} of ${summary.total}. Show all tasks`}
        className={`${CARD_EFFECTS} col-span-2 p-5`}
      >
        <p className="text-sm text-muted">Tasks done</p>
        <p className="mt-1 text-5xl font-semibold tabular-nums">{percent}%</p>
        <div
          role="progressbar"
          aria-label="Tasks done"
          aria-valuenow={summary.percentDone}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-2 overflow-hidden rounded-full bg-page"
        >
          {/* Grows in from the left, then slides smoothly when the number changes. */}
          <div
            className="h-full origin-left animate-bar-grow rounded-full bg-brand transition-[width] duration-700 motion-reduce:animate-none motion-reduce:transition-none"
            style={{ width: `${summary.percentDone}%`, animationDelay: "150ms" }}
          />
        </div>
        <p className="mt-2 text-sm text-muted">
          {summary.done} of {summary.total} {summary.total === 1 ? "task" : "tasks"}
        </p>
      </Link>
      {tiles.map((tile, index) => (
        <StatTile key={tile.label} {...tile} delay={(index + 1) * STAGGER_MS} />
      ))}
    </div>
  );
}

function StatTile({
  label,
  value,
  href,
  icon: Icon,
  delay,
}: {
  label: string;
  value: number;
  href: string;
  icon: LucideIcon;
  /** How long to wait before fading in, in milliseconds. */
  delay: number;
}) {
  const shown = useCountUp(value);
  const alert = label === "Overdue" && value > 0;

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}`}
      className={`${CARD_EFFECTS} p-4`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="flex items-center gap-1.5 text-sm text-muted">
        {/* The icon grows a little when the card is hovered. */}
        <Icon
          aria-hidden
          className={`size-4 transition-transform duration-200 group-hover:scale-125 motion-reduce:transition-none ${
            alert ? "text-high" : "text-brand"
          }`}
        />
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{shown}</p>
    </Link>
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

/** Tasks completed per day, week or month (the chart is shared with the Time page). */
function CompletedChart({ tasks, now }: { tasks: Task[]; now: number }) {
  const [period, choose] = usePeriodParam("/dashboard");
  const { settings } = useTaskList();
  const columns = completedPer(tasks, now, period, settings.weekStartsOn);
  const total = columns.reduce((sum, column) => sum + column.value, 0);

  return (
    <Card title="Completed" aside={`${total} in the last ${PERIODS[period].span}`}>
      <PeriodChart
        columns={columns}
        period={period}
        onPeriodChange={choose}
        formatValue={String}
        valueLabel="done"
        description="Tasks completed"
        weekStartsOn={settings.weekStartsOn}
      />
    </Card>
  );
}

/**
 * Horizontal bars: one row per group with its label and count. It fades in like the
 * top cards, the numbers count up and the bars grow in one after another. It isn't
 * clickable, so unlike the top cards it doesn't lift on hover.
 */
function Breakdown({
  title,
  rows,
  delay,
}: {
  title: string;
  rows: { label: string; count: number; fill: string }[];
  /** How long to wait before the card fades in, in milliseconds. */
  delay: number;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const shownTotal = useCountUp(total);

  return (
    <Card
      title={title}
      aside={
        <>
          {/* Screen readers get the final number, not the counting one. */}
          <span aria-hidden className="tabular-nums">{shownTotal}</span>
          <span className="sr-only">{total}</span> open
        </>
      }
      className={CARD_ENTRANCE}
      delay={delay}
    >
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No open tasks. Everything is done!</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <BreakdownRow
              key={row.label}
              {...row}
              max={max}
              // Each bar starts growing a little after the card appears, one row after another.
              delay={delay + 150 + index * 60}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BreakdownRow({
  label,
  count,
  fill,
  max,
  delay,
}: {
  label: string;
  count: number;
  fill: string;
  max: number;
  delay: number;
}) {
  const shown = useCountUp(count);

  return (
    <li className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
      <span className="truncate text-ink" title={label}>
        {label}
      </span>
      {/* The bar grows in from the left (then slides when the number changes) and is
          rounded only at its end. */}
      <span aria-hidden className="h-2.5 rounded-r bg-page">
        <span
          className={`block h-full origin-left animate-bar-grow rounded-r transition-[width] duration-700 motion-reduce:animate-none motion-reduce:transition-none ${fill}`}
          style={{ width: `${(count / max) * 100}%`, animationDelay: `${delay}ms` }}
        />
      </span>
      <span className="text-right font-medium tabular-nums text-ink">
        <span aria-hidden>{shown}</span>
        <span className="sr-only">{count}</span>
      </span>
    </li>
  );
}

/** Each goal with its progress bar. Every goal links to its card on the Goals page. */
function GoalsSummary({ goals, tasks, now, delay }: { goals: Goal[]; tasks: Task[]; now: number; delay: number }) {
  return (
    <Card
      title="Goals"
      aside={
        <Link href="/goals" className="font-medium text-brand hover:underline">
          See all
        </Link>
      }
      className={CARD_ENTRANCE}
      delay={delay}
    >
      {goals.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          No goals yet.{" "}
          <Link href="/goals" className="font-medium text-brand hover:underline">
            Create one
          </Link>{" "}
          to track something bigger than a single task.
        </p>
      ) : (
        <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          {sortGoals(goals, tasks).map((goal, index) => (
            <GoalSummaryRow key={goal.id} goal={goal} tasks={tasks} now={now} delay={delay + 150 + index * 60} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalSummaryRow({ goal, tasks, now, delay }: { goal: Goal; tasks: Task[]; now: number; delay: number }) {
  const progress = goalProgress(goal, tasks);
  const target = targetStatus(goal, progress.complete, now);
  const percent = useCountUp(progress.percent);

  return (
    <li>
      <Link
        href={`/goals#goal-${goal.id}`}
        className="-m-2 block rounded-lg p-2 outline-none hover:bg-page focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${GOAL_COLOR_CLASSES[goal.color].fill}`} />
            <span className="truncate font-medium">{goal.title}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums">
            <span aria-hidden>{percent}%</span>
            <span className="sr-only">{progress.percent}% done</span>
          </span>
        </span>
        <span aria-hidden className="mt-2 block h-2 overflow-hidden rounded-full bg-page">
          <span
            className={`block h-full origin-left animate-bar-grow rounded-full transition-[width] duration-700 motion-reduce:animate-none motion-reduce:transition-none ${GOAL_COLOR_CLASSES[goal.color].fill}`}
            style={{ width: `${progress.percent}%`, animationDelay: `${delay}ms` }}
          />
        </span>
        <span className="mt-1 block text-xs text-muted">
          {progress.complete
            ? "Goal reached"
            : `${progress.done} of ${progress.total} ${progress.total === 1 ? "task" : "tasks"}`}
          {target && !progress.complete && (
            <span className={target.late ? "font-medium text-high" : ""}> · {target.text}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
