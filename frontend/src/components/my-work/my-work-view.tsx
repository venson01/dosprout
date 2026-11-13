"use client";

import { Check, ChevronRight, Sprout, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoalBadge, PriorityBadge, TaskDate } from "@/components/tasks/badges";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { useAuth } from "@/hooks/auth-context";
import { useTaskList } from "@/hooks/tasks-context";
import { api } from "@/lib/api";
import { DUE_GROUPS, groupByDue, myWorkItems, recentlyDone, type MyWorkItem } from "@/lib/my-work";
import { finishSubtasksFirst, hasUnfinishedSubtasks } from "@/lib/task-helpers";
import type { MyWorkGroup, Task, TeamSummary } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";

/** "all" or a team id: which team's tasks to show. */
type TeamFilter = "all" | number;

/**
 * The "My work" page: everything on your plate in ALL your teams at once, grouped by when
 * it's due. Your personal tasks, plus the tasks assigned to you in each team.
 * It loads its own data (GET /my-work), because the rest of the app only holds the
 * current team's tasks.
 */
export function MyWorkView() {
  const router = useRouter();
  const { team: currentTeam, switchTeam } = useAuth();
  // `now` ticks when tasks start or fall due; `reload` refreshes the current team's data.
  const { now, reload } = useTaskList();
  const [groups, setGroups] = useState<MyWorkGroup[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<TeamFilter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    let cancelled = false;
    api.myWork().then(
      (loaded) => {
        if (cancelled) return;
        setGroups(loaded);
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
  const shown = filter === "all" ? items : items.filter((item) => item.team.id === filter);
  const byDue = groupByDue(shown, now);
  const done = recentlyDone(shown, now);
  const openCount = shown.filter((item) => item.task.status !== "done").length;
  // Teams that have any of your tasks, for the filter buttons. (Not only open ones: finishing
  // a team's last task shouldn't make its button, which may be selected, disappear.)
  const teamsWithWork = groups.filter((group) => group.tasks.length > 0);

  /** Swaps in a changed task. */
  function replaceTask(teamId: number, task: Task) {
    setGroups((list) =>
      list.map((group) =>
        group.team.id === teamId ? { ...group, tasks: group.tasks.map((t) => (t.id === task.id ? task : t)) } : group,
      ),
    );
  }

  async function toggleDone({ task, team }: MyWorkItem) {
    const status = task.status === "done" ? "todo" : "done";
    if (status === "done" && hasUnfinishedSubtasks(task)) {
      setToast(finishSubtasksFirst(task));
      return;
    }
    // Show it right away; put it back if saving fails.
    replaceTask(team.id, { ...task, status, completedAt: status === "done" ? new Date().toISOString() : null });
    try {
      replaceTask(team.id, await api.updateTaskInTeam(team.id, task.id, { status }));
      // The rest of the app holds the current team's tasks: keep them in step.
      if (team.id === currentTeam.id) reload();
    } catch (error) {
      replaceTask(team.id, task);
      setToast((error as Error).message);
    }
  }

  /** Opens the task's editor on the Tasks page, in its own team. */
  function openTask({ task, team }: MyWorkItem) {
    if (team.id !== currentTeam.id) switchTeam(team.id);
    router.push(`/tasks?open=${task.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">My work</h1>
        <p className="mt-1 text-sm text-muted">
          Everything on your plate in one place: your personal tasks, plus what&apos;s assigned to you in your teams.
        </p>
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading your work" />}
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
        <>
          {teamsWithWork.length > 1 && (
            <TeamFilterBar groups={teamsWithWork} filter={filter} onChange={setFilter} />
          )}

          {openCount === 0 ? (
            <EmptyState filtered={filter !== "all"} />
          ) : (
            <div className="space-y-5">
              {DUE_GROUPS.filter(({ key }) => byDue[key].length > 0).map(({ key, label }) => (
                <section key={key} aria-labelledby={`due-${key}`} className="rounded-xl border border-line bg-surface p-4 sm:p-5">
                  <h2 id={`due-${key}`} className={`font-semibold ${key === "overdue" ? "text-high" : ""}`}>
                    {label} <span className="font-normal text-muted">({byDue[key].length})</span>
                  </h2>
                  <ul className="mt-2 divide-y divide-line">
                    {byDue[key].map((item) => (
                      <WorkRow key={item.task.id} item={item} onToggle={toggleDone} onOpen={openTask} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {done.length > 0 && (
            // <details> opens and closes by itself, keyboard included.
            <details className="mt-5 rounded-xl border border-line bg-surface p-4 sm:p-5">
              <summary className="cursor-pointer font-semibold">
                Done in the last 7 days <span className="font-normal text-muted">({done.length})</span>
              </summary>
              <ul className="mt-2 divide-y divide-line">
                {done.map((item) => (
                  <WorkRow key={item.task.id} item={item} onToggle={toggleDone} onOpen={openTask} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

/** "All" plus one button per team, each with its number of open tasks. */
function TeamFilterBar({
  groups,
  filter,
  onChange,
}: {
  groups: MyWorkGroup[];
  filter: TeamFilter;
  onChange: (filter: TeamFilter) => void;
}) {
  const open = (group: MyWorkGroup) => group.tasks.filter((task) => task.status !== "done").length;
  const total = groups.reduce((sum, group) => sum + open(group), 0);
  const options: { value: TeamFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: total },
    ...groups.map((group) => ({ value: group.team.id, label: teamLabel(group.team), count: open(group) })),
  ];

  return (
    <div role="group" aria-label="Show tasks from" className="mb-4 flex flex-wrap gap-2">
      {options.map((option) => {
        const active = filter === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`max-w-full truncate rounded-full px-3 py-1.5 text-sm ring-1 transition-colors ${
              active ? "bg-brand text-white ring-brand" : "bg-surface text-ink ring-line hover:bg-page"
            }`}
          >
            {option.label} <span className={active ? "text-white/80" : "text-muted"}>{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function teamLabel(team: TeamSummary): string {
  return team.personal ? "Personal" : team.name;
}

/** Which team a task lives in. */
export function TeamBadge({ team }: { team: TeamSummary }) {
  const Icon = team.personal ? User : Users;
  return (
    <span className="inline-flex max-w-40 items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">Team: </span>
      <span className="truncate">{teamLabel(team)}</span>
    </span>
  );
}

function WorkRow({
  item,
  onToggle,
  onOpen,
}: {
  item: MyWorkItem;
  onToggle: (item: MyWorkItem) => void;
  onOpen: (item: MyWorkItem) => void;
}) {
  const { task, team, goal } = item;
  const done = task.status === "done";
  const finished = task.subtasks.filter((s) => s.done).length;

  return (
    <li className="flex items-start gap-3 py-3">
      <DoneCheckbox task={task} onToggle={() => onToggle(item)} />

      <div className="min-w-0 flex-1">
        <TaskTitleButton task={task} team={team} onOpen={() => onOpen(item)} />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TeamBadge team={team} />
          {!done && <PriorityBadge priority={task.priority} />}
          {goal && <GoalBadge goal={goal} />}
          {task.subtasks.length > 0 && (
            <span className="text-xs text-muted">
              {finished}/{task.subtasks.length} subtasks
            </span>
          )}
          {task.dueAt && !done && <TaskDate task={task} kind="due" showLabel />}
        </div>
      </div>
    </li>
  );
}

/** The round "done" checkbox. Can't be ticked until every subtask is (clicking it explains why). */
export function DoneCheckbox({ task, onToggle }: { task: Task; onToggle: () => void }) {
  const done = task.status === "done";
  const blocked = !done && hasUnfinishedSubtasks(task);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={
        done
          ? `Mark "${task.title}" as not done`
          : blocked
            ? `Mark "${task.title}" as done (finish its subtasks first)`
            : `Mark "${task.title}" as done`
      }
      aria-disabled={blocked}
      title={blocked ? "Finish all subtasks first" : undefined}
      onClick={onToggle}
      className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors ${
        done
          ? "border-brand bg-brand text-white"
          : blocked
            ? "cursor-not-allowed border-line bg-page"
            : "border-line bg-surface hover:border-brand"
      }`}
    >
      {done && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

/** The task's title: opens its editor on the Tasks page (in its own team). */
export function TaskTitleButton({ task, team, onOpen }: { task: Task; team: TeamSummary; onOpen: () => void }) {
  const done = task.status === "done";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex max-w-full items-center gap-1 text-left text-sm font-medium hover:text-brand ${
        done ? "text-muted line-through" : ""
      }`}
    >
      <span className="truncate">{task.title}</span>
      <ChevronRight
        className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        aria-hidden
      />
      <span className="sr-only">(open in {teamLabel(team)})</span>
    </button>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center">
      <Sprout className="mx-auto size-10 text-brand" aria-hidden />
      <h2 className="mt-3 font-semibold">{filtered ? "Nothing open in this team" : "Nothing on your plate"}</h2>
      <p className="mt-1 text-sm text-muted">
        {filtered
          ? "Pick another team above, or All."
          : "Tasks you add in your personal space, and tasks assigned to you in a team, show up here."}
      </p>
    </div>
  );
}
