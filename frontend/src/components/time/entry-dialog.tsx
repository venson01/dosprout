"use client";

import { Trash, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useTaskList } from "@/hooks/tasks-context";
import { fromDateAndTime, toDateAndTime } from "@/lib/task-helpers";
import { formatDuration } from "@/lib/time";
import type { TimeEntry, UpdateTimeEntryInput } from "@/lib/types";

interface EntryDialogProps {
  /** The entry being edited, or null to add time by hand. */
  entry: TimeEntry | null;
  onSave: (input: UpdateTimeEntryInput) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/** Today as "2026-09-29" (for a new entry's date). */
function today() {
  return toDateAndTime(new Date().toISOString()).date;
}

/**
 * Pop-up form for adding time by hand or fixing an entry: the task, the day, the
 * start and end times, and a note. An entry starts and ends on the same day here.
 */
export function EntryDialog({ entry, onSave, onDelete, onClose }: EntryDialogProps) {
  const { tasks } = useTaskList();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const start = toDateAndTime(entry?.startedAt ?? null);
  const end = toDateAndTime(entry?.endedAt ?? null);
  const [taskId, setTaskId] = useState<number | null>(entry?.taskId ?? null);
  const [date, setDate] = useState(() => start.date || today());
  const [startTime, setStartTime] = useState(start.time || "09:00");
  const [endTime, setEndTime] = useState(end.time || "10:00");
  const [note, setNote] = useState(entry?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  // <dialog> must be opened with showModal() to get the backdrop and focus trapping.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const startedAt = date && startTime ? fromDateAndTime(date, startTime) : null;
  const endedAt = date && endTime ? fromDateAndTime(date, endTime) : null;
  const duration = startedAt && endedAt ? Date.parse(endedAt) - Date.parse(startedAt) : 0;
  // Unfinished tasks first in the list; the entry's own task stays available even if done.
  const taskOptions = tasks.filter((task) => task.status !== "done" || task.id === taskId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!startedAt || !endedAt) {
      setError("Please pick a day, a start time and an end time.");
      return;
    }
    if (duration <= 0) {
      setError("The end time has to be after the start time (on the same day).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ taskId, startedAt, endedAt, note });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-heading`}
      // The Escape key fires "cancel"; route it through onClose so React state stays in sync.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-0 text-ink shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={`${ids}-heading`} className="text-lg font-semibold">
            {entry ? "Edit time" : "Add time"}
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
            <label htmlFor={`${ids}-task`} className="mb-1 block text-sm font-medium">
              Task
            </label>
            <select
              id={`${ids}-task`}
              value={taskId ?? ""}
              onChange={(e) => setTaskId(e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
            >
              <option value="">No task</option>
              {taskOptions.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${ids}-date`} className="mb-1 block text-sm font-medium">
              Day
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-start`} className="mb-1 block text-sm font-medium">
                From
              </label>
              <input
                id={`${ids}-start`}
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor={`${ids}-end`} className="mb-1 block text-sm font-medium">
                To
              </label>
              <input
                id={`${ids}-end`}
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {duration > 0 && <p className="text-sm text-muted">That&apos;s {formatDuration(duration)}.</p>}

          <div>
            <label htmlFor={`${ids}-note`} className="mb-1 block text-sm font-medium">
              Note <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id={`${ids}-note`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you work on?"
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          {entry && onDelete && (
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
            {saving ? "Saving..." : entry ? "Save changes" : "Add time"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
