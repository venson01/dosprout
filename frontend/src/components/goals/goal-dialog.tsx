"use client";

import { Check, Trash, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { GOAL_COLOR_CLASSES } from "@/lib/goals";
import { GOAL_COLORS, type CreateGoalInput, type Goal, type GoalColor } from "@/lib/types";

interface GoalDialogProps {
  /** The goal being edited, or null to create a new one. */
  goal: Goal | null;
  onSave: (input: CreateGoalInput) => Promise<void>;
  onDelete?: () => void;
  onClose: () => void;
}

const inputClass =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * Pop-up form for creating or editing a goal: title, description, color and an
 * optional target date. Built like the task editor (TaskDialog).
 */
export function GoalDialog({ goal, onSave, onDelete, onClose }: GoalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [color, setColor] = useState<GoalColor>(goal?.color ?? "blue");
  // "" = no target date (that's what an empty <input type="date"> gives).
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  // <dialog> must be opened with showModal() to get the backdrop and focus trapping.
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => dialog?.close();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Please give the goal a title.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ title, description, color, targetDate: targetDate || null });
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
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-0 text-ink shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="flex max-h-[85dvh] flex-col">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={`${ids}-heading`} className="text-lg font-semibold">
            {goal ? "Edit goal" : "New goal"}
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
            <label htmlFor={`${ids}-title`} className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              ref={titleRef}
              id={`${ids}-title`}
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Launch my website"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor={`${ids}-description`} className="mb-1 block text-sm font-medium">
              Description <span className="font-normal text-muted">(optional)</span>
            </label>
            <textarea
              id={`${ids}-description`}
              value={description}
              maxLength={1000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why it matters, or what counts as done"
              className={`${inputClass} resize-none`}
            />
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((option) => (
                <label
                  key={option}
                  // The whole swatch is the clickable label of a hidden radio button, so the
                  // keyboard (Tab + arrow keys) and screen readers work as usual.
                  className={`grid size-9 cursor-pointer place-items-center rounded-full ${GOAL_COLOR_CLASSES[option].fill} ring-offset-2 ring-offset-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                    color === option ? "ring-2 ring-ink" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name={`${ids}-color`}
                    value={option}
                    checked={color === option}
                    onChange={() => setColor(option)}
                    className="sr-only"
                  />
                  <span className="sr-only">{GOAL_COLOR_CLASSES[option].label}</span>
                  {color === option && <Check aria-hidden className="size-4 text-white" strokeWidth={3} />}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={`${ids}-target`} className="mb-1 block text-sm font-medium">
              Target date <span className="font-normal text-muted">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                id={`${ids}-target`}
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className={inputClass}
              />
              {targetDate && (
                <button
                  type="button"
                  onClick={() => setTargetDate("")}
                  className="shrink-0 rounded-lg px-3 text-sm text-muted hover:bg-page hover:text-ink"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted">
            Progress is worked out from the goal&apos;s tasks. Add tasks to it from its card, or pick
            the goal in any task&apos;s editor.
          </p>

          {error && (
            <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          {goal && onDelete && (
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
            {saving ? "Saving..." : goal ? "Save changes" : "Create goal"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
