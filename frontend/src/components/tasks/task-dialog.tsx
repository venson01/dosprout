"use client";

import { Check, Flag, Plus, Trash, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTaskList } from "@/hooks/tasks-context";
import type { DraftSubtask, TaskDraft } from "@/hooks/use-tasks";
import {
  fromDateAndTime,
  PRIORITY_LABELS,
  hasUnfinishedSubtasks,
  STATUS_LABELS,
  statusFromSubtasks,
  TAG_SUGGESTIONS,
  toDateAndTime,
} from "@/lib/task-helpers";
import { PRIORITIES, STATUSES, type Priority, type Status, type Task } from "@/lib/types";

interface TaskDialogProps {
  /** The task being edited, or null to create a new one. */
  task: Task | null;
  /** Column a new task starts in. */
  defaultStatus: Status;
  /** Due day for a new task, as "2026-11-17" (e.g. the day clicked in the calendar). */
  defaultDueDate?: string;
  /** Goal for a new task (e.g. "Add task" on a goal's card). */
  defaultGoalId?: number;
  onSave: (draft: TaskDraft) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

const PRIORITY_ACTIVE: Record<Priority, string> = {
  high: "border-high bg-high-bg text-high",
  mid: "border-mid bg-mid-bg text-mid",
  low: "border-low bg-low-bg text-low",
};

// Input look without a width, for inputs that set their own width.
const inputBase =
  "rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const inputClass = `${inputBase} w-full`;

// Filled in when you pick a date but no time yet.
const DEFAULT_START_TIME = "09:00";
const DEFAULT_DUE_TIME = "17:00";

let nextKey = 0;
const newKey = () => `new-${nextKey++}`;

function draftFromTask(
  task: Task | null,
  defaultStatus: Status,
  defaultDueDate?: string,
  defaultGoalId?: number,
): TaskDraft {
  const start = toDateAndTime(task?.startAt ?? null);
  const due =
    !task && defaultDueDate
      ? { date: defaultDueDate, time: DEFAULT_DUE_TIME }
      : toDateAndTime(task?.dueAt ?? null);
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? defaultStatus,
    priority: task?.priority ?? "mid",
    tag: task?.tag ?? "",
    startDate: start.date,
    startTime: start.time,
    dueDate: due.date,
    dueTime: due.time,
    goalId: task ? task.goalId : (defaultGoalId ?? null),
    subtasks: (task?.subtasks ?? []).map((s) => ({
      key: `id-${s.id}`,
      id: s.id,
      title: s.title,
      done: s.done,
    })),
  };
}

/**
 * Pop-up form for creating or editing a task. Nothing is saved until you press
 * the Save button, so Cancel really throws away every change.
 */
export function TaskDialog({
  task,
  defaultStatus,
  defaultDueDate,
  defaultGoalId,
  onSave,
  onDelete,
  onClose,
}: TaskDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() =>
    draftFromTask(task, defaultStatus, defaultDueDate, defaultGoalId),
  );
  const { goals } = useTaskList();
  const [newSubtask, setNewSubtask] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  // <dialog> must be opened with showModal() to get the backdrop and focus trapping.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    // showModal() focuses the first button (the X), so move focus to the title field.
    titleRef.current?.focus();
    return () => dialog?.close();
  }, []);

  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // Every subtask change goes through here, so the Status dropdown follows
  // the subtasks (the backend applies the same rule when saving).
  function setSubtasks(subtasks: DraftSubtask[]) {
    setDraft((current) => ({
      ...current,
      subtasks,
      status: statusFromSubtasks(current.status, subtasks),
    }));
  }

  function updateSubtask(key: string, changes: Partial<DraftSubtask>) {
    setSubtasks(draft.subtasks.map((s) => (s.key === key ? { ...s, ...changes } : s)));
  }

  function addSubtask() {
    const title = newSubtask.trim();
    if (!title) return;
    setSubtasks([...draft.subtasks, { key: newKey(), title, done: false }]);
    setNewSubtask("");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError("Please give the task a title.");
      return;
    }
    if (draft.subtasks.some((s) => !s.title.trim())) {
      setError("Subtasks can't be empty. Remove them or add some text.");
      return;
    }
    if (draft.status === "done" && hasUnfinishedSubtasks(draft) && task?.status !== "done") {
      setError("Tick off all subtasks before marking the task as done.");
      return;
    }
    if ((draft.startDate && !draft.startTime) || (draft.dueDate && !draft.dueTime)) {
      setError("Please pick a time for each date (or clear the date).");
      return;
    }
    const startAt = fromDateAndTime(draft.startDate, draft.startTime);
    const dueAt = fromDateAndTime(draft.dueDate, draft.dueTime);
    if (startAt && dueAt && dueAt < startAt) {
      setError("The due date can't be earlier than the start date.");
      return;
    }
    // Don't lose a subtask that was typed but not added yet.
    const pending = newSubtask.trim();
    let finalDraft = draft;
    if (pending) {
      const subtasks = [...draft.subtasks, { key: newKey(), title: pending, done: false }];
      finalDraft = { ...draft, subtasks, status: statusFromSubtasks(draft.status, subtasks) };
    }

    setSaving(true);
    setError(null);
    try {
      await onSave(finalDraft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  const titleId = `${ids}-title`;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-heading`}
      // The Escape key fires "cancel"; route it through onClose so React state stays in sync.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-ink shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={`${ids}-heading`} className="text-lg font-semibold">
            {task ? "Edit task" : "New task"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted hover:bg-page hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor={titleId} className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id={titleId}
              ref={titleRef}
              maxLength={200}
              value={draft.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What needs to be done?"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${ids}-description`} className="mb-1 block text-sm font-medium">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id={`${ids}-description`}
              rows={2}
              maxLength={2000}
              value={draft.description}
              onChange={(e) => update("description", e.target.value)}
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${ids}-status`} className="mb-1 block text-sm font-medium">
                Status
              </label>
              <select
                id={`${ids}-status`}
                value={draft.status}
                onChange={(e) => update("status", e.target.value as Status)}
                className={inputClass}
              >
                {STATUSES.map((status) => {
                  // "Done" only becomes available once every subtask is ticked.
                  const blocked = status === "done" && hasUnfinishedSubtasks(draft);
                  return (
                    <option key={status} value={status} disabled={blocked}>
                      {STATUS_LABELS[status]}
                      {blocked ? " (finish subtasks first)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
            <fieldset>
              <legend className="mb-1 block text-sm font-medium">Priority</legend>
              <div className="flex gap-2">
                {PRIORITIES.map((priority) => {
                  const active = draft.priority === priority;
                  return (
                    <button
                      key={priority}
                      type="button"
                      aria-pressed={active}
                      onClick={() => update("priority", priority)}
                      className={`flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                        active ? PRIORITY_ACTIVE[priority] : "border-line text-muted hover:bg-page"
                      }`}
                    >
                      <Flag className="size-3" aria-hidden />
                      {PRIORITY_LABELS[priority]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div>
              <label htmlFor={`${ids}-tag`} className="mb-1 block text-sm font-medium">
                Tag
              </label>
              <input
                id={`${ids}-tag`}
                list={`${ids}-tags`}
                maxLength={30}
                value={draft.tag}
                onChange={(e) => update("tag", e.target.value)}
                placeholder="e.g. Work"
                className={inputClass}
              />
              <datalist id={`${ids}-tags`}>
                {TAG_SUGGESTIONS.map((tag) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor={`${ids}-goal`} className="mb-1 block text-sm font-medium">
                Goal
              </label>
              <select
                id={`${ids}-goal`}
                value={draft.goalId ?? ""}
                onChange={(e) => update("goalId", e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
              >
                <option value="">No goal</option>
                {goals.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <DateTimeField
            label="Start"
            date={draft.startDate}
            time={draft.startTime}
            defaultTime={DEFAULT_START_TIME}
            onChange={(date, time) => setDraft((d) => ({ ...d, startDate: date, startTime: time }))}
          />
          <DateTimeField
            label="Due"
            date={draft.dueDate}
            time={draft.dueTime}
            defaultTime={DEFAULT_DUE_TIME}
            onChange={(date, time) => setDraft((d) => ({ ...d, dueDate: date, dueTime: time }))}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              Subtasks{" "}
              {draft.subtasks.length > 0 && (
                <span className="font-normal text-muted">
                  ({draft.subtasks.filter((s) => s.done).length}/{draft.subtasks.length} done)
                </span>
              )}
            </legend>
            <ul className="space-y-2">
              {draft.subtasks.map((subtask) => (
                <li key={subtask.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={subtask.done}
                    aria-label={`Done: ${subtask.title}`}
                    onClick={() => updateSubtask(subtask.key, { done: !subtask.done })}
                    className={`grid size-5 shrink-0 place-items-center rounded border ${
                      subtask.done ? "border-brand bg-brand text-white" : "border-line"
                    }`}
                  >
                    {subtask.done && <Check className="size-3.5" strokeWidth={3} />}
                  </button>
                  <input
                    aria-label="Subtask title"
                    maxLength={200}
                    value={subtask.title}
                    onChange={(e) => updateSubtask(subtask.key, { title: e.target.value })}
                    className={`${inputClass} py-1.5 ${subtask.done ? "text-muted line-through" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSubtasks(draft.subtasks.filter((s) => s.key !== subtask.key))
                    }
                    aria-label={`Remove subtask ${subtask.title}`}
                    className="rounded-md p-1.5 text-muted hover:bg-high-bg hover:text-high"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                aria-label="New subtask"
                maxLength={200}
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the subtask instead of submitting the whole form.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a subtask and press Enter"
                className={`${inputClass} py-1.5`}
              />
              <button
                type="button"
                onClick={addSubtask}
                aria-label="Add subtask"
                className="rounded-lg border border-line px-2.5 text-muted hover:bg-page hover:text-brand"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          {task && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-high hover:bg-high-bg"
            >
              <Trash className="size-4" />
              Delete
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-page hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-60"
          >
            {saving ? "Saving..." : task ? "Save changes" : "Create task"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

interface DateTimeFieldProps {
  label: string;
  date: string;
  time: string;
  defaultTime: string;
  onChange: (date: string, time: string) => void;
}

/** A date input and a time input side by side, with a button to clear both. */
function DateTimeField({ label, date, time, defaultTime, onChange }: DateTimeFieldProps) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">
        {label} date &amp; time <span className="font-normal text-muted">(optional)</span>
      </legend>
      {/* On narrow phones the time wraps onto its own line. */}
      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          aria-label={`${label} date`}
          value={date}
          // Picking a date fills in a sensible time; clearing the date clears the time.
          onChange={(e) => onChange(e.target.value, e.target.value ? time || defaultTime : "")}
          className={`${inputBase} min-w-40 flex-1`}
        />
        <div className="flex gap-2">
          <input
            type="time"
            aria-label={`${label} time`}
            value={time}
            disabled={!date}
            onChange={(e) => onChange(date, e.target.value)}
            className={`${inputBase} w-32 disabled:bg-page disabled:text-muted`}
          />
          <button
            type="button"
            onClick={() => onChange("", "")}
            aria-label={`Clear ${label.toLowerCase()} date`}
            // Hidden (but still taking up space) when there is nothing to clear.
            className={`rounded-lg px-2 text-muted hover:bg-page hover:text-ink ${date ? "" : "invisible"}`}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </fieldset>
  );
}
