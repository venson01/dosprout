"use client";

import { CalendarDays, Check, Circle, CircleCheck, Pencil, Plus, Target } from "lucide-react";
import { useCallback, useState } from "react";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { useTaskList } from "@/hooks/tasks-context";
import { GOAL_COLOR_CLASSES, goalProgress, sortGoals, targetStatus } from "@/lib/goals";
import { formatDateTime } from "@/lib/task-helpers";
import type { Goal, Task } from "@/lib/types";
import { GoalDialog } from "./goal-dialog";

/** Which task the task editor shows: null task = a new one in goal `goalId`. */
type TaskEditorState = { task: Task | null; goalId?: number } | null;

/**
 * The Goals page: one card per goal with its progress (the share of its tasks that
 * are done), its target date and its tasks. Goals and tasks are edited in pop-up editors.
 */
export function GoalsView() {
  const { tasks, goals, loadState, loadError, reload, saveTask, deleteTask, saveGoal, deleteGoal, now } =
    useTaskList();
  // undefined = closed, null = creating a new goal.
  const [editingGoal, setEditingGoal] = useState<Goal | null | undefined>(undefined);
  const [taskEditor, setTaskEditor] = useState<TaskEditorState>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const sorted = sortGoals(goals, tasks);
  const reached = goals.filter((goal) => goalProgress(goal, tasks).complete).length;

  function confirmDeleteGoal(goal: Goal) {
    const count = goalProgress(goal, tasks).total;
    const keep = count > 0 ? ` Its ${count} ${count === 1 ? "task stays" : "tasks stay"}, just without a goal.` : "";
    if (!window.confirm(`Delete the goal "${goal.title}"?${keep}`)) return;
    setEditingGoal(undefined);
    deleteGoal(goal.id).catch((error: Error) => setToast(error.message));
  }

  function confirmDeleteTask(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    setTaskEditor(null);
    deleteTask(task.id).catch((error: Error) => setToast(error.message));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Goals</h1>
          {loadState === "ready" && goals.length > 0 && (
            <p className="text-sm text-muted">
              {goals.length} {goals.length === 1 ? "goal" : "goals"} · {reached} reached
            </p>
          )}
        </div>
        {loadState === "ready" && (
          <button
            type="button"
            onClick={() => setEditingGoal(null)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-hover"
          >
            <Plus className="size-4" />
            New goal
          </button>
        )}
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading goals" />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" && goals.length === 0 && (
        <div className="rounded-xl border border-line bg-surface p-10 text-center">
          <Target className="mx-auto size-10 text-brand" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">No goals yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            A goal groups tasks toward something bigger, like &ldquo;Launch my website&rdquo;.
            Its progress fills up as you finish its tasks.
          </p>
          <button
            type="button"
            onClick={() => setEditingGoal(null)}
            className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            Create your first goal
          </button>
        </div>
      )}
      {loadState === "ready" && goals.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {sorted.map((goal, index) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              tasks={tasks}
              now={now}
              delay={index * 80}
              onEdit={() => setEditingGoal(goal)}
              onOpenTask={(task) => setTaskEditor({ task })}
              onAddTask={() => setTaskEditor({ task: null, goalId: goal.id })}
            />
          ))}
        </div>
      )}

      {editingGoal !== undefined && (
        <GoalDialog
          key={editingGoal?.id ?? "new"}
          goal={editingGoal}
          onSave={async (input) => {
            await saveGoal(editingGoal, input);
          }}
          onDelete={editingGoal ? () => confirmDeleteGoal(editingGoal) : undefined}
          onClose={() => setEditingGoal(undefined)}
        />
      )}
      {taskEditor && (
        <TaskDialog
          key={taskEditor.task?.id ?? `new-${taskEditor.goalId}`}
          task={taskEditor.task}
          defaultStatus="todo"
          defaultGoalId={taskEditor.goalId}
          onSave={async (draft) => {
            await saveTask(taskEditor.task, draft);
          }}
          onDelete={taskEditor.task ? () => confirmDeleteTask(taskEditor.task!) : undefined}
          onClose={() => setTaskEditor(null)}
        />
      )}
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

/** Unfinished tasks first (soonest due on top), then the finished ones. */
function byStatusThenDue(a: Task, b: Task) {
  const doneA = a.status === "done" ? 1 : 0;
  const doneB = b.status === "done" ? 1 : 0;
  return doneA - doneB || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999");
}

function GoalCard({
  goal,
  tasks,
  now,
  delay,
  onEdit,
  onOpenTask,
  onAddTask,
}: {
  goal: Goal;
  tasks: Task[];
  now: number;
  /** How long to wait before fading in, in milliseconds. */
  delay: number;
  onEdit: () => void;
  onOpenTask: (task: Task) => void;
  onAddTask: () => void;
}) {
  const progress = goalProgress(goal, tasks);
  const target = targetStatus(goal, progress.complete, now);
  const color = GOAL_COLOR_CLASSES[goal.color];

  return (
    <section
      // The id lets the Dashboard link straight to this goal (/goals#goal-3).
      id={`goal-${goal.id}`}
      aria-labelledby={`goal-${goal.id}-title`}
      className="flex scroll-mt-20 flex-col overflow-hidden rounded-xl border border-line bg-surface animate-card-in motion-reduce:animate-none"
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* A strip in the goal's color, so goals are easy to tell apart. */}
      <div aria-hidden className={`h-1.5 ${color.fill}`} />
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={`goal-${goal.id}-title`} className="text-lg font-semibold">
              {goal.title}
            </h2>
            {goal.description && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted">{goal.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit goal "${goal.title}"`}
            className="rounded-md p-1.5 text-muted hover:bg-page hover:text-ink"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <p>
            <span className="text-3xl font-semibold">{progress.percent}%</span>
            <span className="ml-2 text-sm text-muted">
              {progress.total === 0
                ? "No tasks yet"
                : `${progress.done} of ${progress.total} ${progress.total === 1 ? "task" : "tasks"} done`}
            </span>
          </p>
          {progress.complete ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-low-bg px-2 py-1 text-xs font-medium text-low">
              <Check aria-hidden className="size-3.5" strokeWidth={3} />
              Goal reached
            </span>
          ) : (
            target && (
              <span
                className={`inline-flex items-center gap-1.5 text-sm ${target.late ? "font-medium text-high" : "text-muted"}`}
              >
                <CalendarDays aria-hidden className="size-4" />
                {target.date} · {target.text}
              </span>
            )
          )}
        </div>
        <div
          role="progressbar"
          aria-label={`Progress of "${goal.title}"`}
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-3 h-2 overflow-hidden rounded-full bg-page"
        >
          <div
            className={`h-full origin-left animate-bar-grow rounded-full transition-[width] duration-700 motion-reduce:animate-none motion-reduce:transition-none ${color.fill}`}
            style={{ width: `${progress.percent}%`, animationDelay: `${delay + 150}ms` }}
          />
        </div>

        <h3 className="mb-1 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Tasks</h3>
        {progress.total === 0 ? (
          <p className="py-2 text-sm text-muted">Add the tasks that will get you there.</p>
        ) : (
          <ul className="-mx-2">
            {[...progress.tasks].sort(byStatusThenDue).map((task) => {
              const done = task.status === "done";
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-page focus-visible:bg-page focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {done ? (
                      <CircleCheck aria-hidden className="size-4 shrink-0 text-low" />
                    ) : (
                      <Circle aria-hidden className="size-4 shrink-0 text-muted" />
                    )}
                    <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-muted line-through" : ""}`}>
                      {task.title}
                      {done && <span className="sr-only"> (done)</span>}
                    </span>
                    {task.dueAt && !done && (
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(task.dueAt)}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          onClick={onAddTask}
          className="mt-auto inline-flex items-center gap-1 self-start rounded-lg pt-3 text-sm font-medium text-brand hover:underline"
        >
          <Plus className="size-4" />
          Add task
        </button>
      </div>
    </section>
  );
}
