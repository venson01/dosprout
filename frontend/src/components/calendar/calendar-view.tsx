"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { AlarmClock, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { OverdueBadge } from "@/components/tasks/badges";
import { ErrorToast, LoadError, LoadingSkeleton } from "@/components/tasks/feedback";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { useTaskList } from "@/hooks/tasks-context";
import {
  addDays,
  dayKey,
  daysBetween,
  fromDayKey,
  monthKey,
  monthWeeks,
  parseMonthKey,
  shiftTimestamp,
  startOfDay,
  taskDays,
  tasksOnDay,
  WEEKDAY_LABELS,
  weekBars,
  type WeekBar,
} from "@/lib/calendar";
import { isOverdue, STATUS_LABELS } from "@/lib/task-helpers";
import type { Priority, Task } from "@/lib/types";

// How many bars fit in a day box. More tasks show as "+2 more".
const MAX_LANES = 3;

const BAR_COLORS: Record<Priority, string> = {
  high: "bg-high-bg text-high",
  mid: "bg-mid-bg text-mid",
  low: "bg-low-bg text-low",
};
const DOT_COLORS: Record<Priority, string> = { high: "bg-high", mid: "bg-mid", low: "bg-low" };

const barColor = (task: Task) =>
  task.status === "done" ? "bg-page text-muted line-through" : BAR_COLORS[task.priority];
const dotColor = (task: Task) => (task.status === "done" ? "bg-line" : DOT_COLORS[task.priority]);

/** "Tuesday, September 30" */
const longDay = (day: Date) =>
  day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
/** "5:00 PM" */
const time = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Which task the editor shows: null task = a new one, due on `dueDate`. */
type EditorState = { task: Task | null; dueDate?: string } | null;

/** What a dragged bar knows about itself (see TaskBar). */
interface BarData {
  task: Task;
  /** The first day the bar covers in its week row, as "2026-09-30". */
  firstDay: string;
  /** How many days the bar covers in its week row. */
  days: number;
}

/** The day box a point is in, if any. */
function dayAtPoint(rects: Map<string | number, ClientRect>, x: number, y: number) {
  for (const [id, rect] of rects) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return String(id);
  }
  return undefined;
}

/**
 * Which day a dragged bar is over. With a mouse or finger: the day under the pointer.
 * With the keyboard (no pointer): the day under the bar's left end.
 */
const dayUnderPointer: CollisionDetection = ({ pointerCoordinates, collisionRect, droppableRects }) => {
  const point = pointerCoordinates ?? { x: collisionRect.left + 8, y: collisionRect.top + 8 };
  const id = dayAtPoint(droppableRects as Map<string | number, ClientRect>, point.x, point.y);
  return id ? [{ id }] : [];
};

/** With the keyboard, arrows move a picked-up bar by one day (left/right) or one week (up/down). */
const moveByDay: KeyboardCoordinateGetter = (event, { context }) => {
  const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const step = steps[event.code];
  const { collisionRect, droppableRects } = context;
  if (!step || !collisionRect) return undefined;
  event.preventDefault();

  const rects = droppableRects as Map<string | number, ClientRect>;
  const current = dayAtPoint(rects, collisionRect.left + 8, collisionRect.top + 8);
  const target = current && rects.get(dayKey(addDays(fromDayKey(current), step)));
  if (!target) return undefined; // Outside the month on screen.
  // Line the bar's left end up with the new day, just below its date.
  return { x: target.left + 4, y: target.top + 34 };
};

/**
 * How far into a bar a mouse or touch drag grabbed it, from 0 (left end) to 1 (right end).
 * Keyboard drags have no pointer: they count from the left end.
 */
function grabbedAt(event: Event | null): number {
  const x =
    event && "clientX" in event
      ? (event as MouseEvent).clientX
      : event && "touches" in event
        ? (event as TouchEvent).touches[0]?.clientX
        : undefined;
  const bar = (event?.target as Element | null)?.closest("[data-task-bar]");
  if (x === undefined || !bar) return 0;
  const rect = bar.getBoundingClientRect();
  return (x - rect.left) / rect.width;
}

/** "Starts 9:00 AM", "Due 5:00 PM", "9:00 AM – 5:00 PM" or "Ongoing, due Oct 3". */
function dayDetail(task: Task, day: Date): string {
  const key = dayKey(day);
  const starts = task.startAt && dayKey(new Date(task.startAt)) === key;
  const due = task.dueAt && dayKey(new Date(task.dueAt)) === key;
  if (starts && due) return `${time(task.startAt!)} – ${time(task.dueAt!)}`;
  if (starts) return `Starts ${time(task.startAt!)}`;
  if (due) return `Due ${time(task.dueAt!)}`;
  const end = taskDays(task)!.end;
  return `Ongoing, due ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/**
 * The Calendar page: a month grid where every task is a bar from its start day
 * to its due day. Click a bar to edit the task, click an empty spot in a day to
 * add a task due that day, and drag a bar to move the task to other days.
 * On phones it shows a small month with dots and the chosen day's tasks below.
 */
export function CalendarView() {
  const searchParams = useSearchParams();
  const { tasks, loadState, loadError, reload, updateTask, deleteTask, saveTask, now } =
    useTaskList();
  const [editor, setEditor] = useState<EditorState>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const panelRef = useRef<HTMLElement>(null);

  const [dragging, setDragging] = useState<{ task: Task; origin: Date } | null>(null);
  // Browsers fire a "click" right after a drag ends. This flag is on for a moment
  // after each drag, so that click doesn't also open the task.
  const justDragged = useRef(false);
  const sensors = useSensors(
    // Only start dragging after the mouse moves a bit, so a normal click still opens the task.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens, press and hold briefly to drag (a quick swipe still scrolls).
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Keyboard: focus a bar, press Space, move with the arrow keys, press Space again to drop.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      coordinateGetter: moveByDay,
    }),
  );

  // "now" comes from the shared clock, so "today" stays correct without reloading.
  const today = startOfDay(new Date(now));
  // The month on screen lives in the address (?month=2026-09), like ?view= on the Tasks page.
  const month =
    parseMonthKey(searchParams.get("month")) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const weeks = monthWeeks(month);
  const inMonth = (day: Date) => day.getMonth() === month.getMonth();
  // The day whose tasks are listed below the grid: the one you picked, else today, else the 1st.
  const picked = selectedKey ? fromDayKey(selectedKey) : null;
  const selected = picked && inMonth(picked) ? picked : inMonth(today) ? today : month;
  const undated = tasks.filter((task) => !task.startAt && !task.dueAt).length;

  function showMonth(target: Date) {
    const params = new URLSearchParams(searchParams);
    params.set("month", monthKey(target));
    window.history.replaceState(null, "", `?${params}`);
  }

  function selectDay(day: Date, scrollToList = false) {
    setSelectedKey(dayKey(day));
    if (scrollToList) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function showErrors(promise: Promise<unknown>) {
    promise.catch((error: Error) => setToast(error.message));
  }

  function openTask(task: Task) {
    if (!justDragged.current) setEditor({ task });
  }

  function addTask(day: Date) {
    setEditor({ task: null, dueDate: dayKey(day) });
  }

  function confirmDelete(task: Task) {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return false;
    showErrors(deleteTask(task.id));
    return true;
  }

  function handleDragStart(event: DragStartEvent) {
    const { task, firstDay, days } = event.active.data.current as BarData;
    // Work out which day of the bar was grabbed, so dropping moves it by the right amount.
    const grabbed = Math.floor(grabbedAt(event.activatorEvent) * days);
    const origin = addDays(fromDayKey(firstDay), Math.min(days - 1, Math.max(0, grabbed)));
    setDragging({ task, origin });
  }

  function handleDragEnd(event: DragEndEvent) {
    const drag = dragging;
    setDragging(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 200);
    if (!drag || !event.over) return;
    const days = daysBetween(drag.origin, fromDayKey(String(event.over.id)));
    if (days === 0) return;
    // Move the start and the due date together, so the task keeps its length and times.
    const { task } = drag;
    showErrors(
      updateTask(task.id, {
        ...(task.startAt && { startAt: shiftTimestamp(task.startAt, days) }),
        ...(task.dueAt && { dueAt: shiftTimestamp(task.dueAt, days) }),
      }),
    );
  }

  const dayTasks = tasksOnDay(tasks, selected);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        {loadState === "ready" && (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                showMonth(today);
                selectDay(today);
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-line hover:bg-white"
            >
              Today
            </button>
            <div className="flex items-center rounded-lg ring-1 ring-line">
              <button
                type="button"
                onClick={() => showMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                aria-label="Previous month"
                className="rounded-l-lg p-2 hover:bg-white"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h2 aria-live="polite" className="w-36 text-center text-sm font-semibold">
                {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </h2>
              <button
                type="button"
                onClick={() => showMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                aria-label="Next month"
                className="rounded-r-lg p-2 hover:bg-white"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => addTask(selected)}
              aria-label="New task"
              className="grid size-10 place-items-center rounded-lg bg-brand text-white shadow-sm hover:bg-brand-hover"
            >
              <Plus className="size-5" />
            </button>
          </div>
        )}
      </div>

      {loadState === "loading" && <LoadingSkeleton label="Loading calendar" />}
      {loadState === "error" && <LoadError message={loadError} onRetry={reload} />}
      {loadState === "ready" && (
        <>
          {/* Big screens: the full month with task bars. */}
          <DndContext
            sensors={sensors}
            collisionDetection={dayUnderPointer}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setDragging(null)}
            accessibility={{
              screenReaderInstructions: {
                draggable:
                  "Press Enter to open this task. To move it to other days, press Space, use the arrow keys (left and right for a day, up and down for a week), then press Space again to drop it. Press Escape to cancel.",
              },
              announcements: {
                onDragStart: () => `Picked up ${dragging?.task.title ?? "task"}.`,
                onDragOver: ({ over }) =>
                  over ? `Over ${longDay(fromDayKey(String(over.id)))}.` : "Not over a day.",
                onDragEnd: ({ over }) =>
                  over ? `Dropped on ${longDay(fromDayKey(String(over.id)))}.` : "Dropped.",
                onDragCancel: () => "Moving cancelled.",
              },
            }}
          >
            <div className="hidden overflow-hidden rounded-xl border border-line bg-white md:block">
              <div className="grid grid-cols-7 border-b border-line bg-page text-xs font-medium text-muted">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="px-2 py-2">
                    {label}
                  </div>
                ))}
              </div>
              {weeks.map((week, weekIndex) => (
                <WeekRow
                  key={dayKey(week[0])}
                  week={week}
                  weekIndex={weekIndex}
                  bars={weekBars(week, tasks)}
                  inMonth={inMonth}
                  todayKey={dayKey(today)}
                  selectedKey={dayKey(selected)}
                  onAdd={addTask}
                  onSelect={selectDay}
                  onOpen={openTask}
                />
              ))}
            </div>
            <DragOverlay>
              {dragging && (
                <div
                  className={`flex h-6 w-full items-center rounded-md px-2 text-xs font-medium shadow-lg ${barColor(dragging.task)}`}
                >
                  <span className="truncate">{dragging.task.title}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Phones: a small month with a dot per task. Tap a day to list its tasks below. */}
          <div className="rounded-xl border border-line bg-white p-2 md:hidden">
            <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-muted">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label}>{label.slice(0, 2)}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {weeks.flat().map((day) => {
                const tasksThatDay = tasksOnDay(tasks, day);
                const isToday = dayKey(day) === dayKey(today);
                const isSelected = dayKey(day) === dayKey(selected);
                return (
                  <button
                    key={dayKey(day)}
                    type="button"
                    onClick={() => selectDay(day)}
                    aria-pressed={isSelected}
                    aria-label={`${longDay(day)}, ${tasksThatDay.length} ${tasksThatDay.length === 1 ? "task" : "tasks"}`}
                    className={`flex h-12 flex-col items-center gap-1 rounded-lg pt-1 outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      isSelected ? "bg-brand-soft" : ""
                    }`}
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full text-sm ${
                        isToday
                          ? "bg-brand font-semibold text-white"
                          : inMonth(day)
                            ? "text-ink"
                            : "text-muted"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                    <span aria-hidden className="flex gap-0.5">
                      {tasksThatDay.slice(0, 3).map((task) => (
                        <span key={task.id} className={`size-1.5 rounded-full ${dotColor(task)}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* The chosen day's tasks (on every screen size). */}
          <section
            ref={panelRef}
            aria-labelledby="day-heading"
            className="mt-5 scroll-mt-20 rounded-xl border border-line bg-white"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <h2 id="day-heading" className="font-semibold">
                {longDay(selected)}
              </h2>
              <button
                type="button"
                onClick={() => addTask(selected)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand hover:bg-brand-soft"
              >
                <Plus className="size-4" /> Add task
              </button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Nothing planned for this day.</p>
            ) : (
              <ul className="divide-y divide-line">
                {dayTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => openTask(task)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none hover:bg-page focus-visible:bg-page"
                    >
                      <span aria-hidden className={`size-2.5 shrink-0 rounded-full ${dotColor(task)}`} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-sm font-medium ${
                            task.status === "done" ? "text-muted line-through" : ""
                          }`}
                        >
                          {task.title}
                        </span>
                        <span className="block text-xs text-muted">
                          {dayDetail(task, selected)} · {STATUS_LABELS[task.status]}
                        </span>
                      </span>
                      {isOverdue(task) && <OverdueBadge />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {undated > 0 && (
            <p className="mt-3 text-sm text-muted">
              {undated} {undated === 1 ? "task has" : "tasks have"} no dates, so{" "}
              {undated === 1 ? "it isn't" : "they aren't"} on the calendar.{" "}
              <Link href="/tasks" className="font-medium text-brand hover:underline">
                See all tasks
              </Link>
            </p>
          )}
        </>
      )}

      {editor && (
        <TaskDialog
          // A new key each time makes the dialog start fresh.
          key={editor.task?.id ?? `new-${editor.dueDate}`}
          task={editor.task}
          defaultStatus="todo"
          defaultDueDate={editor.dueDate}
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

interface WeekRowProps {
  week: Date[];
  weekIndex: number;
  bars: WeekBar[];
  inMonth: (day: Date) => boolean;
  todayKey: string;
  selectedKey: string;
  onAdd: (day: Date) => void;
  onSelect: (day: Date, scrollToList?: boolean) => void;
  onOpen: (task: Task) => void;
}

/** One week of the big calendar: 7 day boxes with the task bars laid over them. */
function WeekRow({ week, weekIndex, bars, inMonth, todayKey, selectedKey, onAdd, onSelect, onOpen }: WeekRowProps) {
  // Tasks that don't fit in a day box are counted as "+N more".
  const hidden = week.map(
    (_, column) =>
      bars.filter((bar) => bar.lane >= MAX_LANES && bar.from <= column && column <= bar.to).length,
  );

  return (
    <div className="relative grid h-36 grid-cols-7 border-b border-line last:border-b-0">
      {week.map((day, column) => (
        <DayBox
          key={dayKey(day)}
          day={day}
          inMonth={inMonth(day)}
          isToday={dayKey(day) === todayKey}
          isSelected={dayKey(day) === selectedKey}
          hiddenCount={hidden[column]}
          onAdd={onAdd}
          onSelect={onSelect}
        />
      ))}
      {/* The bars sit on top of the day boxes, under the dates. "pointer-events-none" lets
          clicks between bars fall through to the day box underneath. */}
      <div className="pointer-events-none absolute inset-x-0 top-8 grid auto-rows-[1.5rem] grid-cols-7 gap-y-1">
        {bars
          .filter((bar) => bar.lane < MAX_LANES)
          .map((bar) => (
            <TaskBar
              key={bar.task.id}
              bar={bar}
              weekIndex={weekIndex}
              firstDay={dayKey(week[bar.from])}
              onOpen={onOpen}
            />
          ))}
      </div>
    </div>
  );
}

interface DayBoxProps {
  day: Date;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  hiddenCount: number;
  onAdd: (day: Date) => void;
  onSelect: (day: Date, scrollToList?: boolean) => void;
}

/** One day of the big calendar. Bars can be dropped on it. */
function DayBox({ day, inMonth, isToday, isSelected, hiddenCount, onAdd, onSelect }: DayBoxProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) });
  const label = longDay(day);

  return (
    <div
      ref={setNodeRef}
      className={`relative border-l border-line first:border-l-0 ${
        isOver ? "bg-brand-soft" : inMonth ? "" : "bg-page/60"
      }`}
    >
      {/* The whole box is a button that adds a task due this day; the date and bars sit on top. */}
      <button
        type="button"
        onClick={() => onAdd(day)}
        aria-label={`Add a task due ${label}`}
        className="group absolute inset-0 outline-none hover:bg-page/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <Plus aria-hidden className="absolute right-1.5 top-2 size-4 text-muted opacity-0 group-hover:opacity-100" />
      </button>
      <button
        type="button"
        onClick={() => onSelect(day)}
        aria-label={`Show the tasks of ${label}`}
        aria-pressed={isSelected}
        className={`relative m-0.5 grid size-7 place-items-center rounded-full text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand ${
          isToday
            ? "bg-brand font-semibold text-white"
            : isSelected
              ? "bg-brand-soft font-semibold text-brand"
              : inMonth
                ? "text-ink hover:bg-page"
                : "text-muted hover:bg-page"
        } ${isSelected && isToday ? "ring-2 ring-brand/30" : ""}`}
      >
        {day.getDate()}
      </button>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => onSelect(day, true)}
          className="absolute bottom-1 left-1 rounded px-1.5 text-xs font-medium text-muted hover:bg-page hover:text-ink"
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}

/** A task's bar inside one week. Click to edit, drag to move to other days. */
function TaskBar({
  bar,
  weekIndex,
  firstDay,
  onOpen,
}: {
  bar: WeekBar;
  weekIndex: number;
  firstDay: string;
  onOpen: (task: Task) => void;
}) {
  const { task } = bar;
  const data: BarData = { task, firstDay, days: bar.to - bar.from + 1 };
  // A long task has one bar per week, so each bar needs its own id.
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `${task.id}@${weekIndex}`,
    data,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(task);
        else listeners?.onKeyDown?.(event);
      }}
      data-task-bar
      title={task.title}
      style={{ gridColumn: `${bar.from + 1} / ${bar.to + 2}`, gridRow: bar.lane + 1 }}
      className={`pointer-events-auto flex cursor-grab items-center gap-1 overflow-hidden px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing ${barColor(task)} ${
        // Square ends show that the task continues into the week before / after.
        bar.startsBefore ? "" : "ml-1 rounded-l-md"
      } ${bar.endsAfter ? "" : "mr-1 rounded-r-md"} ${isDragging ? "opacity-40" : ""}`}
    >
      {isOverdue(task) && <AlarmClock aria-label="Overdue" className="size-3 shrink-0" />}
      <span className="truncate">{task.title}</span>
    </div>
  );
}
