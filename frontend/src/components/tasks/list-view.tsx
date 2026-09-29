"use client";

import { Check, ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { useTaskList } from "@/hooks/tasks-context";
import { hasUnfinishedSubtasks, isOverdue, STATUS_LABELS } from "@/lib/task-helpers";
import { STATUSES, type Status, type Task } from "@/lib/types";
import { GoalBadge, OverdueBadge, PriorityBadge, TagBadge, TaskDate } from "./badges";
import type { TaskActions, TaskGroups } from "./task-actions";
import { TaskMenu } from "./task-menu";

// Column widths shared by the header row and every task row. The table layout
// needs a wide screen (xl); on smaller screens the details go under the title.
const ROW_GRID =
  "xl:grid xl:grid-cols-[1fr_150px_150px_100px_80px_32px] xl:items-center xl:gap-4";

export function ListView({ groups, actions }: { groups: TaskGroups; actions: TaskActions }) {
  return (
    <div className="space-y-5">
      {STATUSES.map((status) => (
        <StatusSection key={status} status={status} tasks={groups[status]} actions={actions} />
      ))}
    </div>
  );
}

function StatusSection({
  status,
  tasks,
  actions,
}: {
  status: Status;
  tasks: Task[];
  actions: TaskActions;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = STATUS_LABELS[status];

  return (
    // The id lets other pages link here (e.g. the Dashboard's "In Progress" card -> /tasks#status-in_progress).
    <section
      id={`status-${status}`}
      className="scroll-mt-20 rounded-xl border border-line bg-white px-4 pb-2 pt-3 sm:px-5"
    >
      <div className="flex items-center justify-between border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          className="flex items-center gap-2 rounded-md py-1 pr-2 text-[15px] font-medium"
        >
          <ChevronDown
            className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            aria-hidden
          />
          {label}
          <span className="font-normal text-muted">({tasks.length})</span>
        </button>
        <button
          type="button"
          onClick={() => actions.onCreate(status)}
          aria-label={`Add task to ${label}`}
          className="rounded-md p-1.5 text-muted hover:bg-page hover:text-brand"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {!collapsed && (
        <>
          <div className={`hidden py-3 text-sm text-muted ${ROW_GRID}`}>
            <span>Task</span>
            <span>Start Date</span>
            <span>Due Date</span>
            <span>Task Tags</span>
            <span>Priority</span>
            <span />
          </div>
          {tasks.length === 0 ? (
            <p className="py-4 text-sm text-muted">No tasks here.</p>
          ) : (
            <ul>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} actions={actions} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function TaskRow({ task, actions }: { task: Task; actions: TaskActions }) {
  const done = task.status === "done";
  // Can't be ticked until every subtask is (clicking it explains why).
  const blocked = !done && hasUnfinishedSubtasks(task);
  const overdue = isOverdue(task);
  const { goals } = useTaskList();
  const goal = goals.find((g) => g.id === task.goalId);
  const finished = task.subtasks.filter((s) => s.done).length;

  return (
    <li className={`flex items-start gap-3 py-2.5 xl:py-2 ${ROW_GRID}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
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
          onClick={() => actions.onToggleDone(task)}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded border transition-colors ${
            done
              ? "border-brand bg-brand text-white"
              : blocked
                ? "cursor-not-allowed border-line bg-page"
                : "border-line bg-white hover:border-brand"
          }`}
        >
          {done && <Check className="size-3.5" strokeWidth={3} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => actions.onOpen(task)}
              className={`block min-w-0 truncate text-left text-sm font-medium hover:text-brand ${
                done ? "text-muted line-through" : overdue ? "text-high" : ""
              }`}
            >
              {task.title}
            </button>
            {overdue && <OverdueBadge />}
          </div>
          {(task.subtasks.length > 0 || goal) && (
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
              {task.subtasks.length > 0 && (
                <span>
                  {finished}/{task.subtasks.length} subtasks
                </span>
              )}
              {goal && <GoalBadge goal={goal} />}
            </p>
          )}
          {/* Below xl the extra columns are shown under the title instead. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 xl:hidden">
            {task.startAt && <TaskDate task={task} kind="start" showLabel />}
            {task.dueAt && <TaskDate task={task} kind="due" showLabel />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 xl:hidden">
            {task.tag && <TagBadge tag={task.tag} />}
            <PriorityBadge priority={task.priority} />
          </div>
        </div>
      </div>
      <div className="hidden xl:block">
        <TaskDate task={task} kind="start" />
      </div>
      <div className="hidden xl:block">
        <TaskDate task={task} kind="due" />
      </div>
      <div className="hidden xl:block">
        <TagBadge tag={task.tag} />
      </div>
      <div className="hidden xl:block">
        <PriorityBadge priority={task.priority} />
      </div>
      <TaskMenu
        task={task}
        onEdit={() => actions.onOpen(task)}
        onMove={(status) => actions.onMove(task, status)}
        onDelete={() => actions.onDelete(task)}
      />
    </li>
  );
}
