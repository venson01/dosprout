import {
  AlarmClock,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Plus,
  Sprout,
  Star,
  type LucideIcon,
} from "lucide-react";
import { PriorityBadge, TagBadge } from "@/components/tasks/badges";
import type { Priority } from "@/lib/types";

/*
  A picture of the app's board view, built from HTML (no screenshot), for the landing page's hero.
  It's only a picture: role="img" + aria-label tells screen readers what it shows, and the
  example tasks inside are hidden from them.
*/

interface PreviewTask {
  title: string;
  done: number;
  total: number;
  tag: string;
  priority: Priority;
  due: string;
}

const COLUMNS: { title: string; tasks: PreviewTask[] }[] = [
  {
    title: "To Do",
    tasks: [
      { title: "Website Development", done: 0, total: 4, tag: "Work", priority: "high", due: "Nov 17" },
      { title: "Update Contact Form", done: 1, total: 4, tag: "Work", priority: "mid", due: "Nov 18" },
    ],
  },
  {
    title: "In Progress",
    tasks: [
      { title: "Integrate Payment Gateway", done: 9, total: 10, tag: "Work", priority: "low", due: "Nov 17" },
      { title: "Do back exercises", done: 4, total: 6, tag: "Health", priority: "mid", due: "Nov 19" },
    ],
  },
  {
    title: "Done",
    tasks: [{ title: "Visit a dermatologist", done: 1, total: 1, tag: "Health", priority: "high", due: "Nov 12" }],
  },
];

const NAV: { label: string; icon: LucideIcon }[] = [
  { label: "Dashboard", icon: ChartColumn },
  { label: "Tasks", icon: CircleCheck },
  { label: "Goals", icon: Star },
  { label: "Time", icon: AlarmClock },
  { label: "Calendar", icon: CalendarDays },
];

export function AppPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of DoSprout's board: tasks in To Do, In Progress and Done columns, each with subtask progress, a tag, a priority and a due date."
      className="w-full max-w-6xl overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl shadow-brand/15"
    >
      <div aria-hidden>
        {/* Browser window bar */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-2.5 rounded-full bg-high" />
          <span className="size-2.5 rounded-full bg-mid" />
          <span className="size-2.5 rounded-full bg-low" />
          <span className="ml-2 truncate rounded-full bg-page px-3 py-1 text-xs text-muted">
            dosprout.vercel.app/tasks?view=board
          </span>
        </div>

        <div className="flex text-left">
          {/* Sidebar (hidden on small screens, like a phone would show the app) */}
          <div className="hidden w-52 shrink-0 flex-col gap-1 bg-sidebar px-4 py-6 text-white md:flex">
            <div className="flex items-center gap-2 px-3 pb-6 text-lg font-semibold">
              DoSprout
              <Sprout className="size-5 text-brand" strokeWidth={2.5} />
            </div>
            {NAV.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${label === "Tasks" ? "bg-sidebar-active" : ""}`}
              >
                <Icon className="size-4.5" />
                {label}
              </div>
            ))}
          </div>

          {/* Main area */}
          <div className="min-w-0 flex-1 bg-page p-4 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <p className="text-lg font-semibold text-ink">My Tasks</p>
              <div className="flex items-center gap-3">
                <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 text-xs">
                  <span className="rounded-md px-3 py-1 text-muted">List</span>
                  <span className="rounded-md bg-brand px-3 py-1 text-white">Board</span>
                </div>
                <span className="grid size-9 place-items-center rounded-lg bg-brand text-white">
                  <Plus className="size-4.5" />
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
              {COLUMNS.map((column, columnIndex) => (
                <div key={column.title} className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-ink">
                    {column.title} <span className="text-muted">({column.tasks.length})</span>
                  </p>
                  {column.tasks.map((task, index) => (
                    // On phones only the first card of each column is shown, to keep the picture short.
                    <PreviewCard
                      key={task.title}
                      task={task}
                      className={index > 0 ? "hidden sm:flex" : "flex"}
                      // The cards pop in one after another: column by column, top to bottom.
                      delay={300 + (columnIndex * 2 + index) * 120}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * A small copy of a board card (see BoardView in components/tasks). It fades in after `delay`
 * milliseconds (animate-card-in, the Dashboard's card animation) and lifts a little on hover.
 */
function PreviewCard({ task, className, delay }: { task: PreviewTask; className: string; delay: number }) {
  const percent = Math.round((task.done / task.total) * 100);
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`${className} animate-card-in flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-brand/10 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <p className="text-sm font-medium text-ink">{task.title}</p>
      <div className="flex justify-between text-xs text-muted">
        <span>• Progress</span>
        <span>
          {task.done}/{task.total} subtasks
        </span>
      </div>
      <div className="h-1 rounded-full bg-line">
        <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <TagBadge tag={task.tag} />
        <PriorityBadge priority={task.priority} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        <CalendarDays className="size-3.5" />
        {task.due}
      </p>
    </div>
  );
}
