"use client";

import { ArrowUpDown, Check, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
import { useTaskList } from "@/hooks/tasks-context";
import { matchesSearch, SORT_LABELS, sortTasks, type SortMode } from "@/lib/task-helpers";
import { STATUSES, type Status, type Task } from "@/lib/types";
import { BoardView } from "./board-view";
import { ListView } from "./list-view";
import { ErrorToast, LoadError, LoadingSkeleton } from "./feedback";
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

  const dismissToast = useCallback(() => setToast(null), []);

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

      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
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
