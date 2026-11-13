"use client";

import { ArrowRight, CalendarCheck, Plus, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DoneCheckbox, TaskTitleButton, TeamBadge } from "@/components/my-work/my-work-view";
import { PriorityBadge, TaskDate } from "@/components/tasks/badges";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { useAuth } from "@/hooks/auth-context";
import { useTaskList } from "@/hooks/tasks-context";
import { api } from "@/lib/api";
import { formatMinutes, realisticMinutes, worthMentioning, type EstimateAccuracy } from "@/lib/estimates";
import { myWorkItems, type MyWorkItem } from "@/lib/my-work";
import { finishSubtasksFirst, hasUnfinishedSubtasks } from "@/lib/task-helpers";
import {
  dayLoad,
  formatDay,
  otherOpenTasks,
  plannedDays,
  suggestions,
  tasksToMove,
  todayKey,
  todaysPlan,
  tomorrowKey,
  type Suggestion,
} from "@/lib/today";
import type { MyWorkGroup, PlanEntry, Task } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";

const REASON_LABELS: Record<Suggestion["reason"], string> = {
  leftover: "Left over",
  overdue: "Overdue",
  "due-today": "Due today",
  started: "Started",
};

/**
 * The Today page ("Plan my day"): pick what you'll work on today, across all your teams,
 * and see whether it fits in the hours you have. Estimates are corrected by your history
 * (lib/estimates.ts), so the total is what the day will REALLY take.
 * It loads its own data (GET /my-work and GET /plan), like the My work page.
 */
export function TodayView() {
  const router = useRouter();
  const { team: currentTeam, switchTeam } = useAuth();
  const { now, reload, settings, estimates } = useTaskList();
  const [groups, setGroups] = useState<MyWorkGroup[]>([]);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.myWork(), api.plan()]).then(
      ([loadedGroups, loadedEntries]) => {
        if (cancelled) return;
        setGroups(loadedGroups);
        setEntries(loadedEntries);
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
  }, [attempt]);

  const items = useMemo(() => myWorkItems(groups), [groups]);
  const today = todayKey(now);
  const planned = todaysPlan(items, entries, now);
  const suggested = suggestions(items, entries, now);
  const others = otherOpenTasks(items, entries, now);
  const days = plannedDays(entries);
  const load = dayLoad(planned, estimates);
  const overBy = load.realistic - settings.workdayMinutes;
  const toMove = overBy > 0 ? tasksToMove(planned, overBy, estimates, now) : [];

  /** Something went wrong: say so, and load the real state again. */
  function failed(error: unknown) {
    setToast((error as Error).message);
    setAttempt((n) => n + 1);
  }

  /** Plans tasks for a day (or takes them out of the plan with day = null). */
  async function setDay(changed: MyWorkItem[], day: string | null) {
    const ids = new Set(changed.map(({ task }) => task.id));
    // Show it right away.
    setEntries((list) => [
      ...list.filter((entry) => !ids.has(entry.taskId)),
      ...(day === null ? [] : changed.map(({ task, team }) => ({ taskId: task.id, teamId: team.id, day }))),
    ]);
    try {
      await Promise.all(changed.map(({ task }) => (day === null ? api.unplanTask(task.id) : api.planTask(task.id, day))));
    } catch (error) {
      failed(error);
    }
  }

  async function toggleDone({ task, team }: MyWorkItem) {
    const status = task.status === "done" ? "todo" : "done";
    if (status === "done" && hasUnfinishedSubtasks(task)) {
      setToast(finishSubtasksFirst(task));
      return;
    }
    const swap = (next: Task) =>
      setGroups((list) =>
        list.map((group) =>
          group.team.id === team.id ? { ...group, tasks: group.tasks.map((t) => (t.id === next.id ? next : t)) } : group,
        ),
      );
    swap({ ...task, status, completedAt: status === "done" ? new Date().toISOString() : null });
    try {
      swap(await api.updateTaskInTeam(team.id, task.id, { status }));
      // The rest of the app holds the current team's tasks: keep them in step.
      if (team.id === currentTeam.id) reload();
    } catch (error) {
      swap(task);
      setToast((error as Error).message);
    }
  }

  function openTask({ task, team }: MyWorkItem) {
    if (team.id !== currentTeam.id) switchTeam(team.id);
    router.push(`/tasks?open=${task.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-1 text-sm text-muted">
          {new Date(now).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}. Pick
          what you&apos;ll work on today, from all your teams, and see if it fits.
        </p>
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading your day" />}
      {loadState === "error" && (
        <LoadError
          message={loadError}
          onRetry={() => {
            setLoadState("loading");
            setAttempt((n) => n + 1);
          }}
        />
      )}

      {loadState === "ready" && (
        <div className="space-y-5">
          <DayLoadCard
            load={load}
            workdayMinutes={settings.workdayMinutes}
            toMove={toMove}
            onMove={() => setDay(toMove, tomorrowKey(now))}
          />

          <section aria-labelledby="todays-plan" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
            <h2 id="todays-plan" className="font-semibold">
              Today&apos;s plan <span className="font-normal text-muted">({planned.length})</span>
            </h2>
            {planned.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                Nothing planned yet. Add tasks from the suggestions below, or from all your open tasks.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {planned.map((item) => (
                  <TodayRow
                    key={item.task.id}
                    item={item}
                    estimates={estimates}
                    onToggle={() => toggleDone(item)}
                    onOpen={() => openTask(item)}
                  >
                    {item.task.status !== "done" && (
                      <RowButton
                        icon={ArrowRight}
                        label="Tomorrow"
                        ariaLabel={`Move "${item.task.title}" to tomorrow`}
                        onClick={() => setDay([item], tomorrowKey(now))}
                      />
                    )}
                    <RowButton
                      icon={X}
                      ariaLabel={`Take "${item.task.title}" out of today's plan`}
                      onClick={() => setDay([item], null)}
                    />
                  </TodayRow>
                ))}
              </ul>
            )}
          </section>

          {suggested.length > 0 && (
            <section aria-labelledby="suggested" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
              <h2 id="suggested" className="font-semibold">
                Suggested for today <span className="font-normal text-muted">({suggested.length})</span>
              </h2>
              <p className="mt-0.5 text-sm text-muted">Left over from an earlier day, overdue, due today or already started.</p>
              <ul className="mt-2 divide-y divide-line">
                {suggested.map(({ item, reason, plannedFor }) => (
                  <TodayRow
                    key={item.task.id}
                    item={item}
                    estimates={estimates}
                    note={reason === "leftover" && plannedFor ? `Left over from ${formatDay(plannedFor)}` : REASON_LABELS[reason]}
                    noteUrgent={reason === "overdue"}
                    onToggle={() => toggleDone(item)}
                    onOpen={() => openTask(item)}
                  >
                    <AddButton title={item.task.title} onClick={() => setDay([item], today)} />
                  </TodayRow>
                ))}
              </ul>
            </section>
          )}

          {others.length > 0 && (
            // <details> opens and closes by itself, keyboard included.
            <details className="rounded-xl border border-line bg-surface p-4 sm:p-5">
              <summary className="cursor-pointer font-semibold">
                All my other open tasks <span className="font-normal text-muted">({others.length})</span>
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {others.map((item) => {
                  const plannedFor = days.get(item.task.id);
                  return (
                    <TodayRow
                      key={item.task.id}
                      item={item}
                      estimates={estimates}
                      note={plannedFor ? `Planned for ${formatDay(plannedFor)}` : undefined}
                      onToggle={() => toggleDone(item)}
                      onOpen={() => openTask(item)}
                    >
                      <AddButton title={item.task.title} onClick={() => setDay([item], today)} />
                    </TodayRow>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      )}

      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

/** How full the day is: the realistic total against the hours you have. */
function DayLoadCard({
  load,
  workdayMinutes,
  toMove,
  onMove,
}: {
  load: ReturnType<typeof dayLoad>;
  workdayMinutes: number;
  toMove: MyWorkItem[];
  onMove: () => void;
}) {
  const over = load.realistic > workdayMinutes;
  const share = Math.min(1, load.realistic / workdayMinutes);
  const corrected = load.estimated > 0 && worthMentioning(load.realistic / load.estimated);

  return (
    <section aria-labelledby="day-load" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="day-load" className="font-semibold">
          <span className="text-2xl tabular-nums">{formatMinutes(load.realistic)}</span>{" "}
          <span className="font-normal text-muted">planned of {formatMinutes(workdayMinutes)}</span>
        </h2>
        <Link href="/settings#planning" className="text-sm text-brand hover:underline">
          Change your hours
        </Link>
      </div>

      {/* role="meter": screen readers announce it as "x of y". */}
      <div
        role="meter"
        aria-label="How full your day is"
        aria-valuemin={0}
        aria-valuemax={workdayMinutes}
        aria-valuenow={Math.min(load.realistic, workdayMinutes)}
        aria-valuetext={`${formatMinutes(load.realistic)} of ${formatMinutes(workdayMinutes)}`}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-page"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${over ? "bg-high" : "bg-brand"}`}
          style={{ width: `${share * 100}%` }}
        />
      </div>

      <div className="mt-3 space-y-1 text-sm text-muted">
        {corrected && (
          <p>
            You estimated {formatMinutes(load.estimated)}. Based on your history, that&apos;s about{" "}
            <strong className="font-medium text-ink">{formatMinutes(load.realistic)}</strong>.
          </p>
        )}
        {load.withoutEstimate > 0 && (
          <p>
            {load.withoutEstimate === 1 ? "1 task has" : `${load.withoutEstimate} tasks have`} no estimate, so{" "}
            {load.withoutEstimate === 1 ? "it isn't" : "they aren't"} counted. Add one in the task editor.
          </p>
        )}
      </div>

      {over && (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-high-bg px-4 py-3">
          <TriangleAlert className="size-5 shrink-0 text-high" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ink">
            You&apos;ve planned {formatMinutes(load.realistic)} into a {formatMinutes(workdayMinutes)} day.
            {toMove.length > 0 &&
              ` Move ${toMove.map((item) => `"${item.task.title}"`).join(", ")} to tomorrow?`}
            {toMove.length === 0 && " Everything left is due today, so take something off the list or ask for help."}
          </p>
          {toMove.length > 0 && (
            <button
              type="button"
              onClick={onMove}
              className="inline-flex items-center gap-2 rounded-lg bg-high px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <ArrowRight className="size-4" aria-hidden />
              Move {toMove.length === 1 ? "it" : `${toMove.length} tasks`} to tomorrow
            </button>
          )}
        </div>
      )}

      {load.realistic === 0 && load.withoutEstimate === 0 && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="size-4 text-brand" aria-hidden />
          Add tasks to today&apos;s plan to see how full your day is.
        </p>
      )}
    </section>
  );
}

/** One task on the page: checkbox, title, badges, its (corrected) estimate, and buttons. */
function TodayRow({
  item,
  estimates,
  note,
  noteUrgent = false,
  onToggle,
  onOpen,
  children,
}: {
  item: MyWorkItem;
  estimates: EstimateAccuracy;
  /** A short label, like "Overdue" or "Planned for Mon 16 Nov". */
  note?: string;
  noteUrgent?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  /** The buttons on the right. */
  children: React.ReactNode;
}) {
  const { task, team } = item;
  const done = task.status === "done";
  const realistic = realisticMinutes(task, estimates);

  return (
    <li className="flex items-start gap-3 py-3">
      <DoneCheckbox task={task} onToggle={onToggle} />
      <div className="min-w-0 flex-1">
        <TaskTitleButton task={task} team={team} onOpen={onOpen} />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          {note && (
            <span
              className={`rounded-md px-2 py-0.5 font-medium ${noteUrgent ? "bg-high-bg text-high" : "bg-page text-muted"}`}
            >
              {note}
            </span>
          )}
          <TeamBadge team={team} />
          {!done && <PriorityBadge priority={task.priority} />}
          {task.dueAt && !done && <TaskDate task={task} kind="due" showLabel />}
          {task.estimateMinutes !== null && realistic !== null && (
            <span className="text-muted">
              {realistic !== task.estimateMinutes ? (
                <>
                  <span className="font-medium text-ink">~{formatMinutes(realistic)}</span> (you said{" "}
                  {formatMinutes(task.estimateMinutes)})
                </>
              ) : (
                formatMinutes(task.estimateMinutes)
              )}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </li>
  );
}

function RowButton({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
}: {
  icon: typeof X;
  /** Visible text (only from the sm breakpoint up; phones get just the icon). */
  label?: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className="inline-flex items-center gap-1.5 rounded-lg p-2 text-sm text-muted outline-none hover:bg-page hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icon className="size-4" aria-hidden />
      {label && <span className="hidden sm:inline">{label}</span>}
    </button>
  );
}

function AddButton({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Add "${title}" to today's plan`}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand ring-1 ring-line outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Plus className="size-4" aria-hidden />
      <span className="hidden sm:inline">Today</span>
    </button>
  );
}
