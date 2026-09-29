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
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTaskList } from "@/hooks/tasks-context";
import { isOverdue, STATUS_LABELS } from "@/lib/task-helpers";
import { STATUSES, type Status, type Task } from "@/lib/types";
import { GoalBadge, OverdueBadge, PriorityBadge, TagBadge, TaskDate } from "./badges";
import type { TaskActions, TaskGroups } from "./task-actions";
import { TaskMenu } from "./task-menu";
import { TimeBadge } from "./time-badge";

/** With the keyboard, Left/Right arrows jump a picked-up card straight to the next column. */
const jumpBetweenColumns: KeyboardCoordinateGetter = (event, { context }) => {
  const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  const { collisionRect, droppableRects } = context;
  if (!step || !collisionRect) return undefined;
  event.preventDefault();

  const columns = STATUSES.map((status) => droppableRects.get(status));
  const centerX = collisionRect.left + collisionRect.width / 2;
  const current = columns.findIndex((rect) => rect && centerX >= rect.left && centerX <= rect.right);
  const target = columns[current + step];
  if (current === -1 || !target) return undefined;
  return { x: target.left + (target.width - collisionRect.width) / 2, y: target.top + 48 };
};

/** Kanban board: drag a card to another column to change its status. */
export function BoardView({ groups, actions }: { groups: TaskGroups; actions: TaskActions }) {
  const [dragging, setDragging] = useState<Task | null>(null);
  // Browsers fire a "click" right after a drag ends; remember when it ended so we can ignore it.
  const dragEndedAt = useRef(0);

  const sensors = useSensors(
    // Only start dragging after the mouse moves a bit, so a normal click still opens the task.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens, press and hold briefly to drag (a quick swipe still scrolls).
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // Keyboard: focus a card, press Space, use Left/Right arrows, press Space again to drop.
    useSensor(KeyboardSensor, {
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
      coordinateGetter: jumpBetweenColumns,
    }),
  );

  function findTask(id: number) {
    return STATUSES.flatMap((status) => groups[status]).find((task) => task.id === id);
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(findTask(Number(event.active.id)) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    dragEndedAt.current = Date.now();
    const task = findTask(Number(event.active.id));
    const target = event.over?.id as Status | undefined;
    if (task && target && target !== task.status) {
      actions.onMove(task, target);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragging(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Press Enter to open this task. To move it, press Space, use the left and right arrow keys to choose a column, then press Space again to drop it. Press Escape to cancel.",
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${findTask(Number(active.id))?.title}.`,
          onDragOver: ({ over }) =>
            over ? `Over ${STATUS_LABELS[over.id as Status]}.` : "Not over a column.",
          onDragEnd: ({ over }) =>
            over ? `Dropped in ${STATUS_LABELS[over.id as Status]}.` : "Dropped.",
          onDragCancel: () => "Moving cancelled.",
        },
      }}
    >
      {/* Columns sit side by side; on small screens you scroll sideways between them. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
        {STATUSES.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={groups[status]}
            actions={actions}
            onOpen={(task) => {
              if (Date.now() - dragEndedAt.current > 200) actions.onOpen(task);
            }}
          />
        ))}
      </div>

      <DragOverlay>
        {dragging && <CardBody task={dragging} className="rotate-2 shadow-xl" />}
      </DragOverlay>
    </DndContext>
  );
}

interface ColumnProps {
  status: Status;
  tasks: Task[];
  actions: TaskActions;
  onOpen: (task: Task) => void;
}

function BoardColumn({ status, tasks, actions, onOpen }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = STATUS_LABELS[status];

  return (
    <section
      ref={setNodeRef}
      aria-label={label}
      className={`flex w-[82vw] max-w-sm shrink-0 snap-start flex-col rounded-xl border p-3 transition-colors sm:w-80 lg:w-auto lg:max-w-none ${
        isOver ? "border-brand bg-brand-soft" : "border-line bg-white"
      }`}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[15px] font-medium">
          {label} <span className="font-normal text-muted">({tasks.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => actions.onCreate(status)}
          aria-label={`Add task to ${label}`}
          className="rounded-md p-1.5 text-muted hover:bg-page hover:text-brand"
        >
          <Plus className="size-4" />
        </button>
      </div>
      <ul className="flex min-h-24 flex-1 flex-col gap-3">
        {tasks.map((task) => (
          <DraggableCard key={task.id} task={task} actions={actions} onOpen={onOpen} />
        ))}
        {tasks.length === 0 && (
          <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
            Drop tasks here
          </li>
        )}
      </ul>
    </section>
  );
}

function DraggableCard({
  task,
  actions,
  onOpen,
}: {
  task: Task;
  actions: TaskActions;
  onOpen: (task: Task) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(task);
        else listeners?.onKeyDown?.(event);
      }}
      className={`cursor-grab touch-manipulation rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody
        task={task}
        menu={
          <TaskMenu
            task={task}
            onEdit={() => actions.onOpen(task)}
            onMove={(status) => actions.onMove(task, status)}
            onDelete={() => actions.onDelete(task)}
          />
        }
      />
    </li>
  );
}

function CardBody({
  task,
  menu,
  className = "",
}: {
  task: Task;
  menu?: React.ReactNode;
  className?: string;
}) {
  const { goals } = useTaskList();
  const goal = goals.find((g) => g.id === task.goalId);
  const total = task.subtasks.length;
  const finished = task.subtasks.filter((s) => s.done).length;
  const percent = total === 0 ? 0 : Math.round((finished / total) * 100);
  const overdue = isOverdue(task);

  return (
    // "relative" keeps the hidden screen-reader text inside the card (it is absolutely positioned).
    <div
      className={`relative rounded-lg border bg-white p-3.5 ${overdue ? "border-high" : "border-line"} ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`text-sm font-medium ${
            task.status === "done" ? "text-muted line-through" : overdue ? "text-high" : ""
          }`}
        >
          {task.title}
        </h3>
        {menu}
      </div>
      {/* "empty:hidden" hides the line when there's no goal and no tracked time. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 empty:hidden">
        {goal && <GoalBadge goal={goal} />}
        <TimeBadge task={task} />
      </div>

      {total > 0 && (
        <div className="mt-2.5">
          <div className="flex justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden />
              Progress
            </span>
            <span>
              {finished}/{total} subtasks
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Subtask progress"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-2 h-1 overflow-hidden rounded-full bg-line"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {overdue && <OverdueBadge />}
        {task.tag && <TagBadge tag={task.tag} />}
        <PriorityBadge priority={task.priority} />
      </div>

      {(task.startAt || task.dueAt) && (
        <div className="mt-3 flex flex-col gap-1 text-muted">
          {task.startAt && <TaskDate task={task} kind="start" showLabel iconClassName="text-muted" />}
          {task.dueAt && <TaskDate task={task} kind="due" showLabel iconClassName="text-muted" />}
        </div>
      )}
    </div>
  );
}
