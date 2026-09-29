import type { Status, Task } from "@/lib/types";

/** Things the list and board views can ask the Tasks page to do. */
export interface TaskActions {
  onOpen: (task: Task) => void;
  onCreate: (status: Status) => void;
  onMove: (task: Task, status: Status) => void;
  onToggleDone: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export type TaskGroups = Record<Status, Task[]>;
