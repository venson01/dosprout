"use client";

import { ArrowUpDown, Check, CircleAlert, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
import { useTaskList } from "@/hooks/tasks-context";
import { API_URL } from "@/lib/api";
import { matchesSearch, SORT_LABELS, sortTasks, type SortMode } from "@/lib/task-helpers";
import { STATUSES, type Status, type Task } from "@/lib/types";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import type { TaskActions, TaskGroups } from "./task-actions";
import { TaskDialog } from "./task-dialog";

type View = "list" | "board";

/** Which task the editor is showing: null task = creating a new one. */
type EditorState = { task: Task | null; status: Status } | null;

export function TasksView() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const view: View = searchParams.get("view") === "board" ? "board" : "list";

  const { tasks, loadState, loadError, reload, updateTask, deleteTask, saveTask } = useTaskList();
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [editor, setEditor] = useState<EditorState>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Hide the error message after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const groups = useMemo(() => {
    const visible = sortTasks(
      tasks.filter((task) => matchesSearch(task, query)),
      sortMode,
    );
    return Object.fromEntries(
      STATUSES.map((status) => [status, visible.filter((task) => task.status === status)]),
    ) as TaskGroups;
  }, [tasks, query, sortMode]);

  const matchCount = STATUSES.reduce((sum, status) => sum + groups[status].length, 0);

  function setView(next: View) {
    const params = new URLSearchParams(searchParams);
    if (next === "board") params.set("view", "board");
    else params.delete("view");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : "/tasks");
  }

  function clearSearch() {
    const params = new URLSearchParams(searchParams);
    params.delete("q");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : "/tasks");
  }

  function showErrors(promise: Promise<unknown>) {
    promise.catch((error: Error) => setToast(error.message));
  }

  function confirmDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return false;
    showErrors(deleteTask(task.id));
    return true;
  }

  const actions: TaskActions = {
    onOpen: (task) => setEditor({ task, status: task.status }),
    onCreate: (status) => setEditor({ task: null, status }),
    onMove: (task, status) => showErrors(updateTask(task.id, { status })),
    onToggleDone: (task) =>
      showErrors(updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })),
    onDelete: confirmDelete,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">My Tasks</h1>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label="View" className="flex rounded-lg bg-page p-1 ring-1 ring-line">
            {(["list", "board"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={`rounded-md px-4 py-1.5 text-sm capitalize transition-colors ${
                  view === option ? "bg-brand text-white shadow-sm" : "text-ink hover:bg-white"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <SortMenu value={sortMode} onChange={setSortMode} />
          <button
            type="button"
            onClick={() => actions.onCreate("todo")}
            aria-label="New task"
            className="grid size-10 place-items-center rounded-lg bg-brand text-white shadow-sm hover:bg-brand-hover"
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>

      {query && loadState === "ready" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted">
          <span>
            {matchCount} {matchCount === 1 ? "task matches" : "tasks match"}{" "}
            <span className="font-medium text-ink">&ldquo;{query}&rdquo;</span>
          </span>
          <button
            type="button"
            onClick={clearSearch}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-brand hover:bg-brand-soft"
          >
            <X className="size-3.5" /> Clear
          </button>
        </div>
      )}

      {loadState === "loading" && <LoadingSkeleton />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" &&
        (view === "board" ? (
          <BoardView groups={groups} actions={actions} />
        ) : (
          <ListView groups={groups} actions={actions} />
        ))}

      {editor && (
        <TaskDialog
          // A new key per task makes the dialog start fresh each time it opens.
          key={editor.task?.id ?? "new"}
          task={editor.task}
          defaultStatus={editor.status}
          onSave={async (draft) => {
            await saveTask(editor.task, draft);
          }}
          onDelete={
            editor.task
              ? () => {
                  if (confirmDelete(editor.task!)) setEditor(null);
                }
              : undefined
          }
          onClose={() => setEditor(null)}
        />
      )}

      {toast && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-high" />
          <p className="flex-1">{toast}</p>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <X className="size-4 text-white/70 hover:text-white" />
          </button>
        </div>
      )}
    </div>
  );
}

function SortMenu({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Sort tasks (now: ${SORT_LABELS[value]})`}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`grid size-10 place-items-center rounded-lg ring-1 ring-line hover:bg-white ${
          value !== "manual" ? "bg-brand-soft text-brand" : "bg-page text-brand"
        }`}
      >
        <ArrowUpDown className="size-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-line bg-white py-1 text-sm shadow-lg"
        >
          <p className="px-3 pb-1 pt-1.5 text-xs text-muted">Sort by</p>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="menuitemradio"
              aria-checked={value === mode}
              onClick={() => {
                onChange(mode);
                close();
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-page"
            >
              {SORT_LABELS[mode]}
              {value === mode && <Check className="size-4 text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading tasks">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-line bg-white p-5">
          <div className="h-4 w-28 rounded bg-line" />
          <div className="mt-5 space-y-3">
            <div className="h-3 w-3/4 rounded bg-page" />
            <div className="h-3 w-1/2 rounded bg-page" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-white p-6 text-center sm:p-10">
      <CircleAlert className="mx-auto size-10 text-high" />
      <h2 className="mt-3 text-lg font-semibold">Couldn&apos;t load your tasks</h2>
      <p className="mt-1 text-sm text-muted">{message}</p>
      <p className="mt-4 text-sm text-muted">
        Make sure the backend is running at <code className="text-ink">{API_URL}</code>. In a
        terminal, run <code className="rounded bg-page px-1.5 py-0.5 text-ink">cd backend</code>{" "}
        then <code className="rounded bg-page px-1.5 py-0.5 text-ink">npm run dev</code>.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Try again
      </button>
    </div>
  );
}
