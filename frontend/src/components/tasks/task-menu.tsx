"use client";

import { EllipsisVertical } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDismiss } from "@/hooks/use-dismiss";
import { STATUS_LABELS } from "@/lib/task-helpers";
import { STATUSES, type Status, type Task } from "@/lib/types";

interface TaskMenuProps {
  task: Task;
  onEdit: () => void;
  onMove: (status: Status) => void;
  onDelete: () => void;
}

/** The "⋮" button with Edit / Move to / Delete options. */
export function TaskMenu({ task, onEdit, onMove, onDelete }: TaskMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, open, close);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      // Stop clicks here from also opening the task or starting a drag.
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Options for ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-md p-1 text-muted hover:bg-page hover:text-ink"
      >
        <EllipsisVertical className="size-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-line bg-white py-1 text-sm shadow-lg"
        >
          <MenuItem onClick={() => choose(onEdit)}>Edit</MenuItem>
          <p className="px-3 pb-1 pt-2 text-xs text-muted">Move to</p>
          {STATUSES.filter((status) => status !== task.status).map((status) => (
            <MenuItem key={status} onClick={() => choose(() => onMove(status))}>
              {STATUS_LABELS[status]}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-line" />
          <MenuItem onClick={() => choose(onDelete)} danger>
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`block w-full px-3 py-1.5 text-left hover:bg-page ${danger ? "text-high" : ""}`}
    >
      {children}
    </button>
  );
}
