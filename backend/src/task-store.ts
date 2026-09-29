import type { Client, InValue } from "@libsql/client";
import type {
  CreateSubtaskInput,
  CreateTaskInput,
  Subtask,
  Task,
  UpdateSubtaskInput,
  UpdateTaskInput,
} from "./types.js";

// Rows exactly as SQLite returns them (snake_case columns, 0/1 for booleans).
interface TaskRow {
  id: number;
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  tag: string;
  start_at: string | null;
  due_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  goal_id: number | null;
  estimate_minutes: number | null;
}

interface SubtaskRow {
  id: number;
  task_id: number;
  title: string;
  done: number;
  position: number;
}

function toSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.title,
    done: row.done === 1,
    position: row.position,
  };
}

function toTask(row: TaskRow, subtasks: Subtask[]): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    tag: row.tag,
    startAt: row.start_at,
    dueAt: row.due_at,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    goalId: row.goal_id,
    estimateMinutes: row.estimate_minutes,
    subtasks,
  };
}

/**
 * Timestamps can arrive in any valid ISO form ("2026-11-17T18:00:00+01:00").
 * Storing them all in the same UTC form lets SQLite and JavaScript compare
 * and sort them as plain text.
 */
export function toUtcTimestamp(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/**
 * Works out a task's status from its subtasks:
 * - every subtask done           -> "done"
 * - at least one subtask done    -> "in_progress"
 * - none done, but task was done -> "todo" (it isn't finished any more)
 * Otherwise (or when there are no subtasks) the status stays as it is.
 * frontend/src/lib/task-helpers.ts has a copy of this, keep them the same.
 */
export function statusFromSubtasks(status: Task["status"], subtasks: Subtask[]): Task["status"] {
  if (subtasks.length === 0) return status;
  const finished = subtasks.filter((s) => s.done).length;
  if (finished === subtasks.length) return "done";
  if (finished > 0) return "in_progress";
  return status === "done" ? "todo" : status;
}

/**
 * A task can't be "done" while some of its subtasks aren't.
 * frontend/src/lib/task-helpers.ts has a copy of this, keep them the same.
 */
export function hasUnfinishedSubtasks(task: Pick<Task, "subtasks">): boolean {
  return task.subtasks.some((subtask) => !subtask.done);
}

// SQL snippets used in several queries below.
// The current time as a UTC timestamp, e.g. "2026-11-17T16:00:00.000Z".
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
// The bottom of a status column. Needs the status as its "?" argument.
const NEXT_TASK_POSITION = "(SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE status = ?)";

// Maps API field names to database column names for fields that can be updated.
const UPDATABLE_TASK_COLUMNS = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  tag: "tag",
  startAt: "start_at",
  dueAt: "due_at",
  goalId: "goal_id",
  estimateMinutes: "estimate_minutes",
  position: "position",
} as const satisfies Record<keyof UpdateTaskInput, string>;

/**
 * All database reads and writes for tasks live here, so routes stay small.
 * Every method is async because the database may be in the cloud (Turso),
 * so each query has to wait for an answer.
 */
export class TaskStore {
  constructor(private readonly db: Client) {}

  async list(): Promise<Task[]> {
    const [taskResult, subtaskResult] = await this.db.batch(
      ["SELECT * FROM tasks ORDER BY position, id", "SELECT * FROM subtasks ORDER BY position, id"],
      "read",
    );
    const rows = taskResult.rows as unknown as TaskRow[];
    const subtaskRows = subtaskResult.rows as unknown as SubtaskRow[];

    const subtasksByTask = new Map<number, Subtask[]>();
    for (const row of subtaskRows) {
      const list = subtasksByTask.get(row.task_id) ?? [];
      list.push(toSubtask(row));
      subtasksByTask.set(row.task_id, list);
    }
    return rows.map((row) => toTask(row, subtasksByTask.get(row.id) ?? []));
  }

  async get(id: number): Promise<Task | undefined> {
    const [taskResult, subtaskResult] = await this.db.batch(
      [
        { sql: "SELECT * FROM tasks WHERE id = ?", args: [id] },
        { sql: "SELECT * FROM subtasks WHERE task_id = ? ORDER BY position, id", args: [id] },
      ],
      "read",
    );
    const row = taskResult.rows[0] as unknown as TaskRow | undefined;
    if (!row) return undefined;
    const subtaskRows = subtaskResult.rows as unknown as SubtaskRow[];
    return toTask(row, subtaskRows.map(toSubtask));
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const status = input.status ?? "todo";
    // Both inserts run in one batch (one transaction), so a task is never
    // saved without its subtasks. The subtasks can't know the new task's id
    // in advance, so they look it up: inside the transaction it's the highest id.
    const [taskResult] = await this.db.batch(
      [
        {
          sql: `INSERT INTO tasks (title, description, status, priority, tag, start_at, due_at, goal_id, estimate_minutes, position, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NEXT_TASK_POSITION}, ${status === "done" ? NOW : "NULL"})`,
          args: [
            input.title.trim(),
            input.description?.trim() ?? "",
            status,
            input.priority ?? "mid",
            input.tag?.trim() ?? "",
            toUtcTimestamp(input.startAt ?? null),
            toUtcTimestamp(input.dueAt ?? null),
            input.goalId ?? null,
            input.estimateMinutes ?? null,
            status,
          ],
        },
        ...(input.subtasks ?? []).map((title, position) => ({
          sql: `INSERT INTO subtasks (task_id, title, position)
                VALUES ((SELECT MAX(id) FROM tasks), ?, ?)`,
          args: [title.trim(), position],
        })),
      ],
      "write",
    );
    return (await this.get(Number(taskResult.lastInsertRowid)))!;
  }

  /** Returns the updated task, or undefined if no task has this id. */
  async update(id: number, input: UpdateTaskInput): Promise<Task | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;

    const assignments: string[] = [];
    const args: InValue[] = [];
    for (const [field, column] of Object.entries(UPDATABLE_TASK_COLUMNS)) {
      const value = input[field as keyof UpdateTaskInput];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      if (field === "startAt" || field === "dueAt") {
        args.push(toUtcTimestamp(value as string | null));
      } else {
        args.push(typeof value === "string" ? value.trim() : value);
      }
    }
    if (input.status && input.status !== existing.status) {
      // Moving a task to another column without a position puts it at the bottom.
      if (input.position === undefined) {
        assignments.push(`position = ${NEXT_TASK_POSITION}`);
        args.push(input.status);
      }
      // Remember when it was finished; forget it again if it's reopened.
      assignments.push(`completed_at = ${input.status === "done" ? NOW : "NULL"}`);
    }

    if (assignments.length > 0) {
      await this.db.execute({
        sql: `UPDATE tasks
              SET ${assignments.join(", ")}, updated_at = ${NOW}
              WHERE id = ?`,
        args: [...args, id],
      });
    }
    return this.get(id);
  }

  /** Returns false if no task had this id. Its subtasks and tracked time are deleted too. */
  async delete(id: number): Promise<boolean> {
    // Delete the subtasks ourselves rather than relying on ON DELETE CASCADE,
    // because that only works when SQLite's foreign key checks are switched on.
    const [, , taskResult] = await this.db.batch(
      [
        { sql: "DELETE FROM subtasks WHERE task_id = ?", args: [id] },
        { sql: "DELETE FROM time_entries WHERE task_id = ?", args: [id] },
        { sql: "DELETE FROM tasks WHERE id = ?", args: [id] },
      ],
      "write",
    );
    return taskResult.rowsAffected > 0;
  }

  /** Returns the parent task with the new subtask, or undefined if the task doesn't exist. */
  async addSubtask(taskId: number, input: CreateSubtaskInput): Promise<Task | undefined> {
    if (!(await this.get(taskId))) return undefined;
    await this.db.execute({
      sql: `INSERT INTO subtasks (task_id, title, position)
            VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM subtasks WHERE task_id = ?))`,
      args: [taskId, input.title.trim(), taskId],
    });
    return this.syncStatusWithSubtasks(taskId);
  }

  /** Returns the parent task, or undefined if the task or subtask doesn't exist. */
  async updateSubtask(
    taskId: number,
    subtaskId: number,
    input: UpdateSubtaskInput,
  ): Promise<Task | undefined> {
    const { rowsAffected } = await this.db.execute({
      sql: `UPDATE subtasks
            SET title = COALESCE(?, title), done = COALESCE(?, done)
            WHERE id = ? AND task_id = ?`,
      args: [
        input.title?.trim() ?? null,
        input.done === undefined ? null : Number(input.done),
        subtaskId,
        taskId,
      ],
    });
    if (rowsAffected === 0) return undefined;
    return this.syncStatusWithSubtasks(taskId);
  }

  /** Returns the parent task, or undefined if the task or subtask doesn't exist. */
  async deleteSubtask(taskId: number, subtaskId: number): Promise<Task | undefined> {
    const { rowsAffected } = await this.db.execute({
      sql: "DELETE FROM subtasks WHERE id = ? AND task_id = ?",
      args: [subtaskId, taskId],
    });
    if (rowsAffected === 0) return undefined;
    return this.syncStatusWithSubtasks(taskId);
  }

  /**
   * Called after any subtask change: moves the task to the status its subtasks
   * call for (see statusFromSubtasks) and marks it as updated.
   */
  private async syncStatusWithSubtasks(taskId: number): Promise<Task | undefined> {
    const task = (await this.get(taskId))!;
    const status = statusFromSubtasks(task.status, task.subtasks);
    if (status !== task.status) return this.update(taskId, { status });
    await this.db.execute({
      sql: `UPDATE tasks SET updated_at = ${NOW} WHERE id = ?`,
      args: [taskId],
    });
    return this.get(taskId);
  }
}
