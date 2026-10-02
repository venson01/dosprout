"use client";

import { Check, Download, Monitor, Moon, Plus, Sun, Trash, Upload, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DesktopNotificationsSetting } from "@/components/layout/notifications";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { useTaskList } from "@/hooks/tasks-context";
import { api } from "@/lib/api";
import { dayKey } from "@/lib/calendar";
import { playSound } from "@/lib/sounds";
import { PRIORITY_LABELS } from "@/lib/task-helpers";
import { PRIORITIES, type Priority, type Settings, type Theme, type UpdateSettingsInput } from "@/lib/types";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const FOCUS_OPTIONS = [15, 20, 25, 30, 45, 50, 60, 90];
const BREAK_OPTIONS = [3, 5, 10, 15, 20, 30];

const NOTIFICATION_OPTIONS: { key: keyof Settings["notifications"]; label: string; hint: string }[] = [
  { key: "started", label: "Task started", hint: "When a task's start time arrives." },
  { key: "dueSoon", label: "Due tomorrow", hint: "24 hours before a task is due." },
  { key: "done", label: "Task done", hint: "When a task is completed." },
  { key: "focus", label: "Focus & break", hint: "When a focus session or a break ends (desktop only)." },
];

const PRIORITY_ACTIVE: Record<Priority, string> = {
  high: "border-high bg-high-bg text-high",
  mid: "border-mid bg-mid-bg text-mid",
  low: "border-low bg-low-bg text-low",
};

const previewButtonClass =
  "inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink outline-none hover:bg-page focus-visible:ring-2 focus-visible:ring-brand";

const inputClass =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

/**
 * The Settings page. Every change is saved right away (on the server, so it's the same
 * in every browser); a "Saved" note confirms it. The Data section downloads a backup,
 * restores one, or deletes everything.
 */
export function SettingsView() {
  const { settings, saveSettings, loadState, loadError, reload } = useTaskList();
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  // When the last change was saved, for the "Saved" note (it hides itself after 2 seconds).
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), 2000);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const save = useCallback(
    (input: UpdateSettingsInput) => {
      saveSettings(input).then(
        () => setSavedAt(Date.now()),
        (error: Error) => setToast(`Couldn't save that setting: ${error.message}`),
      );
    },
    [saveSettings],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p aria-live="polite" className="ml-auto text-sm text-low">
          {savedAt !== null && (
            <span className="inline-flex items-center gap-1">
              <Check aria-hidden className="size-4" /> Saved
            </span>
          )}
        </p>
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading settings" />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" && (
        <div className="space-y-5">
          <AppearanceSection settings={settings} save={save} />
          <TimerSection settings={settings} save={save} />
          <NotificationSection settings={settings} save={save} />
          <TaskDefaultsSection settings={settings} save={save} onError={setToast} />
          <DataSection onError={setToast} onDone={reload} />
          <p className="text-center text-xs text-muted">
            Settings are saved on the server, so they&apos;re the same in every browser. There are
            no accounts yet, so everyone using this DoSprout shares them.
          </p>
        </div>
      )}
      {toast && <ErrorToast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

interface SectionProps {
  settings: Settings;
  save: (input: UpdateSettingsInput) => void;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Light, dark, or whatever the device uses. */
function AppearanceSection({ settings, save }: SectionProps) {
  return (
    <Section title="Appearance" description="System follows your device's light or dark setting.">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = settings.theme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => save({ theme: value })}
              className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand ${
                active ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-page"
              }`}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </button>
          );
        })}
      </div>
    </Section>
  );
}

/** Focus / break lengths, the timer sounds and the first day of the week. */
function TimerSection({ settings, save }: SectionProps) {
  const ids = useId();
  return (
    <Section title="Timer & calendar">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${ids}-focus`} className="mb-1 block text-sm font-medium">
            Focus session
          </label>
          <select
            id={`${ids}-focus`}
            value={settings.focusMinutes}
            onChange={(e) => save({ focusMinutes: Number(e.target.value) })}
            className={`${inputClass} w-full`}
          >
            {FOCUS_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-break`} className="mb-1 block text-sm font-medium">
            Break
          </label>
          <select
            id={`${ids}-break`}
            value={settings.breakMinutes}
            onChange={(e) => save({ breakMinutes: Number(e.target.value) })}
            className={`${inputClass} w-full`}
          >
            {BREAK_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} minutes
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-week`} className="mb-1 block text-sm font-medium">
            Weeks start on
          </label>
          <select
            id={`${ids}-week`}
            value={settings.weekStartsOn}
            onChange={(e) => save({ weekStartsOn: e.target.value === "0" ? 0 : 1 })}
            className={`${inputClass} w-full`}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </select>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p id={`${ids}-sounds`} className="text-sm font-medium">
              Timer sounds
            </p>
            <p className="text-xs text-muted">A chime when a focus session ends, and a different one when the break ends.</p>
          </div>
          <Switch
            checked={settings.timerSounds}
            onChange={(on) => save({ timerSounds: on })}
            labelledBy={`${ids}-sounds`}
          />
        </div>
        {/* Clicking these also lets the browser play sound, so they double as a test. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => playSound("focus-done")} className={previewButtonClass}>
            <Volume2 aria-hidden className="size-4" /> Play &quot;Focus done&quot;
          </button>
          <button type="button" onClick={() => playSound("break-over")} className={previewButtonClass}>
            <Volume2 aria-hidden className="size-4" /> Play &quot;Break over&quot;
          </button>
        </div>
      </div>
    </Section>
  );
}

/** An on/off switch (a real button with role="switch", so it works with the keyboard). */
function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (on: boolean) => void; labelledBy: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
        checked ? "bg-brand" : "bg-line"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

/** Which kinds of notification to show, plus the browser's desktop notifications. */
function NotificationSection({ settings, save }: SectionProps) {
  const ids = useId();
  return (
    <Section title="Notifications" description="Shown in the bell's list, as pop-ups and on the desktop.">
      <ul className="divide-y divide-line">
        {NOTIFICATION_OPTIONS.map(({ key, label, hint }) => (
          <li key={key} className="flex items-center gap-3 py-3 first:pt-0">
            <div className="min-w-0 flex-1">
              <p id={`${ids}-${key}`} className="text-sm font-medium">
                {label}
              </p>
              <p className="text-xs text-muted">{hint}</p>
            </div>
            <Switch
              checked={settings.notifications[key]}
              onChange={(on) => save({ notifications: { [key]: on } })}
              labelledBy={`${ids}-${key}`}
            />
          </li>
        ))}
      </ul>
      {/* Desktop notifications need this browser's permission, so this switch is per browser. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <DesktopNotificationsSetting />
      </div>
    </Section>
  );
}

/** Default times and priority for new tasks, and the suggested tags. */
function TaskDefaultsSection({ settings, save, onError }: SectionProps & { onError: (message: string) => void }) {
  const ids = useId();
  const [newTag, setNewTag] = useState("");

  function addTag() {
    const tag = newTag.trim();
    if (!tag) return;
    if (settings.tagSuggestions.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      onError(`"${tag}" is already in the list.`);
      return;
    }
    if (settings.tagSuggestions.length >= 20) {
      onError("You can have up to 20 suggested tags. Remove one first.");
      return;
    }
    save({ tagSuggestions: [...settings.tagSuggestions, tag] });
    setNewTag("");
  }

  return (
    <Section title="Task defaults" description="Used when you create a new task.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-start`} className="mb-1 block text-sm font-medium">
            Start time
          </label>
          <input
            id={`${ids}-start`}
            type="time"
            value={settings.defaultStartTime}
            // An emptied field isn't saved (a default time is needed).
            onChange={(e) => e.target.value && save({ defaultStartTime: e.target.value })}
            className={`${inputClass} w-full`}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-due`} className="mb-1 block text-sm font-medium">
            Due time
          </label>
          <input
            id={`${ids}-due`}
            type="time"
            value={settings.defaultDueTime}
            onChange={(e) => e.target.value && save({ defaultDueTime: e.target.value })}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1 text-sm font-medium">Priority</legend>
        <div className="flex gap-2">
          {PRIORITIES.map((priority) => {
            const active = settings.defaultPriority === priority;
            return (
              <label
                key={priority}
                className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  active ? PRIORITY_ACTIVE[priority] : "border-line text-muted hover:bg-page"
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-priority`}
                  value={priority}
                  checked={active}
                  onChange={() => save({ defaultPriority: priority })}
                  className="sr-only"
                />
                {PRIORITY_LABELS[priority]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <p id={`${ids}-tags`} className="mb-1 text-sm font-medium">
          Suggested tags
        </p>
        <ul aria-labelledby={`${ids}-tags`} className="flex flex-wrap gap-2">
          {settings.tagSuggestions.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-md bg-tag-bg py-1 pl-2.5 pr-1 text-xs font-medium text-tag">
              {tag}
              <button
                type="button"
                onClick={() => save({ tagSuggestions: settings.tagSuggestions.filter((t) => t !== tag) })}
                aria-label={`Remove the tag ${tag}`}
                className="rounded p-0.5 hover:bg-surface"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
          {settings.tagSuggestions.length === 0 && <li className="text-sm text-muted">No suggestions.</li>}
        </ul>
        <div className="mt-2 flex gap-2">
          <input
            aria-label="New tag"
            value={newTag}
            maxLength={30}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag and press Enter"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={addTag}
            aria-label="Add tag"
            className="rounded-lg border border-line px-2.5 text-muted hover:bg-page hover:text-brand"
          >
            <Plus className="size-4" />
          </button>
        </div>
      </div>
    </Section>
  );
}

/** Backup (download), restore (upload) and delete everything. */
function DataSection({ onError, onDone }: { onError: (message: string) => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function downloadBackup() {
    setBusy("export");
    try {
      const backup = await api.exportData();
      // Turn the data into a file and "click" a link to it, which downloads it.
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dosprout-backup-${dayKey(new Date())}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(`Couldn't make the backup: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function restoreBackup(file: File) {
    let backup: { tasks?: unknown[]; goals?: unknown[]; timeEntries?: unknown[] };
    try {
      backup = JSON.parse(await file.text());
    } catch {
      onError("That file isn't a DoSprout backup (it isn't valid JSON). Pick the .json file you downloaded here.");
      return;
    }
    const counts = `${backup.tasks?.length ?? 0} tasks, ${backup.goals?.length ?? 0} goals and ${backup.timeEntries?.length ?? 0} time entries`;
    const replace = window.confirm(
      `Restore "${file.name}"?\n\nThis REPLACES all your current tasks, goals, tracked time and settings with the backup's (${counts}). Download a backup of what you have now first if you might want it back.`,
    );
    if (!replace) return;
    setBusy("import");
    try {
      await api.importData(backup);
      onDone(); // Load everything again, including the restored settings.
    } catch (error) {
      onError(`Nothing was changed: ${(error as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Data" description="Your tasks, goals, tracked time and settings.">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={downloadBackup}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-brand ring-1 ring-line hover:bg-brand-soft disabled:opacity-60"
        >
          <Download className="size-4" />
          {busy === "export" ? "Preparing..." : "Download backup"}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-brand ring-1 ring-line hover:bg-brand-soft disabled:opacity-60"
        >
          <Upload className="size-4" />
          {busy === "import" ? "Restoring..." : "Restore from backup"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // So choosing the same file again still works.
            if (file) restoreBackup(file);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        The backup is a .json file with everything in it. Restoring one replaces what&apos;s here.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-high/40 bg-high-bg px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-high">Delete all data</p>
          <p className="text-xs text-muted">Deletes every task, goal and time entry. Settings are kept.</p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-high px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <Trash className="size-4" />
          Delete all
        </button>
      </div>

      {confirmingDelete && (
        <DeleteAllDialog
          onClose={() => setConfirmingDelete(false)}
          onDeleted={() => {
            setConfirmingDelete(false);
            onDone();
          }}
        />
      )}
    </Section>
  );
}

/** Asks you to type DELETE before everything is deleted, so it can't happen by accident. */
function DeleteAllDialog({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (typed !== "DELETE") return;
    setDeleting(true);
    try {
      await api.deleteAllData();
      onDeleted();
    } catch (err) {
      setError(`Nothing was deleted: ${(err as Error).message}`);
      setDeleting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${ids}-heading`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-surface p-0 text-ink shadow-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <h2 id={`${ids}-heading`} className="text-lg font-semibold">
          Delete all data?
        </h2>
        <p className="text-sm text-muted">
          This deletes every task, goal and time entry for everyone using this DoSprout. It
          can&apos;t be undone, so download a backup first if you might want them back.
        </p>
        <div>
          <label htmlFor={`${ids}-confirm`} className="mb-1 block text-sm font-medium">
            Type <span className="font-mono">DELETE</span> to confirm
          </label>
          <input
            id={`${ids}-confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className={`${inputClass} w-full`}
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-high-bg px-3 py-2 text-sm text-high">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-page hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={typed !== "DELETE" || deleting}
            className="rounded-lg bg-high px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete everything"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
